import { getAddress, type Address, type Hash } from "viem";

import {
  PROOFPAY_CHAIN_ID,
  PROOFPAY_CONTRACT_ADDRESS,
} from "./proofpay-contract";
import {
  hashTopUpIntentIdentity,
  proofPayTransactionActions,
  type ProofPayTransactionAction,
  type TopUpQuoteIdentity,
  type TransactionIntent,
} from "./transaction-intents";

export const PROOFPAY_JOURNAL_KEY = "proofpay.transaction-journal.v1";
export const journalStatuses = [
  "prepared",
  "awaiting_wallet",
  "submitted",
  "confirmed",
  "reverted",
  "abandoned",
] as const;

export type JournalStatus = (typeof journalStatuses)[number];

export interface JournalEntry {
  chainId: 114;
  contract: Address;
  account: Address;
  invoiceId: string;
  action: ProofPayTransactionAction;
  intentHash: Hash;
  quoteDeadline: string | null;
  topUpQuote: TopUpQuoteIdentity | null;
  transactionHash: Hash | null;
  status: JournalStatus;
  updatedAt: string;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface JournalDocument {
  schemaVersion: 1;
  entries: readonly JournalEntry[];
}

export interface ReconciledReceipt {
  status: "success" | "reverted";
}

export interface SubmittedReceiptResolution {
  intentHash: Hash;
  transactionHash: Hash;
  receipt: ReconciledReceipt;
}

interface JournalScope {
  chainId: number;
  contract: string;
  account: string;
  invoiceId: string;
}

export type JournalBlockingInput = JournalScope & (
  | { action: "top_up"; intentHash: Hash }
  | { action: Exclude<ProofPayTransactionAction, "top_up">; intentHash?: never }
);

function isHash(value: unknown): value is Hash {
  return typeof value === "string" && /^0x[0-9a-f]{64}$/iu.test(value);
}

function isAddress(value: unknown): value is Address {
  if (typeof value !== "string") return false;
  try {
    getAddress(value);
    return true;
  } catch {
    return false;
  }
}

function isPositiveInvoiceId(value: unknown): value is string {
  return typeof value === "string" && /^[1-9][0-9]*$/u.test(value);
}

function isAtomicAmount(value: unknown, positive = false): value is string {
  return typeof value === "string" && (positive ? /^[1-9][0-9]*$/u : /^(?:0|[1-9][0-9]*)$/u).test(value);
}

function validateTopUpQuote(value: unknown): TopUpQuoteIdentity | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (
    !isAtomicAmount(candidate.lockedFxrpAtomic)
    || !isAtomicAmount(candidate.requiredTopUpAtomic, true)
    || !isAtomicAmount(candidate.acceptedMaximumAtomic, true)
    || !isAtomicAmount(candidate.quoteDeadline, true)
    || !isAtomicAmount(candidate.priceAtomic, true)
    || !Number.isInteger(candidate.priceDecimals)
    || (candidate.priceDecimals as number) < 0
    || (candidate.priceDecimals as number) > 18
    || !isAtomicAmount(candidate.priceTimestamp, true)
    || BigInt(candidate.acceptedMaximumAtomic) < BigInt(candidate.requiredTopUpAtomic)
  ) return null;
  return {
    lockedFxrpAtomic: candidate.lockedFxrpAtomic,
    requiredTopUpAtomic: candidate.requiredTopUpAtomic,
    acceptedMaximumAtomic: candidate.acceptedMaximumAtomic,
    quoteDeadline: candidate.quoteDeadline,
    priceAtomic: candidate.priceAtomic,
    priceDecimals: candidate.priceDecimals as number,
    priceTimestamp: candidate.priceTimestamp,
  };
}

function validateEntry(value: unknown): JournalEntry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.chainId !== PROOFPAY_CHAIN_ID) return null;
  if (!isAddress(candidate.contract) || candidate.contract.toLowerCase() !== PROOFPAY_CONTRACT_ADDRESS.toLowerCase()) {
    return null;
  }
  if (!isAddress(candidate.account) || !isPositiveInvoiceId(candidate.invoiceId)) return null;
  if (!proofPayTransactionActions.includes(candidate.action as ProofPayTransactionAction)) return null;
  if (!isHash(candidate.intentHash) || !journalStatuses.includes(candidate.status as JournalStatus)) return null;
  const storedStatus = candidate.status as JournalStatus;
  if (candidate.quoteDeadline !== null && (
    typeof candidate.quoteDeadline !== "string" || !/^[0-9]+$/u.test(candidate.quoteDeadline)
  )) return null;
  const suppliedTopUpQuote = candidate.topUpQuote !== undefined && candidate.topUpQuote !== null;
  let topUpQuote = validateTopUpQuote(candidate.topUpQuote);
  if (suppliedTopUpQuote && topUpQuote === null) {
    if (candidate.action !== "top_up" || storedStatus === "prepared") return null;
    // A partial legacy identity is never trusted for exact matching, but an already-open
    // wallet request or broadcast must remain quarantined rather than disappear.
    topUpQuote = null;
  }
  if (candidate.action !== "top_up" && topUpQuote !== null) return null;
  if (topUpQuote && candidate.quoteDeadline !== topUpQuote.quoteDeadline) {
    if (candidate.action !== "top_up" || storedStatus === "prepared") return null;
    // A cross-field mismatch makes the quote identity untrusted, but an open wallet
    // request or broadcast must remain quarantined instead of disappearing on reload.
    topUpQuote = null;
  }
  if (candidate.transactionHash !== null && !isHash(candidate.transactionHash)) return null;
  const transactionHash = candidate.transactionHash as Hash | null;
  if (["submitted", "confirmed", "reverted"].includes(storedStatus)) {
    if (transactionHash === null) return null;
  } else if (transactionHash !== null) {
    return null;
  }
  if (
    candidate.action === "top_up"
    && topUpQuote === null
    && storedStatus === "prepared"
  ) {
    // Legacy unsigned top-ups lack enough identity to sign safely, so they are dropped.
    // Awaiting/submitted entries remain quarantined and scope-blocking because a wallet
    // may already have broadcast; terminal entries remain untrusted, nonblocking history.
    return null;
  }
  if (candidate.action === "top_up" && topUpQuote !== null) {
    const expectedHash = hashTopUpIntentIdentity({
      chainId: candidate.chainId as number,
      contract: candidate.contract as string,
      invoiceId: candidate.invoiceId as string,
      account: candidate.account as string,
      action: "top_up",
      ...topUpQuote,
    });
    if (candidate.intentHash.toLowerCase() !== expectedHash.toLowerCase()) {
      if (storedStatus === "prepared") return null;
      topUpQuote = null;
    }
  }
  if (typeof candidate.updatedAt !== "string" || Number.isNaN(Date.parse(candidate.updatedAt))) return null;
  const status = storedStatus;
  return {
    chainId: PROOFPAY_CHAIN_ID,
    contract: getAddress(candidate.contract),
    account: getAddress(candidate.account),
    invoiceId: candidate.invoiceId,
    action: candidate.action as ProofPayTransactionAction,
    intentHash: candidate.intentHash,
    quoteDeadline: candidate.quoteDeadline as string | null,
    topUpQuote,
    transactionHash,
    status,
    updatedAt: candidate.updatedAt,
  };
}

export function loadJournal(storage: StorageLike): JournalEntry[] {
  const serialized = storage.getItem(PROOFPAY_JOURNAL_KEY);
  if (!serialized) return [];
  try {
    const parsed = JSON.parse(serialized) as Partial<JournalDocument>;
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.entries)) return [];
    return parsed.entries.flatMap((entry) => {
      const valid = validateEntry(entry);
      return valid ? [valid] : [];
    });
  } catch {
    return [];
  }
}

export function saveJournal(storage: StorageLike, entries: readonly JournalEntry[]): void {
  const document: JournalDocument = { schemaVersion: 1, entries };
  storage.setItem(PROOFPAY_JOURNAL_KEY, JSON.stringify(document));
}

export function journalEntryFromIntent(
  intent: TransactionIntent,
  now = new Date(),
): JournalEntry {
  return {
    chainId: PROOFPAY_CHAIN_ID,
    contract: intent.contract,
    account: intent.account,
    invoiceId: intent.invoiceId,
    action: intent.action,
    intentHash: intent.intentHash,
    quoteDeadline: intent.quoteDeadline,
    topUpQuote: intent.topUpQuote,
    transactionHash: null,
    status: "prepared",
    updatedAt: now.toISOString(),
  };
}

export function upsertJournalEntry(
  entries: readonly JournalEntry[],
  entry: JournalEntry,
): JournalEntry[] {
  const existing = entries.find((candidate) => candidate.intentHash.toLowerCase() === entry.intentHash.toLowerCase());
  if (
    entry.action === "top_up"
    && existing?.action === "top_up"
    && ["submitted", "confirmed", "reverted"].includes(existing.status)
  ) {
    throw new Error("This top-up intent has already been broadcast and cannot be prepared again.");
  }
  const withoutExisting = entries.filter((candidate) => candidate.intentHash !== entry.intentHash);
  return [...withoutExisting, entry].sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));
}

export function journalBlockingInputFromIntent(intent: TransactionIntent): JournalBlockingInput {
  const scope = {
    chainId: intent.chainId,
    contract: intent.contract,
    account: intent.account,
    invoiceId: intent.invoiceId,
  };
  return intent.action === "top_up"
    ? { ...scope, action: "top_up", intentHash: intent.intentHash }
    : { ...scope, action: intent.action };
}

export function prepareJournalIntent(
  entries: readonly JournalEntry[],
  intent: TransactionIntent,
  now = new Date(),
): { entry: JournalEntry; entries: JournalEntry[] } {
  const blocking = findBlockingJournalEntry(entries, journalBlockingInputFromIntent(intent));
  if (blocking) {
    throw new Error(`A ${blocking.status} ${blocking.action.replaceAll("_", " ")} intent already exists for this invoice.`);
  }
  const entry = journalEntryFromIntent(intent, now);
  return { entry, entries: upsertJournalEntry(entries, entry) };
}

const allowedTransitions: Record<JournalStatus, readonly JournalStatus[]> = {
  prepared: ["awaiting_wallet", "abandoned"],
  awaiting_wallet: ["prepared", "submitted"],
  submitted: ["confirmed", "reverted"],
  confirmed: [],
  reverted: [],
  abandoned: [],
};

export function transitionJournalEntry(
  entries: readonly JournalEntry[],
  intentHash: Hash,
  status: JournalStatus,
  options: { transactionHash?: Hash | null; now?: Date } = {},
): JournalEntry[] {
  let found = false;
  const next = entries.map((entry) => {
    if (entry.intentHash !== intentHash) return entry;
    found = true;
    if (!allowedTransitions[entry.status].includes(status)) {
      throw new Error(`Transaction intent cannot transition from ${entry.status} to ${status}.`);
    }
    let transactionHash = entry.transactionHash;
    if (status === "submitted") {
      if (options.transactionHash === undefined || options.transactionHash === null || !isHash(options.transactionHash)) {
        throw new Error("A submitted transaction requires its transaction hash.");
      }
      transactionHash = options.transactionHash;
    } else if (status === "confirmed" || status === "reverted") {
      if (entry.transactionHash === null) {
        throw new Error("A terminal receipt status requires the submitted transaction hash.");
      }
      if (
        options.transactionHash !== undefined
        && options.transactionHash !== null
        && options.transactionHash.toLowerCase() !== entry.transactionHash.toLowerCase()
      ) {
        throw new Error("Receipt transaction hash does not match the submitted intent.");
      }
      transactionHash = entry.transactionHash;
    } else {
      if (options.transactionHash !== undefined && options.transactionHash !== null) {
        throw new Error(`${status} intents cannot carry a transaction hash.`);
      }
      transactionHash = null;
    }
    return {
      ...entry,
      status,
      transactionHash,
      updatedAt: (options.now ?? new Date()).toISOString(),
    };
  });
  if (!found) throw new Error("Transaction intent is not present in the local journal.");
  return next;
}

export function beginWalletRequest(
  entries: readonly JournalEntry[],
  intentHash: Hash,
  now = new Date(),
): JournalEntry[] {
  const entry = entries.find((candidate) => candidate.intentHash === intentHash);
  if (!entry || entry.status !== "prepared" || entry.transactionHash !== null) {
    throw new Error("Only the current unsigned prepared intent can open a wallet request.");
  }
  const unresolvedSameScope = entries.find((candidate) => (
    candidate.intentHash !== entry.intentHash
    && candidate.chainId === entry.chainId
    && candidate.contract.toLowerCase() === entry.contract.toLowerCase()
    && candidate.account.toLowerCase() === entry.account.toLowerCase()
    && candidate.invoiceId === entry.invoiceId
    && candidate.action === entry.action
    && (candidate.status === "awaiting_wallet" || candidate.status === "submitted")
  ));
  if (unresolvedSameScope) {
    throw new Error("An unresolved wallet request for this action must be settled before signing.");
  }
  return transitionJournalEntry(entries, intentHash, "awaiting_wallet", { now });
}

export function findBlockingJournalEntry(
  entries: readonly JournalEntry[],
  input: JournalBlockingInput,
): JournalEntry | null {
  const scoped = entries.filter((entry) => (
    entry.chainId === input.chainId
    && entry.contract.toLowerCase() === input.contract.toLowerCase()
    && entry.account.toLowerCase() === input.account.toLowerCase()
    && entry.invoiceId === input.invoiceId
    && entry.action === input.action
  ));
  if (input.action === "top_up") {
    const unresolvedWalletOrSubmission = scoped.find((entry) => (
      entry.status === "awaiting_wallet" || entry.status === "submitted"
    ));
    if (unresolvedWalletOrSubmission) return unresolvedWalletOrSubmission;
    return scoped.find((entry) => (
      entry.topUpQuote !== null
      && entry.intentHash.toLowerCase() === input.intentHash.toLowerCase()
      && ["prepared", "confirmed", "reverted"].includes(entry.status)
    )) ?? null;
  }
  const blocked = new Set<JournalStatus>(
    input.action === "approve"
      ? ["prepared", "awaiting_wallet", "submitted"]
      : ["prepared", "awaiting_wallet", "submitted", "confirmed"],
  );
  return scoped.find((entry) => blocked.has(entry.status)) ?? null;
}

export function abandonPreparedIntent(
  entries: readonly JournalEntry[],
  intentHash: Hash,
  now = new Date(),
): JournalEntry[] {
  const entry = entries.find((candidate) => candidate.intentHash === intentHash);
  if (!entry || entry.status !== "prepared" || entry.transactionHash !== null) {
    throw new Error("Only an unsigned prepared intent can be abandoned.");
  }
  return transitionJournalEntry(entries, intentHash, "abandoned", { now });
}

export async function reconcileSubmittedEntries(
  entries: readonly JournalEntry[],
  getReceipt: (hash: Hash) => Promise<ReconciledReceipt | null>,
  now = new Date(),
): Promise<JournalEntry[]> {
  const resolutions = await collectSubmittedReceiptResolutions(entries, getReceipt);
  return applySubmittedReceiptResolutions(entries, resolutions, now);
}

export async function collectSubmittedReceiptResolutions(
  entries: readonly JournalEntry[],
  getReceipt: (hash: Hash) => Promise<ReconciledReceipt | null>,
): Promise<SubmittedReceiptResolution[]> {
  const resolutions: SubmittedReceiptResolution[] = [];
  for (const entry of entries) {
    if (entry.status !== "submitted" || entry.transactionHash === null) continue;
    const receipt = await getReceipt(entry.transactionHash);
    if (!receipt) continue;
    resolutions.push({
      intentHash: entry.intentHash,
      transactionHash: entry.transactionHash,
      receipt,
    });
  }
  return resolutions;
}

export function applySubmittedReceiptResolutions(
  entries: readonly JournalEntry[],
  resolutions: readonly SubmittedReceiptResolution[],
  now = new Date(),
): JournalEntry[] {
  let reconciled = [...entries];
  for (const resolution of resolutions) {
    const current = reconciled.find((entry) => entry.intentHash === resolution.intentHash);
    if (
      !current
      || current.status !== "submitted"
      || current.transactionHash === null
      || current.transactionHash.toLowerCase() !== resolution.transactionHash.toLowerCase()
    ) continue;
    reconciled = transitionJournalEntry(
      reconciled,
      current.intentHash,
      resolution.receipt.status === "success" ? "confirmed" : "reverted",
      { transactionHash: current.transactionHash, now },
    );
  }
  return reconciled;
}
