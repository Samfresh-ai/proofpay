"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { getAddress, type Hash } from "viem";

import type { InvoiceView } from "@/lib/proofpay";
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
  type FundingPlan,
  type ReleaseQuote,
  type TransactionIntent,
} from "@/lib/transaction-intents";
import type { JournalStatus } from "@/lib/transaction-journal";
import { deriveInvoiceActions, type InvoiceWalletAction } from "@/lib/wallet-policy";

import { useProofPayWallet } from "./use-proofpay-wallet";
import { useTransactionJournal } from "./use-transaction-journal";
import {
  TransactionIntentReview,
  TransactionJournalView,
  WalletConnectionPanel,
} from "./wallet-ui";

interface FundingPreview {
  plan: FundingPlan;
  price: bigint;
  priceDecimals: number;
  priceTimestamp: bigint;
  quoteDeadline: bigint;
}

interface PreparedAction {
  intent: TransactionIntent;
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

export function InvoiceActions({ invoice }: { invoice: InvoiceView }) {
  const router = useRouter();
  const wallet = useProofPayWallet();
  const journal = useTransactionJournal(wallet.actionClient);
  const [toleranceBps, setToleranceBps] = useState(PROOFPAY_DEFAULT_TOLERANCE_BPS);
  const [fundingPreview, setFundingPreview] = useState<FundingPreview | null>(null);
  const [releaseQuote, setReleaseQuote] = useState<ReleaseQuote | null>(null);
  const [evidenceUrls, setEvidenceUrls] = useState("");
  const [walletActionsCommit, setWalletActionsCommit] = useState("");
  const [completionNote, setCompletionNote] = useState("");
  const [prepared, setPrepared] = useState<PreparedAction | null>(null);
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

  const acceptPrepared = (next: PreparedAction) => {
    const blocking = journal.blocking({
      account: next.intent.account,
      invoiceId: next.intent.invoiceId,
      action: next.intent.action,
    });
    if (blocking) {
      throw new Error(`A ${blocking.status} ${blocking.action.replaceAll("_", " ")} intent already exists for this invoice. Reconcile or abandon it before preparing another.`);
    }
    journal.prepare(next.intent);
    setPrepared(next);
  };

  const prepareFunding = async () => {
    setActionError(null);
    setPreparing(true);
    try {
      const { account, client } = assertReady("fund");
      const quote = await client.simulateContract({
        account,
        address: PROOFPAY_CONTRACT_ADDRESS,
        abi: proofPayAbi,
        functionName: "quoteFunding",
        args: [invoiceId],
      });
      const [requiredFxrp, price, priceDecimals, priceTimestamp] = quote.result;
      const allowance = await client.readContract({
        address: PROOFPAY_FXRP_ADDRESS,
        abi: fxrpAbi,
        functionName: "allowance",
        args: [account, PROOFPAY_CONTRACT_ADDRESS],
      });
      const plan = buildFundingPlan({
        usdTargetAtomic,
        quoteRequiredFxrp: requiredFxrp,
        price,
        priceDecimals,
        toleranceBps,
        allowanceFxrp: allowance,
      });
      const deadline = quoteDeadline();
      setFundingPreview({ plan, price, priceDecimals, priceTimestamp, quoteDeadline: deadline });

      if (plan.approvalRequired) {
        const approval = await client.simulateContract({
          account,
          address: PROOFPAY_FXRP_ADDRESS,
          abi: fxrpAbi,
          functionName: "approve",
          args: [PROOFPAY_CONTRACT_ADDRESS, plan.exactApprovalFxrp],
        });
        const intent = buildApprovalIntent({ account, invoiceId, maximumFxrp: plan.exactApprovalFxrp });
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
        args: [invoiceId, plan.maximumFxrp, deadline],
      });
      const intent = buildFundingIntent({
        account,
        invoiceId,
        usdTargetAtomic,
        requiredFxrp: plan.protectedRequiredFxrp,
        maximumFxrp: plan.maximumFxrp,
        quoteDeadline: deadline,
      });
      acceptPrepared({
        intent,
        send: async () => await client.writeContract(funding.request),
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
      const quote: ReleaseQuote = { payoutFxrp, refundFxrp, topUpFxrp, price, priceDecimals, priceTimestamp };
      setReleaseQuote(quote);
      const deadline = quoteDeadline();

      if (topUpFxrp > 0n) {
        const maximumFxrp = applyTolerance(topUpFxrp, toleranceBps);
        const allowance = await client.readContract({
          address: PROOFPAY_FXRP_ADDRESS,
          abi: fxrpAbi,
          functionName: "allowance",
          args: [account, PROOFPAY_CONTRACT_ADDRESS],
        });
        if (allowance < maximumFxrp) {
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
        const simulation = await client.simulateContract({
          account,
          address: PROOFPAY_CONTRACT_ADDRESS,
          abi: proofPayAbi,
          functionName: "topUp",
          args: [invoiceId, maximumFxrp, deadline],
        });
        const intent = buildTopUpIntent({
          account,
          invoiceId,
          shortfallFxrp: topUpFxrp,
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
    if (!prepared) return;
    const client = wallet.actionClient;
    if (
      wallet.chainState !== "ready"
      || !wallet.account
      || wallet.account.toLowerCase() !== prepared.intent.account.toLowerCase()
      || !client
    ) {
      setPrepared({ ...prepared, error: "Reconnect the same Coston2 account before signing this intent." });
      return;
    }
    journal.transition(prepared.intent.intentHash, "awaiting_wallet");
    setPrepared({ ...prepared, status: "awaiting_wallet", error: null });
    let hash: Hash | null = null;
    try {
      hash = await prepared.send();
      journal.transition(prepared.intent.intentHash, "submitted", hash);
      setPrepared({ ...prepared, status: "submitted", transactionHash: hash, error: null });
      const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 120_000 });
      const status = receipt.status === "success" ? "confirmed" : "reverted";
      journal.transition(prepared.intent.intentHash, status, hash);
      setPrepared({ ...prepared, status, transactionHash: hash, error: null });
      if (status === "confirmed") router.refresh();
    } catch (error) {
      if (hash === null) {
        journal.transition(prepared.intent.intentHash, "prepared", null);
        setPrepared({ ...prepared, status: "prepared", error: decodeProofPayError(error) });
      } else {
        setPrepared({
          ...prepared,
          status: "submitted",
          transactionHash: hash,
          error: "The transaction hash is stored, but its receipt could not be read yet. Reload to reconcile it before trying again.",
        });
      }
    }
  };

  const abandonPrepared = () => {
    if (!prepared || prepared.status !== "prepared") return;
    journal.abandon(prepared.intent.intentHash);
    setPrepared(null);
  };

  const terminal = ["RELEASED", "CANCELLED", "REFUNDED"].includes(invoice.status);
  if (terminal) {
    return (
      <section aria-labelledby="wallet-actions-title" className="wallet-actions terminal-actions" data-testid="wallet-actions-terminal">
        <div className="section-rule">
          <p className="utility-label">Wallet actions</p>
          <h2 id="wallet-actions-title">This milestone is closed</h2>
        </div>
        <p>No state-changing control is available for a terminal invoice.</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="wallet-actions-title" className="wallet-actions" data-testid="wallet-actions">
      <div className="section-rule">
        <p className="utility-label">Role-aware controls</p>
        <h2 id="wallet-actions-title">Next wallet action</h2>
      </div>
      <WalletConnectionPanel role={policy.role} wallet={wallet} />
      <p className="policy-explanation" data-testid="policy-explanation">{policy.explanation}</p>

      {wallet.chainState === "ready" && policy.role !== "unrelated" ? (
        <div className="action-preparation">
          {policy.actions.includes("fund") ? (
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
              <button className="transaction-button" disabled={preparing} onClick={() => void prepareFunding()} type="button">
                {preparing ? "Simulating funding" : "Preview and simulate funding"}
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

      {fundingPreview ? (
        <section aria-labelledby="funding-preview-title" className="action-quote" data-testid="funding-preview">
          <div className="preview-heading">
            <div><p className="utility-label">Live funding simulation</p><h3 id="funding-preview-title">Preview quote</h3></div>
            <span className="unconfirmed-mark">Not confirmed</span>
          </div>
          <p>No FXRP has been approved or funded by this preview.</p>
          <dl className="intent-list">
            <div><dt>Current XRP / USD price</dt><dd>{priceDisplay(fundingPreview.price, fundingPreview.priceDecimals)}</dd></div>
            <div><dt>Feed timestamp</dt><dd className="timestamp">{formatQuoteTimestamp(fundingPreview.priceTimestamp)}</dd></div>
            <div><dt>Required base amount</dt><dd>{formatFxrpAmount(fundingPreview.plan.baseRequiredFxrp)}</dd></div>
            <div><dt>With 10% funding protection</dt><dd>{formatFxrpAmount(fundingPreview.plan.protectedRequiredFxrp)}</dd></div>
            <div><dt>{toleranceLabel(fundingPreview.plan.toleranceBps)} transaction maximum</dt><dd>{formatFxrpAmount(fundingPreview.plan.maximumFxrp)}</dd></div>
            <div><dt>Current allowance</dt><dd>{formatFxrpAmount(fundingPreview.plan.allowanceFxrp)}</dd></div>
            <div><dt>Quote deadline</dt><dd className="timestamp">{formatQuoteTimestamp(fundingPreview.quoteDeadline)}</dd></div>
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
            ? `The escrow is short by ${formatFxrpAmount(releaseQuote.topUpFxrp)}. Nothing has been released.`
            : "The current lock covers the previewed payout. No payment has been released by this preview."}</p>
          <dl className="intent-list">
            <div><dt>Current locked amount</dt><dd>{formatFxrpAmount(lockedFxrp)}</dd></div>
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
