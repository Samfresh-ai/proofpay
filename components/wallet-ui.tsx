"use client";

import type { Hash } from "viem";

import { formatLocalDeadline, formatUtcDeadline } from "@/lib/deadline";
import type { JournalEntry, JournalStatus } from "@/lib/transaction-journal";
import {
  decodeProofPayError,
  transactionStateCopy,
  type TransactionIntent,
} from "@/lib/transaction-intents";
import type { WalletRole } from "@/lib/wallet-policy";

import type { useProofPayWallet } from "./use-proofpay-wallet";
import { useHydrated } from "./use-hydrated";

type ProofPayWallet = ReturnType<typeof useProofPayWallet>;

function shortAddress(value: string): string {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function deadlineDisplay(value: string | null): string {
  return value === null ? "Not required" : new Date(Number(value) * 1_000).toISOString();
}

function ContractDeadline({ value }: { value: string }) {
  const hydrated = useHydrated();
  const timeZone = hydrated ? (Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC") : "UTC";
  const seconds = BigInt(value);
  return (
    <span className="deadline-intent-value" data-testid="intent-contract-deadline">
      <span>{formatLocalDeadline(seconds, timeZone)}</span>
      <span>{formatUtcDeadline(seconds)}</span>
      <span>Unix seconds · {value}</span>
    </span>
  );
}

function roleLabel(role?: WalletRole): string {
  switch (role) {
    case "client": return "Connected client";
    case "freelancer": return "Connected freelancer";
    case "unrelated": return "Unrelated wallet · read-only";
    default: return "Connected wallet";
  }
}

export function WalletConnectionPanel({
  connectLabel = "Connect wallet",
  role,
  wallet,
}: {
  connectLabel?: string;
  role?: WalletRole;
  wallet: ProofPayWallet;
}) {
  if (!wallet.hydrated) {
    return (
      <section
        aria-busy="true"
        aria-labelledby="wallet-connection-title"
        className="wallet-connection"
        data-testid="wallet-state-loading"
        role="status"
      >
        <div>
          <p className="utility-label">Wallet</p>
          <h3 id="wallet-connection-title">Checking wallet connection</h3>
          <p>Reading the injected wallet state before enabling any ProofPay action.</p>
        </div>
        <button className="transaction-button" disabled type="button">Checking wallet</button>
      </section>
    );
  }

  if (!wallet.isConnected) {
    return (
      <section aria-labelledby="wallet-connection-title" className="wallet-connection" data-testid="wallet-state-no-wallet">
        <div>
          <p className="utility-label">Wallet</p>
          <h3 id="wallet-connection-title">No wallet connected</h3>
          <p>Connect an injected EVM wallet. ProofPay never requests or reads its private keys.</p>
        </div>
        <button
          className="transaction-button"
          disabled={wallet.connectPending}
          onClick={() => void wallet.connectWallet()}
          type="button"
        >
          {wallet.connectPending ? "Waiting for wallet" : connectLabel}
        </button>
        {wallet.connectError ? (
          <p aria-live="assertive" className="action-error">{decodeProofPayError(wallet.connectError)}</p>
        ) : null}
      </section>
    );
  }

  if (wallet.chainState === "wrong_network") {
    return (
      <section aria-labelledby="wallet-connection-title" className="wallet-connection" data-testid="wallet-state-wrong-network">
        <div>
          <p className="utility-label">Wallet</p>
          <h3 id="wallet-connection-title">Coston2 required</h3>
          <p>The connected wallet is on chain {wallet.chainId}. ProofPay actions require Coston2 chain 114.</p>
        </div>
        <button
          className="transaction-button"
          disabled={wallet.switchPending}
          onClick={() => void wallet.switchToCoston2()}
          type="button"
        >
          {wallet.switchPending ? "Switch request open" : "Switch to Coston2"}
        </button>
        {wallet.switchError ? (
          <p aria-live="assertive" className="action-error">{decodeProofPayError(wallet.switchError)}</p>
        ) : null}
      </section>
    );
  }

  return (
    <section aria-labelledby="wallet-connection-title" className="wallet-connection" data-testid={`wallet-state-${role ?? "connected"}`}>
      <div>
        <p className="utility-label">Wallet · Coston2</p>
        <h3 id="wallet-connection-title">{roleLabel(role)}</h3>
        <p className="address">{wallet.account ? shortAddress(wallet.account) : "Account unavailable"}</p>
      </div>
      <button className="quiet-button" onClick={wallet.disconnectWallet} type="button">
        Disconnect
      </button>
    </section>
  );
}

export function TransactionIntentReview({
  error,
  intent,
  onAbandon,
  onSign,
  status,
  transactionHash,
}: {
  error?: string | null;
  intent: TransactionIntent;
  onAbandon?: () => void;
  onSign: () => void;
  status: Exclude<JournalStatus, "abandoned">;
  transactionHash?: Hash | null;
}) {
  return (
    <section aria-labelledby="transaction-intent-title" className="transaction-intent" data-testid="transaction-intent">
      <div className="preview-heading">
        <div>
          <p className="utility-label">Prepared transaction</p>
          <h3 id="transaction-intent-title">Confirm what this wallet will do</h3>
        </div>
        <span className="unconfirmed-mark">Not confirmed</span>
      </div>
      <dl className="intent-list intent-summary">
        <div><dt>What happens</dt><dd>{intent.expectedResult}</dd></div>
        <div><dt>Maximum token movement</dt><dd>{intent.maximumDisplay}</dd></div>
        <div><dt>Recipient</dt><dd>{intent.recipientDisplay}</dd></div>
        <div><dt>What may change before confirmation</dt><dd>{intent.changeBeforeConfirmation}</dd></div>
        <div><dt>Proof of completion</dt><dd>{intent.completionProof}</dd></div>
      </dl>
      <details className="exact-transaction-details">
        <summary>Review exact transaction details</summary>
        <div className="details-body">
          <dl className="intent-list">
            <div><dt>Action</dt><dd>{intent.actionLabel}</dd></div>
            <div><dt>Network</dt><dd>{intent.network} · chain {intent.chainId}</dd></div>
            <div><dt>Contract</dt><dd className="hash">{intent.contract}</dd></div>
            <div><dt>Connected account</dt><dd className="hash">{intent.account}</dd></div>
            <div><dt>Invoice ID</dt><dd>{intent.invoiceId}</dd></div>
            <div><dt>Token and amount</dt><dd>{intent.token === "None" ? "No token transfer" : intent.amountDisplay}</dd></div>
            {intent.contractDeadline ? <div><dt>Delivery deadline</dt><dd><ContractDeadline value={intent.contractDeadline} /></dd></div> : null}
            <div><dt>Quote deadline</dt><dd className="timestamp">{deadlineDisplay(intent.quoteDeadline)}</dd></div>
            <div><dt>Intent hash</dt><dd className="hash">{intent.intentHash}</dd></div>
            {transactionHash ? <div><dt>Transaction hash</dt><dd className="hash">{transactionHash}</dd></div> : null}
          </dl>
        </div>
      </details>
      <p aria-live="polite" className={`transaction-state transaction-state-${status}`} data-testid="transaction-state">
        {transactionStateCopy(status)}
      </p>
      {error ? <p aria-live="assertive" className="action-error">{error}</p> : null}
      <div className="intent-actions">
        {status === "prepared" ? (
          <button className="transaction-button" onClick={onSign} type="button">
            {intent.actionLabel}
          </button>
        ) : null}
        {status === "prepared" && onAbandon ? (
          <button className="quiet-button" onClick={onAbandon} type="button">
            Abandon unsigned intent
          </button>
        ) : null}
      </div>
    </section>
  );
}

export function TransactionJournalView({
  entries,
  onAbandon,
}: {
  entries: readonly JournalEntry[];
  onAbandon: (intentHash: Hash) => void;
}) {
  const recent = [...entries].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).slice(0, 8);
  if (recent.length === 0) return null;

  return (
    <section aria-labelledby="transaction-journal-title" className="transaction-journal" data-testid="transaction-journal">
      <div className="section-rule">
        <p className="utility-label">This browser only</p>
        <h2 id="transaction-journal-title">Recent activity</h2>
      </div>
      <ol className="journal-list">
        {recent.map((entry) => (
          <li key={entry.intentHash}>
            <div>
              <strong>{entry.action.replaceAll("_", " ")}</strong>
              <span>Invoice {entry.invoiceId} · {entry.status}</span>
              {entry.transactionHash ? <span className="hash">{entry.transactionHash}</span> : null}
            </div>
            {entry.status === "prepared" && entry.transactionHash === null ? (
              <button className="quiet-button" onClick={() => onAbandon(entry.intentHash)} type="button">
                Abandon unsigned intent
              </button>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
