"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getAddress, parseUnits, type Hash } from "viem";

import { buildScopeManifest, type CanonicalManifest, type ScopeManifest } from "@/lib/proofpay-manifests";
import { proofPayAbi, PROOFPAY_CONTRACT_ADDRESS } from "@/lib/proofpay-contract";
import {
  buildTransactionIntent,
  decodeProofPayError,
  formatUsdAmount,
  type TransactionIntent,
} from "@/lib/transaction-intents";
import type { JournalStatus } from "@/lib/transaction-journal";

import { useProofPayWallet } from "./use-proofpay-wallet";
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

function parseDeadline(value: string): bigint {
  const milliseconds = new Date(value).getTime();
  if (!Number.isFinite(milliseconds)) throw new Error("Choose a valid delivery deadline.");
  const seconds = BigInt(Math.floor(milliseconds / 1_000));
  if (seconds <= BigInt(Math.floor(Date.now() / 1_000))) {
    throw new Error("Delivery deadline must be in the future.");
  }
  return seconds;
}

export function CreateMilestoneWorkspace() {
  const router = useRouter();
  const wallet = useProofPayWallet();
  const journal = useTransactionJournal(wallet.actionClient);
  const [locateId, setLocateId] = useState("");
  const [client, setClient] = useState("");
  const [usdTarget, setUsdTarget] = useState("");
  const [deadline, setDeadline] = useState("");
  const [title, setTitle] = useState("");
  const [scope, setScope] = useState("");
  const [prepareError, setPrepareError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [prepared, setPrepared] = useState<PreparedCreate | null>(null);

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
      const deliveryDeadline = parseDeadline(deadline);
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
        quoteDeadline: null,
        maximumAtomic: null,
        maximumDisplay: "Not applicable",
        expectedResult: `Create invoice ${invoiceId} with this client, target, deadline, and scope commitment. No FXRP is locked.`,
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
              <label>
                <span>Delivery deadline</span>
                <input onChange={(event) => setDeadline(event.target.value)} type="datetime-local" value={deadline} />
              </label>
              <label className="form-span">
                <span>Scope · one deliverable per line</span>
                <textarea onChange={(event) => setScope(event.target.value)} rows={5} value={scope} />
              </label>
            </div>
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
