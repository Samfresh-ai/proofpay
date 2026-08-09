import { getAddress, type Address, type Hash } from "viem";

import {
  PROOFPAY_CHAIN_ID,
  PROOFPAY_CONTRACT_ADDRESS,
} from "./proofpay-contract";
import {
  proofPayTransactionActions,
  type ProofPayTransactionAction,
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
  if (candidate.quoteDeadline !== null && (
    typeof candidate.quoteDeadline !== "string" || !/^[0-9]+$/u.test(candidate.quoteDeadline)
  )) return null;
  if (candidate.transactionHash !== null && !isHash(candidate.transactionHash)) return null;
  if (typeof candidate.updatedAt !== "string" || Number.isNaN(Date.parse(candidate.updatedAt))) return null;
  const status = candidate.status === "awaiting_wallet" ? "prepared" : candidate.status as JournalStatus;
  return {
    chainId: PROOFPAY_CHAIN_ID,
    contract: getAddress(candidate.contract),
    account: getAddress(candidate.account),
    invoiceId: candidate.invoiceId,
    action: candidate.action as ProofPayTransactionAction,
    intentHash: candidate.intentHash,
    quoteDeadline: candidate.quoteDeadline as string | null,
    transactionHash: candidate.transactionHash as Hash | null,
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
    transactionHash: null,
    status: "prepared",
    updatedAt: now.toISOString(),
  };
}

export function upsertJournalEntry(
  entries: readonly JournalEntry[],
  entry: JournalEntry,
): JournalEntry[] {
  const withoutExisting = entries.filter((candidate) => candidate.intentHash !== entry.intentHash);
  return [...withoutExisting, entry].sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));
}

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
    return {
      ...entry,
      status,
      transactionHash: options.transactionHash === undefined ? entry.transactionHash : options.transactionHash,
      updatedAt: (options.now ?? new Date()).toISOString(),
    };
  });
  if (!found) throw new Error("Transaction intent is not present in the local journal.");
  return next;
}

export function findBlockingJournalEntry(
  entries: readonly JournalEntry[],
  input: {
    account: string;
    invoiceId: string;
    action: ProofPayTransactionAction;
  },
): JournalEntry | null {
  const blocked = new Set<JournalStatus>(
    input.action === "approve"
      ? ["prepared", "awaiting_wallet", "submitted"]
      : ["prepared", "awaiting_wallet", "submitted", "confirmed"],
  );
  return entries.find((entry) => (
    entry.chainId === PROOFPAY_CHAIN_ID
    && entry.contract.toLowerCase() === PROOFPAY_CONTRACT_ADDRESS.toLowerCase()
    && entry.account.toLowerCase() === input.account.toLowerCase()
    && entry.invoiceId === input.invoiceId
    && entry.action === input.action
    && blocked.has(entry.status)
  )) ?? null;
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
  let reconciled = [...entries];
  for (const entry of entries) {
    if (entry.status !== "submitted" || entry.transactionHash === null) continue;
    const receipt = await getReceipt(entry.transactionHash);
    if (!receipt) continue;
    reconciled = transitionJournalEntry(
      reconciled,
      entry.intentHash,
      receipt.status === "success" ? "confirmed" : "reverted",
      { transactionHash: entry.transactionHash, now },
    );
  }
  return reconciled;
}
