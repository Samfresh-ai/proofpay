"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { getAddress, type Hash } from "viem";

import type { InvoiceView } from "@/lib/proofpay";
import {
  createFrozenFundingIntent,
  fundingIntentInvalidationReason,
  nextFundingStep,
  type FrozenFundingIntent,
} from "@/lib/funding-intent";
import { buildEvidenceManifest, type CanonicalManifest, type EvidenceManifest } from "@/lib/proofpay-manifests";
import {
  fxrpAbi,
  proofPayAbi,
  PROOFPAY_CONTRACT_ADDRESS,
  PROOFPAY_DEFAULT_TOLERANCE_BPS,
  PROOFPAY_FXRP_ADDRESS,
  PROOFPAY_QUOTE_LIFETIME_SECONDS,
} from "@/lib/proofpay-contract";
import {
  applyTolerance,
  buildApprovalIntent,
  buildFundingIntent,
  buildFundingPlan,
  buildReleaseIntent,
  buildTopUpIntent,
  buildTransactionIntent,
  decodeProofPayError,
  formatAtomicUnits,
  formatFxrpAmount,
  formatQuoteTimestamp,
  isExplicitWalletRejection,
  transactionIntentInvalidationReason,
  type ReleaseQuote,
  type TransactionIntent,
} from "@/lib/transaction-intents";
import type { JournalStatus } from "@/lib/transaction-journal";
import { deriveInvoiceActions, type InvoiceWalletAction } from "@/lib/wallet-policy";

import { useProofPayWallet } from "./use-proofpay-wallet";
import { useFundingIntent } from "./use-funding-intent";
import { useTransactionJournal } from "./use-transaction-journal";
import {
  TransactionIntentReview,
  TransactionJournalView,
  WalletConnectionPanel,
} from "./wallet-ui";

interface FundingPreview {
  intent: FrozenFundingIntent;
  allowanceFxrp: bigint | null;
}

interface PreparedAction {
  intent: TransactionIntent;
  guardIntent?: TransactionIntent;
  send: () => Promise<Hash>;
  status: Exclude<JournalStatus, "abandoned">;
  transactionHash: Hash | null;
  error: string | null;
  evidenceManifest?: CanonicalManifest<EvidenceManifest> & { primaryEvidenceUri: string };
}

function quoteDeadline(): bigint {
  return BigInt(Math.floor(Date.now() / 1_000)) + PROOFPAY_QUOTE_LIFETIME_SECONDS;
}

function priceDisplay(value: bigint, decimals: number): string {
  return `$${formatAtomicUnits(value, decimals)}`;
}

function toleranceLabel(value: bigint): string {
  return `${Number(value) / 100}%`;
}

function walletRoleDisplay(role: ReturnType<typeof deriveInvoiceActions>["role"]): string {
  switch (role) {
    case "client": return "Client";
    case "freelancer": return "Freelancer";
    case "unrelated": return "Read-only wallet";
    default: return "Connect to determine role";
  }
}

function actionFocusHeading(
  invoice: InvoiceView,
  policy: ReturnType<typeof deriveInvoiceActions>,
  releaseQuote: ReleaseQuote | null,
): string {
  const actions = policy.actions;
  if (policy.role === "disconnected") return "Connect wallet to check the next action";
  if (policy.role === "unrelated") return "Read-only milestone";
  if (
    actions.includes("top_up")
    || (policy.role === "client" && releaseQuote !== null && releaseQuote.topUpFxrp > 0n)
  ) return "Add the required top-up";
  if (actions.includes("cancel")) return "Cancel this unfunded milestone";
  if (actions.includes("refund")) return "Return locked FXRP to the client";
  if (actions.includes("fund")) {
    return `Fund this ${invoice.usdTarget?.display ?? "USD-priced"} milestone`;
  }
  if (actions.includes("submit_evidence")) return "Attach delivery evidence";
  if (actions.includes("release")) return "Release payment";
  if (invoice.status === "SUBMITTED" && policy.role === "client" && releaseQuote === null) {
    return "Refresh the release preview";
  }
  return "No wallet action is available";
}

export function InvoiceActions({ invoice }: { invoice: InvoiceView }) {
  const router = useRouter();
  const wallet = useProofPayWallet();
  const journal = useTransactionJournal(wallet.actionClient);
  const fundingIntent = useFundingIntent(invoice.id, wallet.account);
  const [toleranceBps, setToleranceBps] = useState(PROOFPAY_DEFAULT_TOLERANCE_BPS);
  const [fundingPreview, setFundingPreview] = useState<FundingPreview | null>(null);
  const [releaseQuote, setReleaseQuote] = useState<ReleaseQuote | null>(null);
  const [evidenceUrls, setEvidenceUrls] = useState("");
  const [walletActionsCommit, setWalletActionsCommit] = useState("");
  const [completionNote, setCompletionNote] = useState("");
  const [prepared, setPrepared] = useState<PreparedAction | null>(null);
  const signingIntentRef = useRef<Hash | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [mountedAt] = useState(() => BigInt(Math.floor(Date.now() / 1_000)));

  const policy = useMemo(() => deriveInvoiceActions({
    account: wallet.account ?? null,
    client: invoice.client,
    freelancer: invoice.freelancer,
    status: invoice.status === "UNKNOWN" ? "CREATED" : invoice.status,
    deliveryDeadline: BigInt(invoice.deadline?.unix ?? "0"),
    now: mountedAt,
    quoteTopUpAtomic: releaseQuote?.topUpFxrp ?? null,
  }), [invoice, mountedAt, releaseQuote, wallet.account]);

  const actionClient = wallet.actionClient;
  const invoiceId = BigInt(invoice.id);
  const usdTargetAtomic = BigInt(invoice.usdTarget?.atomic ?? "0");
  const lockedFxrp = BigInt(invoice.currentFxrpLocked?.atomic ?? "0");

  useEffect(() => {
    if (!fundingIntent.intent || !wallet.account || wallet.chainId === undefined) return;
    const reason = fundingIntentInvalidationReason(fundingIntent.intent, {
      account: getAddress(wallet.account),
      chainId: wallet.chainId,
      invoiceId,
      nowSeconds: BigInt(Math.floor(Date.now() / 1_000)),
    });
    if (!reason) return;
    fundingIntent.clear(fundingIntent.intent.intentHash);
  }, [fundingIntent, invoiceId, wallet.account, wallet.chainId]);

  useEffect(() => {
    if (!prepared) return;
    const invalidation = transactionIntentInvalidationReason(prepared.intent, {
      account: wallet.account ?? null,
      chainId: wallet.chainId,
      contract: PROOFPAY_CONTRACT_ADDRESS,
      invoiceId,
    });
    if (!invalidation) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const journalEntry = journal.currentEntry(prepared.intent.intentHash);
      if (journalEntry?.status === "prepared" && journalEntry.transactionHash === null) {
        journal.abandon(prepared.intent.intentHash);
      }
      setPrepared(null);
      setActionError("The prepared transaction was invalidated after its wallet or invoice context changed. Preview it again.");
    });
    return () => {
      cancelled = true;
    };
  }, [invoiceId, journal, prepared, wallet.account, wallet.chainId]);

  const visibleFundingPreview = fundingIntent.intent
    ? fundingPreview?.intent.intentHash === fundingIntent.intent.intentHash
      ? fundingPreview
      : { intent: fundingIntent.intent, allowanceFxrp: null }
    : null;

  const assertReady = (action?: InvoiceWalletAction) => {
    if (wallet.chainState !== "ready" || !wallet.account || !actionClient) {
      throw new Error(wallet.chainState === "wrong_network"
        ? "Switch the connected wallet to Coston2 before simulating this action."
        : "Connect an injected wallet before simulating this action.");
    }
    if (action && !policy.actions.includes(action)) {
      throw new Error("This wallet is not authorized for that action in the current invoice state.");
    }
    return { account: getAddress(wallet.account), client: actionClient };
  };

  const blockingEntryForIntent = (intent: TransactionIntent) => {
    const scope = {
      chainId: intent.chainId,
      contract: intent.contract,
      account: intent.account,
      invoiceId: intent.invoiceId,
    };
    return intent.action === "top_up"
      ? journal.blocking({ ...scope, action: "top_up", intentHash: intent.intentHash })
      : journal.blocking({ ...scope, action: intent.action });
  };

  const assertIntentAvailable = (intent: TransactionIntent) => {
    const blocking = blockingEntryForIntent(intent);
    if (blocking) {
      throw new Error(`A ${blocking.status} ${blocking.action.replaceAll("_", " ")} intent already exists for this invoice. Reconcile or abandon it before preparing another.`);
    }
  };

  const acceptPrepared = (next: PreparedAction) => {
    assertIntentAvailable(next.intent);
    journal.prepare(next.intent);
    setPrepared(next);
  };

  const prepareFunding = async () => {
    setActionError(null);
    setPreparing(true);
    let activeFundingIntent = fundingIntent.intent;
    try {
      const { account, client } = assertReady("fund");
      const nowSeconds = BigInt(Math.floor(Date.now() / 1_000));
      let frozen = activeFundingIntent;
      if (frozen) {
        const invalidation = fundingIntentInvalidationReason(frozen, {
          account,
          chainId: wallet.chainId ?? 0,
          invoiceId,
          nowSeconds,
        });
        if (invalidation) {
          fundingIntent.clear(frozen.intentHash);
          setFundingPreview(null);
          frozen = null;
        }
      }

      const allowance = await client.readContract({
        address: PROOFPAY_FXRP_ADDRESS,
        abi: fxrpAbi,
        functionName: "allowance",
        args: [account, PROOFPAY_CONTRACT_ADDRESS],
      });

      if (!frozen) {
        const quote = await client.simulateContract({
          account,
          address: PROOFPAY_CONTRACT_ADDRESS,
          abi: proofPayAbi,
          functionName: "quoteFunding",
          args: [invoiceId],
        });
        const [requiredFxrp, price, priceDecimals, priceTimestamp] = quote.result;
        const plan = buildFundingPlan({
          usdTargetAtomic,
          quoteRequiredFxrp: requiredFxrp,
          price,
          priceDecimals,
          toleranceBps,
          allowanceFxrp: allowance,
        });
        frozen = createFrozenFundingIntent({
          account,
          invoiceId,
          plan,
          price,
          priceDecimals,
          priceTimestamp,
          quoteDeadline: quoteDeadline(),
        });
        fundingIntent.freeze(frozen);
        activeFundingIntent = frozen;
      }

      setFundingPreview({ intent: frozen, allowanceFxrp: allowance });
      const maximumFxrp = BigInt(frozen.maximumFxrp);

      if (nextFundingStep(frozen, allowance) === "approve") {
        const approval = await client.simulateContract({
          account,
          address: PROOFPAY_FXRP_ADDRESS,
          abi: fxrpAbi,
          functionName: "approve",
          args: [PROOFPAY_CONTRACT_ADDRESS, maximumFxrp],
        });
        const intent = buildApprovalIntent({ account, invoiceId, maximumFxrp });
        acceptPrepared({
          intent,
          send: async () => await client.writeContract(approval.request),
          status: "prepared",
          transactionHash: null,
          error: null,
        });
        return;
      }

      const funding = await client.simulateContract({
        account,
        address: PROOFPAY_CONTRACT_ADDRESS,
        abi: proofPayAbi,
        functionName: "fundInvoice",
        args: [invoiceId, maximumFxrp, BigInt(frozen.quoteDeadline)],
      });
      const intent = buildFundingIntent({
        account,
        invoiceId,
        usdTargetAtomic,
        requiredFxrp: BigInt(frozen.previewRequiredFxrp),
        maximumFxrp,
        quoteDeadline: BigInt(frozen.quoteDeadline),
      });
      acceptPrepared({
        intent,
        send: async () => await client.writeContract(funding.request),
        status: "prepared",
        transactionHash: null,
        error: null,
      });
    } catch (error) {
      const message = decodeProofPayError(error);
      if (/expired|exceeds the maximum/iu.test(message) && activeFundingIntent) {
        fundingIntent.clear(activeFundingIntent.intentHash);
        setFundingPreview(null);
      }
      setActionError(error instanceof Error && !/execution reverted|simulation/iu.test(error.message)
        ? error.message
        : message);
    } finally {
      setPreparing(false);
    }
  };

  const prepareEvidence = async () => {
    setActionError(null);
    setPreparing(true);
    try {
      const { account, client } = assertReady("submit_evidence");
      const confirmedHash = (action: "create" | "approve" | "fund") => [...journal.entries]
        .reverse()
        .find((entry) => entry.invoiceId === invoice.id && entry.action === action && entry.status === "confirmed")
        ?.transactionHash ?? undefined;
      const createTransaction = confirmedHash("create");
      const approvalTransaction = confirmedHash("approve");
      const fundingTransaction = confirmedHash("fund");
      const manifest = buildEvidenceManifest({
        deliveryUrls: evidenceUrls.split("\n").filter((value) => value.trim()),
        completionNote,
        milestoneTitle: invoice.title,
        ...(createTransaction ? { createTransaction } : {}),
        ...(approvalTransaction ? { approvalTransaction } : {}),
        ...(fundingTransaction ? { fundingTransaction } : {}),
        ...(walletActionsCommit.trim() ? { walletActionsCommit } : {}),
      });
      const simulation = await client.simulateContract({
        account,
        address: PROOFPAY_CONTRACT_ADDRESS,
        abi: proofPayAbi,
        functionName: "submitEvidence",
        args: [invoiceId, manifest.hash, manifest.primaryEvidenceUri],
      });
      const intent = buildTransactionIntent({
        action: "submit_evidence",
        actionLabel: "Submit this evidence commitment",
        account,
        invoiceId: invoiceId.toString(),
        token: "None",
        tokenAddress: null,
        amountAtomic: null,
        amountDisplay: "No token transfer",
        quoteDeadline: null,
        maximumAtomic: null,
        maximumDisplay: "Not applicable",
        expectedResult: `Store ${manifest.hash} with the primary public evidence URL and move the invoice to SUBMITTED. This does not prove delivery quality.`,
      });
      acceptPrepared({
        intent,
        evidenceManifest: manifest,
        send: async () => await client.writeContract(simulation.request),
        status: "prepared",
        transactionHash: null,
        error: null,
      });
    } catch (error) {
      setActionError(error instanceof Error && !/execution reverted|simulation/iu.test(error.message)
        ? error.message
        : decodeProofPayError(error));
    } finally {
      setPreparing(false);
    }
  };

  const prepareReleaseOrTopUp = async () => {
    setActionError(null);
    setPreparing(true);
    try {
      const { account, client } = assertReady();
      if (policy.role !== "client" || invoice.status !== "SUBMITTED") {
        throw new Error("Only the connected client can preview settlement for a submitted invoice.");
      }
      const preview = await client.simulateContract({
        account,
        address: PROOFPAY_CONTRACT_ADDRESS,
        abi: proofPayAbi,
        functionName: "quoteRelease",
        args: [invoiceId],
      });
      const [payoutFxrp, refundFxrp, topUpFxrp, price, priceDecimals, priceTimestamp] = preview.result;
      if (topUpFxrp > payoutFxrp || (topUpFxrp > 0n && refundFxrp > 0n)) {
        throw new Error("The release quote returned inconsistent lock accounting.");
      }
      const observedLockedFxrp = topUpFxrp > 0n
        ? payoutFxrp - topUpFxrp
        : payoutFxrp + refundFxrp;
      const quote: ReleaseQuote = {
        lockedFxrp: observedLockedFxrp,
        payoutFxrp,
        refundFxrp,
        topUpFxrp,
        price,
        priceDecimals,
        priceTimestamp,
      };
      setReleaseQuote(quote);
      const deadline = quoteDeadline();

      if (topUpFxrp > 0n) {
        const maximumFxrp = applyTolerance(topUpFxrp, toleranceBps);
        const intent = buildTopUpIntent({
          account,
          invoiceId,
          lockedFxrp: quote.lockedFxrp,
          shortfallFxrp: topUpFxrp,
          maximumFxrp,
          quoteDeadline: deadline,
          price,
          priceDecimals,
          priceTimestamp,
        });
        assertIntentAvailable(intent);
        const allowance = await client.readContract({
          address: PROOFPAY_FXRP_ADDRESS,
          abi: fxrpAbi,
          functionName: "allowance",
          args: [account, PROOFPAY_CONTRACT_ADDRESS],
        });
        assertIntentAvailable(intent);
        if (allowance < maximumFxrp) {
          const approval = await client.simulateContract({
            account,
            address: PROOFPAY_FXRP_ADDRESS,
            abi: fxrpAbi,
            functionName: "approve",
            args: [PROOFPAY_CONTRACT_ADDRESS, maximumFxrp],
          });
          assertIntentAvailable(intent);
          const approvalIntent = buildApprovalIntent({ account, invoiceId, maximumFxrp });
          acceptPrepared({
            intent: approvalIntent,
            guardIntent: intent,
            send: async () => await client.writeContract(approval.request),
            status: "prepared",
            transactionHash: null,
            error: null,
          });
          return;
        }
        const simulation = await client.simulateContract({
          account,
          address: PROOFPAY_CONTRACT_ADDRESS,
          abi: proofPayAbi,
          functionName: "topUp",
          args: [invoiceId, maximumFxrp, deadline],
        });
        acceptPrepared({
          intent,
          send: async () => await client.writeContract(simulation.request),
          status: "prepared",
          transactionHash: null,
          error: null,
        });
        return;
      }

      const maximumFxrp = applyTolerance(payoutFxrp, toleranceBps);
      const simulation = await client.simulateContract({
        account,
        address: PROOFPAY_CONTRACT_ADDRESS,
        abi: proofPayAbi,
        functionName: "release",
        args: [invoiceId, maximumFxrp, deadline],
      });
      const intent = buildReleaseIntent({
        account,
        invoiceId,
        payoutFxrp,
        refundFxrp,
        maximumFxrp,
        quoteDeadline: deadline,
      });
      acceptPrepared({
        intent,
        send: async () => await client.writeContract(simulation.request),
        status: "prepared",
        transactionHash: null,
        error: null,
      });
    } catch (error) {
      setActionError(error instanceof Error && !/execution reverted|simulation/iu.test(error.message)
        ? error.message
        : decodeProofPayError(error));
    } finally {
      setPreparing(false);
    }
  };

  const prepareSimpleAction = async (action: "cancel" | "refund") => {
    setActionError(null);
    setPreparing(true);
    try {
      const policyAction: InvoiceWalletAction = action;
      const { account, client } = assertReady(policyAction);
      const functionName = action === "cancel" ? "cancelBeforeFunding" : "refundUnsubmittedAfterDeadline";
      const simulation = await client.simulateContract({
        account,
        address: PROOFPAY_CONTRACT_ADDRESS,
        abi: proofPayAbi,
        functionName,
        args: [invoiceId],
      });
      const intent = buildTransactionIntent({
        action,
        actionLabel: action === "cancel"
          ? "Cancel this unfunded milestone"
          : `Return ${formatFxrpAmount(lockedFxrp)} to the client`,
        account,
        invoiceId: invoiceId.toString(),
        token: action === "refund" ? "FXRP" : "None",
        tokenAddress: action === "refund" ? PROOFPAY_FXRP_ADDRESS : null,
        amountAtomic: action === "refund" ? lockedFxrp.toString() : null,
        amountDisplay: action === "refund" ? formatFxrpAmount(lockedFxrp) : "No token transfer",
        quoteDeadline: null,
        maximumAtomic: action === "refund" ? lockedFxrp.toString() : null,
        maximumDisplay: action === "refund" ? formatFxrpAmount(lockedFxrp) : "Not applicable",
        expectedResult: action === "cancel"
          ? "Move the unfunded invoice to CANCELLED. No FXRP is transferred."
          : `Return the full ${formatFxrpAmount(lockedFxrp)} lock to the client and move the invoice to REFUNDED.`,
      });
      acceptPrepared({
        intent,
        send: async () => await client.writeContract(simulation.request),
        status: "prepared",
        transactionHash: null,
        error: null,
      });
    } catch (error) {
      setActionError(error instanceof Error && !/execution reverted|simulation/iu.test(error.message)
        ? error.message
        : decodeProofPayError(error));
    } finally {
      setPreparing(false);
    }
  };

  const signPrepared = async () => {
    if (!prepared || signingIntentRef.current !== null) return;
    const client = wallet.actionClient;
    const invalidation = transactionIntentInvalidationReason(prepared.intent, {
      account: wallet.account ?? null,
      chainId: wallet.chainId,
      contract: PROOFPAY_CONTRACT_ADDRESS,
      invoiceId,
    });
    if (invalidation) {
      const journalEntry = journal.currentEntry(prepared.intent.intentHash);
      if (journalEntry?.status === "prepared" && journalEntry.transactionHash === null) {
        journal.abandon(prepared.intent.intentHash);
      }
      setPrepared(null);
      setActionError("The prepared transaction no longer matches this wallet and invoice context. Preview it again.");
      return;
    }
    if (
      wallet.chainState !== "ready"
      || !wallet.account
      || wallet.account.toLowerCase() !== prepared.intent.account.toLowerCase()
      || !client
    ) {
      setPrepared({ ...prepared, error: "Reconnect the same Coston2 account before signing this intent." });
      return;
    }
    signingIntentRef.current = prepared.intent.intentHash;
    let hash: Hash | null = null;
    let walletRequestOpened = false;
    try {
      if (prepared.guardIntent) assertIntentAvailable(prepared.guardIntent);
      journal.beginWallet(prepared.intent.intentHash);
      walletRequestOpened = true;
      setPrepared({ ...prepared, status: "awaiting_wallet", error: null });
      hash = await prepared.send();
      journal.transition(prepared.intent.intentHash, "submitted", hash);
      setPrepared({ ...prepared, status: "submitted", transactionHash: hash, error: null });
      const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 120_000 });
      const status = receipt.status === "success" ? "confirmed" : "reverted";
      const currentEntry = journal.currentEntry(prepared.intent.intentHash);
      if (currentEntry?.status === "submitted") {
        journal.transition(prepared.intent.intentHash, status, hash);
      } else if (
        currentEntry?.status !== status
        || currentEntry.transactionHash?.toLowerCase() !== hash.toLowerCase()
      ) {
        throw new Error("The reconciled journal receipt no longer matches this wallet result.");
      }
      setPrepared({ ...prepared, status, transactionHash: hash, error: null });
      if (status === "confirmed" && prepared.intent.action === "fund" && fundingIntent.intent) {
        fundingIntent.clear(fundingIntent.intent.intentHash);
      }
      if (status === "confirmed" && prepared.intent.action !== "approve") router.refresh();
    } catch (error) {
      if (hash === null) {
        const journalEntry = journal.currentEntry(prepared.intent.intentHash);
        if (walletRequestOpened && journalEntry?.status === "awaiting_wallet") {
          if (isExplicitWalletRejection(error)) {
            journal.transition(prepared.intent.intentHash, "prepared", null);
            setPrepared({
              ...prepared,
              status: "prepared",
              transactionHash: null,
              error: decodeProofPayError(error),
            });
          } else {
            setPrepared({
              ...prepared,
              status: "awaiting_wallet",
              transactionHash: null,
              error: "The wallet returned no transaction hash, so ProofPay cannot prove whether it broadcast. This intent remains blocked in this browser and cannot be signed again.",
            });
          }
        } else if (journalEntry && journalEntry.status !== "abandoned") {
          const message = error instanceof Error && !/execution reverted|simulation/iu.test(error.message)
            ? error.message
            : decodeProofPayError(error);
          setPrepared({
            ...prepared,
            status: journalEntry.status,
            transactionHash: journalEntry.transactionHash,
            error: message,
          });
        } else {
          setPrepared({
            ...prepared,
            status: "prepared",
            transactionHash: null,
            error: decodeProofPayError(error),
          });
        }
      } else {
        setPrepared({
          ...prepared,
          status: "submitted",
          transactionHash: hash,
          error: "The transaction hash is stored, but its receipt could not be read yet. Reload to reconcile it before trying again.",
        });
      }
    } finally {
      if (signingIntentRef.current === prepared.intent.intentHash) {
        signingIntentRef.current = null;
      }
    }
  };

  const abandonPrepared = () => {
    if (!prepared || prepared.status !== "prepared" || signingIntentRef.current !== null) return;
    if (journal.currentEntry(prepared.intent.intentHash)?.status !== "prepared") return;
    journal.abandon(prepared.intent.intentHash);
    setPrepared(null);
  };

  const terminal = ["RELEASED", "CANCELLED", "REFUNDED"].includes(invoice.status);
  if (terminal) return null;

  const focusHeading = actionFocusHeading(invoice, policy, releaseQuote);

  return (
    <section aria-labelledby="wallet-actions-title" className="wallet-actions action-focus-panel" data-testid="wallet-actions">
      <div className="section-rule">
        <p className="utility-label">Next permitted action</p>
        <h2 id="wallet-actions-title">{focusHeading}</h2>
      </div>
      <dl className="action-facts" aria-label="Milestone action facts">
        <div><dt>State</dt><dd>{invoice.status}</dd></div>
        <div><dt>Your role</dt><dd>{walletRoleDisplay(policy.role)}</dd></div>
        <div data-testid="invoice-target"><dt>USD target</dt><dd>{invoice.usdTarget?.display ?? "Unavailable"}</dd></div>
        <div data-testid="invoice-current-lock"><dt>FXRP locked</dt><dd>{invoice.currentFxrpLocked?.display ?? "Unavailable"}</dd></div>
        <div><dt>Next permitted action</dt><dd>{focusHeading}</dd></div>
      </dl>
      <WalletConnectionPanel role={policy.role} wallet={wallet} />
      <p className="policy-explanation" data-testid="policy-explanation">{policy.explanation}</p>

      {wallet.chainState === "ready" && policy.role !== "unrelated" ? (
        <div className="action-preparation">
          {policy.actions.includes("fund") ? (
            <>
              <label className="tolerance-control">
                <span>Transaction tolerance</span>
                <select
                  disabled={fundingIntent.intent !== null}
                  onChange={(event) => setToleranceBps(BigInt(event.target.value))}
                  value={toleranceBps.toString()}
                >
                  <option value="50">0.5%</option>
                  <option value="100">1%</option>
                  <option value="200">2%</option>
                  <option value="300">3%</option>
                  <option value="500">5%</option>
                </select>
              </label>
              <button className="transaction-button" disabled={preparing} onClick={() => void prepareFunding()} type="button">
                {preparing
                  ? "Simulating funding"
                  : fundingIntent.intent
                    ? "Continue with saved funding intent"
                    : "Preview and simulate funding"}
              </button>
            </>
          ) : null}

          {policy.actions.includes("submit_evidence") ? (
            <div className="evidence-form">
              <label>
                <span>Public delivery URLs · one per line</span>
                <textarea onChange={(event) => setEvidenceUrls(event.target.value)} rows={4} value={evidenceUrls} />
              </label>
              <label>
                <span>Wallet-actions commit · optional</span>
                <input className="mono-input" onChange={(event) => setWalletActionsCommit(event.target.value)} value={walletActionsCommit} />
              </label>
              <label>
                <span>Completion note</span>
                <textarea maxLength={280} onChange={(event) => setCompletionNote(event.target.value)} rows={3} value={completionNote} />
              </label>
              <button className="transaction-button" disabled={preparing} onClick={() => void prepareEvidence()} type="button">
                {preparing ? "Hashing and simulating evidence" : "Hash and simulate evidence submission"}
              </button>
            </div>
          ) : null}

          {invoice.status === "SUBMITTED" && policy.role === "client" ? (
            <>
              <label className="tolerance-control">
                <span>Transaction tolerance</span>
                <select onChange={(event) => setToleranceBps(BigInt(event.target.value))} value={toleranceBps.toString()}>
                  <option value="50">0.5%</option>
                  <option value="100">1%</option>
                  <option value="200">2%</option>
                  <option value="300">3%</option>
                  <option value="500">5%</option>
                </select>
              </label>
              <button className="transaction-button" disabled={preparing} onClick={() => void prepareReleaseOrTopUp()} type="button">
                {preparing ? "Simulating settlement" : "Refresh and simulate settlement"}
              </button>
            </>
          ) : null}

          {policy.actions.includes("cancel") ? (
            <button className="transaction-button" disabled={preparing} onClick={() => void prepareSimpleAction("cancel")} type="button">
              {preparing ? "Simulating cancellation" : "Simulate cancellation"}
            </button>
          ) : null}
          {policy.actions.includes("refund") ? (
            <button className="transaction-button" disabled={preparing} onClick={() => void prepareSimpleAction("refund")} type="button">
              {preparing ? "Simulating refund" : `Simulate return of ${formatFxrpAmount(lockedFxrp)}`}
            </button>
          ) : null}
        </div>
      ) : null}

      {visibleFundingPreview ? (
        <section aria-labelledby="funding-preview-title" className="action-quote" data-testid="funding-preview">
          <div className="preview-heading">
            <div><p className="utility-label">Live funding simulation</p><h3 id="funding-preview-title">Preview quote</h3></div>
            <span className="unconfirmed-mark">Not confirmed</span>
          </div>
          <p>This preview is frozen until its deadline. Approval and funding use this same accepted maximum.</p>
          <dl className="intent-list">
            <div><dt>Preview XRP / USD price</dt><dd>{priceDisplay(BigInt(visibleFundingPreview.intent.price), visibleFundingPreview.intent.priceDecimals)}</dd></div>
            <div><dt>Feed timestamp</dt><dd className="timestamp">{formatQuoteTimestamp(BigInt(visibleFundingPreview.intent.priceTimestamp))}</dd></div>
            <div><dt>Required base amount</dt><dd>{formatFxrpAmount(BigInt(visibleFundingPreview.intent.baseRequiredFxrp))}</dd></div>
            <div><dt>With 10% funding protection</dt><dd>{formatFxrpAmount(BigInt(visibleFundingPreview.intent.previewRequiredFxrp))}</dd></div>
            <div><dt>{toleranceLabel(BigInt(visibleFundingPreview.intent.toleranceBps))} transaction maximum</dt><dd>{formatFxrpAmount(BigInt(visibleFundingPreview.intent.maximumFxrp))}</dd></div>
            <div><dt>Current allowance</dt><dd>{visibleFundingPreview.allowanceFxrp === null ? "Read before the next wallet action" : formatFxrpAmount(visibleFundingPreview.allowanceFxrp)}</dd></div>
            <div><dt>Quote deadline</dt><dd className="timestamp">{formatQuoteTimestamp(BigInt(visibleFundingPreview.intent.quoteDeadline))}</dd></div>
            <div><dt>Funding intent</dt><dd className="hash">{visibleFundingPreview.intent.intentHash}</dd></div>
          </dl>
        </section>
      ) : null}

      {releaseQuote ? (
        <section aria-labelledby="settlement-preview-title" className="action-quote" data-testid="settlement-preview">
          <div className="preview-heading">
            <div><p className="utility-label">Live release simulation</p><h3 id="settlement-preview-title">Preview quote</h3></div>
            <span className="unconfirmed-mark">Not confirmed</span>
          </div>
          <p>{releaseQuote.topUpFxrp > 0n
            ? `The escrow no longer covers the milestone target. No payment has been released. The exact shortfall is ${formatFxrpAmount(releaseQuote.topUpFxrp)}.`
            : "The current lock covers the previewed payout. No payment has been released by this preview."}</p>
          <dl className="intent-list">
            <div><dt>Current locked amount</dt><dd>{formatFxrpAmount(releaseQuote.lockedFxrp)}</dd></div>
            <div><dt>Required freelancer payout</dt><dd>{formatFxrpAmount(releaseQuote.payoutFxrp)}</dd></div>
            <div><dt>Client refund</dt><dd>{formatFxrpAmount(releaseQuote.refundFxrp)}</dd></div>
            <div><dt>Exact top-up</dt><dd>{formatFxrpAmount(releaseQuote.topUpFxrp)}</dd></div>
            <div><dt>Current XRP / USD price</dt><dd>{priceDisplay(releaseQuote.price, releaseQuote.priceDecimals)}</dd></div>
            <div><dt>Feed timestamp</dt><dd className="timestamp">{formatQuoteTimestamp(releaseQuote.priceTimestamp)}</dd></div>
          </dl>
        </section>
      ) : null}

      {prepared?.evidenceManifest ? (
        <section aria-labelledby="evidence-manifest-title" className="manifest-preview" data-testid="evidence-manifest">
          <div className="preview-heading">
            <div><p className="utility-label">Deterministic UTF-8 JSON</p><h3 id="evidence-manifest-title">Evidence manifest</h3></div>
            <span className="unconfirmed-mark">Not submitted</span>
          </div>
          <p className="hash">keccak256: {prepared.evidenceManifest.hash}</p>
          <pre className="canonical-manifest">{prepared.evidenceManifest.canonicalJson}</pre>
          <p>This commitment proves the submitted bytes, not delivery truth or quality.</p>
        </section>
      ) : null}

      {prepared ? (
        <TransactionIntentReview
          error={prepared.error}
          intent={prepared.intent}
          onSign={() => void signPrepared()}
          status={prepared.status}
          transactionHash={prepared.transactionHash}
          {...(prepared.status === "prepared" ? { onAbandon: abandonPrepared } : {})}
        />
      ) : null}

      {actionError ? <p aria-live="assertive" className="action-error">{actionError}</p> : null}
      <TransactionJournalView entries={journal.entries} onAbandon={journal.abandon} />
    </section>
  );
}
