"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { getAddress, parseUnits, type Hash } from "viem";

import { buildScopeManifest, type CanonicalManifest, type ScopeManifest } from "@/lib/proofpay-manifests";
import {
  contractDeadlineFromLocalInput,
  formatLocalDeadline,
  formatUtcDeadline,
  twentyFourHourDeadline,
  unixSecondsToLocalInput,
} from "@/lib/deadline";
import { proofPayAbi, PROOFPAY_CONTRACT_ADDRESS } from "@/lib/proofpay-contract";
import {
  buildTransactionIntent,
  decodeProofPayError,
  formatUsdAmount,
  type TransactionIntent,
} from "@/lib/transaction-intents";
import type { JournalStatus } from "@/lib/transaction-journal";

import { useProofPayWallet } from "./use-proofpay-wallet";
import { useHydrated } from "./use-hydrated";
import { useTransactionJournal } from "./use-transaction-journal";
import {
  TransactionIntentReview,
  TransactionJournalView,
  WalletConnectionPanel,
} from "./wallet-ui";

interface PreparedCreate {
  intent: TransactionIntent;
  manifest: CanonicalManifest<ScopeManifest>;
  send: () => Promise<Hash>;
  status: Exclude<JournalStatus, "abandoned">;
  transactionHash: Hash | null;
  error: string | null;
}

export function CreateMilestoneWorkspace() {
  const router = useRouter();
  const hydrated = useHydrated();
  const wallet = useProofPayWallet();
  const journal = useTransactionJournal(wallet.actionClient);
  const [locateId, setLocateId] = useState("");
  const [client, setClient] = useState("");
  const [usdTarget, setUsdTarget] = useState("");
  const [deadline, setDeadline] = useState("");
  const [deadlineSeconds, setDeadlineSeconds] = useState<bigint | null>(null);
  const [title, setTitle] = useState("");
  const [scope, setScope] = useState("");
  const [prepareError, setPrepareError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [prepared, setPrepared] = useState<PreparedCreate | null>(null);

  const timeZone = hydrated ? (Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC") : "UTC";

  const deadlineSummary = useMemo(() => deadlineSeconds === null ? null : {
    local: formatLocalDeadline(deadlineSeconds, timeZone),
    utc: formatUtcDeadline(deadlineSeconds),
  }, [deadlineSeconds, timeZone]);

  const updateDeadline = (value: string) => {
    setDeadline(value);
    try {
      setDeadlineSeconds(contractDeadlineFromLocalInput(value, timeZone));
    } catch {
      setDeadlineSeconds(null);
    }
  };

  const useTwentyFourHourPreset = () => {
    const instant = twentyFourHourDeadline();
    setDeadlineSeconds(instant);
    setDeadline(unixSecondsToLocalInput(instant, timeZone));
  };

  const locate = (event: React.FormEvent) => {
    event.preventDefault();
    const normalized = locateId.trim();
    if (!/^[1-9][0-9]*$/u.test(normalized)) {
      setPrepareError("Invoice ID must be a positive whole number.");
      return;
    }
    router.push(`/invoice/${normalized}`);
  };

  const prepareCreate = async () => {
    setPrepareError(null);
    const actionClient = wallet.actionClient;
    if (wallet.chainState !== "ready" || !wallet.account || !actionClient) {
      setPrepareError(wallet.chainState === "wrong_network"
        ? "Switch the connected wallet to Coston2 before simulating this invoice."
        : "Connect an injected wallet before simulating this invoice.");
      return;
    }
    setPreparing(true);
    try {
      const account = getAddress(wallet.account);
      const clientAddress = getAddress(client.trim());
      const usdTargetAtomic = parseUnits(usdTarget.trim(), 6);
      if (usdTargetAtomic <= 0n) throw new Error("Milestone target must be greater than zero.");
      const deliveryDeadline = deadlineSeconds
        ?? contractDeadlineFromLocalInput(deadline, timeZone);
      if (deliveryDeadline <= BigInt(Math.floor(Date.now() / 1_000))) {
        throw new Error("Delivery deadline must be in the future.");
      }
      const manifest = buildScopeManifest({
        client: clientAddress,
        freelancer: account,
        milestoneTitle: title,
        scope: scope.split("\n"),
        usdTargetAtomic,
        deliveryDeadline,
      });
      const simulation = await actionClient.simulateContract({
        account,
        address: PROOFPAY_CONTRACT_ADDRESS,
        abi: proofPayAbi,
        functionName: "createInvoice",
        args: [clientAddress, usdTargetAtomic, deliveryDeadline, manifest.hash],
      });
      const invoiceId = simulation.result;
      const intent = buildTransactionIntent({
        action: "create",
        actionLabel: `Create this ${formatUsdAmount(usdTargetAtomic)} milestone`,
        account,
        invoiceId: invoiceId.toString(),
        token: "None",
        tokenAddress: null,
        amountAtomic: null,
        amountDisplay: "No token transfer",
        contractDeadline: deliveryDeadline.toString(),
        quoteDeadline: null,
        maximumAtomic: null,
        maximumDisplay: "Not applicable",
        expectedResult: `Create invoice ${invoiceId} with this client, target, deadline, and scope commitment. No FXRP is locked.`,
        recipientDisplay: "ProofPay escrow records the agreement · no token transfer",
        changeBeforeConfirmation: "The absolute deadline and scope commitment are frozen. A changed invoice count or wallet context invalidates the intent.",
        completionProof: "An InvoiceCreated event and the stored invoice terms at the deployed ProofPay escrow contract.",
      });
      const blocking = journal.blocking({ account, invoiceId: intent.invoiceId, action: "create" });
      if (blocking) {
        throw new Error(`A ${blocking.status} create intent already exists for predicted invoice ${intent.invoiceId}. Reconcile or abandon it before preparing another.`);
      }
      journal.prepare(intent);
      setPrepared({
        intent,
        manifest,
        send: async () => await actionClient.writeContract(simulation.request),
        status: "prepared",
        transactionHash: null,
        error: null,
      });
    } catch (error) {
      setPrepareError(error instanceof Error && !/simulation|execution reverted/iu.test(error.message)
        ? error.message
        : decodeProofPayError(error));
    } finally {
      setPreparing(false);
    }
  };

  const signPrepared = async () => {
    if (!prepared) return;
    if (
      wallet.chainState !== "ready"
      || !wallet.account
      || wallet.account.toLowerCase() !== prepared.intent.account.toLowerCase()
      || !wallet.actionClient
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
      const receipt = await wallet.actionClient.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 120_000 });
      const status = receipt.status === "success" ? "confirmed" : "reverted";
      journal.transition(prepared.intent.intentHash, status, hash);
      setPrepared({ ...prepared, status, transactionHash: hash, error: null });
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

  return (
    <main className="page-shell" id="main-content">
      <article className="paper app-paper">
        <div className="paper-body">
          <header className="document-masthead">
            <div>
              <div className="wordmark">ProofPay <span aria-hidden="true">/</span> milestone workspace</div>
              <p className="network-label">Flare Testnet Coston2 · chain 114</p>
            </div>
            <span className="status-stamp">Actions</span>
          </header>

          <header className="document-heading app-heading">
            <p className="eyebrow">Create or locate a milestone</p>
            <h1>Start from the agreement.</h1>
            <p>Record one client, one freelancer, one USD target, and one scope commitment before FXRP funding begins.</p>
          </header>

          <section aria-labelledby="locate-title" className="workspace-section">
            <div className="section-rule">
              <p className="utility-label">Existing milestone</p>
              <h2 id="locate-title">Locate an invoice</h2>
            </div>
            <form className="inline-form" onSubmit={locate}>
              <label htmlFor="invoice-id">Invoice ID</label>
              <input id="invoice-id" inputMode="numeric" onChange={(event) => setLocateId(event.target.value)} value={locateId} />
              <button className="quiet-button" type="submit">Open invoice</button>
            </form>
          </section>

          <section aria-labelledby="create-title" className="workspace-section">
            <div className="section-rule">
              <p className="utility-label">New milestone</p>
              <h2 id="create-title">Prepare an invoice</h2>
            </div>
            <WalletConnectionPanel wallet={wallet} />
            <div className="form-grid">
              <label>
                <span>Milestone title</span>
                <input onChange={(event) => setTitle(event.target.value)} value={title} />
              </label>
              <label>
                <span>Client wallet</span>
                <input autoComplete="off" className="mono-input" onChange={(event) => setClient(event.target.value)} value={client} />
              </label>
              <label>
                <span>USD target</span>
                <input inputMode="decimal" onChange={(event) => setUsdTarget(event.target.value)} placeholder="5.00" value={usdTarget} />
              </label>
              <div className="deadline-field">
                <label htmlFor="delivery-deadline">
                  <span>Delivery deadline · local clock time</span>
                </label>
                <input
                  aria-describedby="deadline-timezone"
                  id="delivery-deadline"
                  onChange={(event) => updateDeadline(event.target.value)}
                  type="datetime-local"
                  value={deadline}
                />
                <button className="quiet-button preset-button" onClick={useTwentyFourHourPreset} type="button">
                  Set 24 hours from now
                </button>
                <p className="form-note" id="deadline-timezone">Local timezone: {timeZone}</p>
              </div>
              <label className="form-span">
                <span>Scope · one deliverable per line</span>
                <textarea onChange={(event) => setScope(event.target.value)} rows={5} value={scope} />
              </label>
            </div>
            {deadlineSummary ? (
              <dl aria-label="Deadline conversion" className="deadline-summary" data-testid="deadline-summary">
                <div><dt>Your local time</dt><dd>{deadlineSummary.local}</dd></div>
                <div><dt>UTC equivalent</dt><dd>{deadlineSummary.utc}</dd></div>
                <div><dt>Contract timestamp</dt><dd>{deadlineSeconds?.toString()}</dd></div>
              </dl>
            ) : null}
            <p className="form-note">The connected wallet becomes the freelancer. Simulation creates no invoice and requests no signature.</p>
            <button
              className="transaction-button"
              disabled={preparing || wallet.chainState !== "ready"}
              onClick={() => void prepareCreate()}
              type="button"
            >
              {preparing ? "Simulating invoice" : "Simulate invoice creation"}
            </button>
            {prepareError ? <p aria-live="assertive" className="action-error">{prepareError}</p> : null}
          </section>

          {prepared ? (
            <section aria-labelledby="scope-commitment-title" className="workspace-section">
              <div className="section-rule">
                <p className="utility-label">Deterministic scope</p>
                <h2 id="scope-commitment-title">Scope commitment</h2>
              </div>
              <p className="hash">keccak256: {prepared.manifest.hash}</p>
              <details>
                <summary>Reveal canonical scope manifest</summary>
                <pre className="canonical-manifest">{prepared.manifest.canonicalJson}</pre>
              </details>
              <TransactionIntentReview
                error={prepared.error}
                intent={prepared.intent}
                onSign={() => void signPrepared()}
                status={prepared.status}
                transactionHash={prepared.transactionHash}
                {...(prepared.status === "prepared" ? { onAbandon: abandonPrepared } : {})}
              />
              {prepared.status === "confirmed" ? (
                <p><Link href={`/invoice/${prepared.intent.invoiceId}`}>Open invoice {prepared.intent.invoiceId}</Link></p>
              ) : null}
            </section>
          ) : null}

          <TransactionJournalView entries={journal.entries} onAbandon={journal.abandon} />
        </div>
      </article>
    </main>
  );
}
