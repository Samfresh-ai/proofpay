import { describe, expect, it } from "vitest";
import { getAddress, type Hash } from "viem";

import { PROOFPAY_CHAIN_ID, PROOFPAY_CONTRACT_ADDRESS } from "../lib/proofpay-contract.js";
import {
  buildTopUpIntent,
  buildTransactionIntent,
  hashTopUpIntentIdentity,
  transactionIntentInvalidationReason,
  type TopUpIntentIdentity,
  type TransactionIntent,
} from "../lib/transaction-intents.js";
import {
  abandonPreparedIntent,
  applySubmittedReceiptResolutions,
  beginWalletRequest,
  collectSubmittedReceiptResolutions,
  findBlockingJournalEntry,
  journalEntryFromIntent,
  loadJournal,
  prepareJournalIntent,
  PROOFPAY_JOURNAL_KEY,
  reconcileSubmittedEntries,
  saveJournal,
  transitionJournalEntry,
  upsertJournalEntry,
  type JournalEntry,
  type StorageLike,
} from "../lib/transaction-journal.js";
import { deriveInvoiceActions } from "../lib/wallet-policy.js";

const CLIENT = getAddress("0x2222222222222222222222222222222222222222");
const OTHER = getAddress("0x3333333333333333333333333333333333333333");
const OTHER_CONTRACT = getAddress("0x4444444444444444444444444444444444444444");
const FREELANCER = getAddress("0x1111111111111111111111111111111111111111");
const FIRST_TX = `0x${"a".repeat(64)}` as Hash;
const SECOND_TX = `0x${"b".repeat(64)}` as Hash;

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

function firstTopUp(): TransactionIntent {
  return buildTopUpIntent({
    account: CLIENT,
    invoiceId: 9n,
    lockedFxrp: 5_500_000n,
    shortfallFxrp: 55_556n,
    maximumFxrp: 56_112n,
    quoteDeadline: 2_000n,
    price: 900_000n,
    priceDecimals: 6,
    priceTimestamp: 1_900n,
  });
}

function secondTopUp(): TransactionIntent {
  return buildTopUpIntent({
    account: CLIENT,
    invoiceId: 9n,
    lockedFxrp: 5_555_556n,
    shortfallFxrp: 694_444n,
    maximumFxrp: 701_389n,
    quoteDeadline: 2_100n,
    price: 800_000n,
    priceDecimals: 6,
    priceTimestamp: 2_000n,
  });
}

function topUpBlockingInput(intent: TransactionIntent) {
  if (intent.action !== "top_up") throw new Error("Expected a top-up intent.");
  return {
    chainId: intent.chainId,
    contract: intent.contract,
    account: intent.account,
    invoiceId: intent.invoiceId,
    action: "top_up" as const,
    intentHash: intent.intentHash,
  };
}

function confirm(entry: JournalEntry, transactionHash: Hash): JournalEntry[] {
  const submitted = submit([entry], entry.intentHash, transactionHash);
  return transitionJournalEntry(submitted, entry.intentHash, "confirmed", { transactionHash });
}

function submit(
  entries: readonly JournalEntry[],
  intentHash: Hash,
  transactionHash: Hash,
  now = new Date(),
): JournalEntry[] {
  const awaiting = beginWalletRequest(entries, intentHash, now);
  return transitionJournalEntry(awaiting, intentHash, "submitted", { transactionHash, now });
}

function identity(intent: TransactionIntent): TopUpIntentIdentity {
  if (!intent.topUpQuote) throw new Error("Expected a complete top-up quote identity.");
  return {
    chainId: intent.chainId,
    contract: intent.contract,
    invoiceId: intent.invoiceId,
    account: intent.account,
    action: intent.action,
    ...intent.topUpQuote,
  };
}

describe("ProofPay Phase 5D repeated top-up intents", () => {
  it("hashes every required identity field deterministically", () => {
    const first = firstTopUp();
    const same = firstTopUp();
    const second = secondTopUp();

    expect(first.topUpQuote).toEqual({
      lockedFxrpAtomic: "5500000",
      requiredTopUpAtomic: "55556",
      acceptedMaximumAtomic: "56112",
      quoteDeadline: "2000",
      priceAtomic: "900000",
      priceDecimals: 6,
      priceTimestamp: "1900",
    });
    expect(first.intentHash).toBe(same.intentHash);
    expect(first.intentHash).toBe(hashTopUpIntentIdentity(identity(first)));
    expect(second.intentHash).not.toBe(first.intentHash);
    expect(second.topUpQuote?.requiredTopUpAtomic).toBe("694444");

    const base = identity(first);
    const mutations: Record<string, TopUpIntentIdentity> = {
      chainId: { ...base, chainId: base.chainId + 1 },
      contract: { ...base, contract: OTHER_CONTRACT },
      invoiceId: { ...base, invoiceId: "10" },
      account: { ...base, account: OTHER },
      action: { ...base, action: "release" },
      lockedFxrpAtomic: { ...base, lockedFxrpAtomic: "5500001" },
      requiredTopUpAtomic: { ...base, requiredTopUpAtomic: "55557" },
      acceptedMaximumAtomic: { ...base, acceptedMaximumAtomic: "56113" },
      quoteDeadline: { ...base, quoteDeadline: "2001" },
      priceAtomic: { ...base, priceAtomic: "900001" },
      priceDecimals: { ...base, priceDecimals: 7 },
      priceTimestamp: { ...base, priceTimestamp: "1901" },
    };
    for (const [field, mutated] of Object.entries(mutations)) {
      expect(hashTopUpIntentIdentity(mutated), field).not.toBe(first.intentHash);
    }
  });

  it("confirms two distinct top-ups while permanently rejecting reuse of either broadcast intent", async () => {
    const first = firstTopUp();
    const second = secondTopUp();
    const firstPrepared = journalEntryFromIntent(first, new Date("2026-08-09T10:00:00Z"));

    expect(findBlockingJournalEntry([firstPrepared], topUpBlockingInput(first))?.status).toBe("prepared");
    const firstSubmitted = submit(
      [firstPrepared],
      first.intentHash,
      FIRST_TX,
      new Date("2026-08-09T10:00:01Z"),
    );
    expect(findBlockingJournalEntry(firstSubmitted, topUpBlockingInput(second))?.status).toBe("submitted");
    expect(() => transitionJournalEntry(firstSubmitted, first.intentHash, "submitted", {
      transactionHash: SECOND_TX,
    })).toThrow(/cannot transition from submitted to submitted/u);

    const firstConfirmed = await reconcileSubmittedEntries(firstSubmitted, async () => ({ status: "success" }),
      new Date("2026-08-09T10:00:02Z"));
    expect(findBlockingJournalEntry(firstConfirmed, topUpBlockingInput(first))?.status).toBe("confirmed");
    expect(findBlockingJournalEntry(firstConfirmed, topUpBlockingInput(second))).toBeNull();

    const withSecondPrepared = upsertJournalEntry(
      firstConfirmed,
      journalEntryFromIntent(second, new Date("2026-08-09T10:01:00Z")),
    );
    expect(withSecondPrepared).toHaveLength(2);
    expect(withSecondPrepared.find((entry) => entry.intentHash === first.intentHash)?.status).toBe("confirmed");

    const secondSubmitted = submit(
      withSecondPrepared,
      second.intentHash,
      SECOND_TX,
      new Date("2026-08-09T10:01:01Z"),
    );
    const bothConfirmed = await reconcileSubmittedEntries(secondSubmitted, async () => ({ status: "success" }),
      new Date("2026-08-09T10:01:02Z"));
    expect(bothConfirmed.filter((entry) => entry.status === "confirmed")).toHaveLength(2);
    expect(findBlockingJournalEntry(bothConfirmed, topUpBlockingInput(second))?.status).toBe("confirmed");
    expect(() => upsertJournalEntry(bothConfirmed, journalEntryFromIntent(second))).toThrow(/already been broadcast/u);
  });

  it("reloads and reconciles an unresolved submission before a later intent is allowed", async () => {
    const storage = new MemoryStorage();
    const first = firstTopUp();
    const second = secondTopUp();
    const submitted = submit([journalEntryFromIntent(first)], first.intentHash, FIRST_TX);
    saveJournal(storage, submitted);

    const reloaded = loadJournal(storage);
    expect(reloaded[0]?.topUpQuote).toEqual(first.topUpQuote);
    const stillPending = await reconcileSubmittedEntries(reloaded, async () => null);
    expect(findBlockingJournalEntry(stillPending, topUpBlockingInput(second))?.status).toBe("submitted");

    const reconciled = await reconcileSubmittedEntries(stillPending, async (hash) => {
      expect(hash).toBe(FIRST_TX);
      return { status: "success" };
    });
    expect(reconciled[0]).toMatchObject({ status: "confirmed", transactionHash: FIRST_TX });
    expect(findBlockingJournalEntry(reconciled, topUpBlockingInput(second))).toBeNull();
  });

  it("keeps terminal history without letting it block a distinct later quote", () => {
    const first = firstTopUp();
    const second = secondTopUp();
    const firstEntry = journalEntryFromIntent(first);
    const abandoned = abandonPreparedIntent([firstEntry], first.intentHash);
    expect(findBlockingJournalEntry(abandoned, topUpBlockingInput(second))).toBeNull();

    const submitted = submit([firstEntry], first.intentHash, FIRST_TX);
    const reverted = transitionJournalEntry(submitted, first.intentHash, "reverted", { transactionHash: FIRST_TX });
    expect(findBlockingJournalEntry(reverted, topUpBlockingInput(first))?.status).toBe("reverted");
    expect(findBlockingJournalEntry(reverted, topUpBlockingInput(second))).toBeNull();
  });

  it("invalidates the active intent across account, chain, contract, and invoice changes", () => {
    const intent = firstTopUp();
    const current = {
      account: CLIENT,
      chainId: PROOFPAY_CHAIN_ID,
      contract: PROOFPAY_CONTRACT_ADDRESS,
      invoiceId: 9n,
    };
    expect(transactionIntentInvalidationReason(intent, current)).toBeNull();
    expect(transactionIntentInvalidationReason(intent, { ...current, account: OTHER })).toBe("account_changed");
    expect(transactionIntentInvalidationReason(intent, { ...current, chainId: 1 })).toBe("chain_changed");
    expect(transactionIntentInvalidationReason(intent, { ...current, contract: OTHER_CONTRACT })).toBe("contract_changed");
    expect(transactionIntentInvalidationReason(intent, { ...current, invoiceId: 10n })).toBe("invoice_changed");

    const prepared = [journalEntryFromIntent(intent)];
    for (const changedScope of [
      { ...topUpBlockingInput(intent), account: OTHER },
      { ...topUpBlockingInput(intent), chainId: 1 },
      { ...topUpBlockingInput(intent), contract: OTHER_CONTRACT },
      { ...topUpBlockingInput(intent), invoiceId: "10" },
    ]) {
      expect(findBlockingJournalEntry(prepared, changedScope)).toBeNull();
    }
  });

  it("uses the current journal for atomic prepare and permits only one wallet request", () => {
    const first = firstTopUp();
    const second = secondTopUp();
    let current = [journalEntryFromIntent(first)];
    let sendInvocations = 0;

    const claimWalletRequest = () => {
      current = beginWalletRequest(current, first.intentHash);
      sendInvocations += 1;
    };
    claimWalletRequest();
    expect(() => claimWalletRequest()).toThrow(/Only the current unsigned prepared intent/u);
    expect(() => transitionJournalEntry(current, first.intentHash, "awaiting_wallet")).toThrow(
      /cannot transition from awaiting_wallet to awaiting_wallet/u,
    );
    expect(() => transitionJournalEntry(current, first.intentHash, "submitted", {
      transactionHash: null,
    })).toThrow(/requires its transaction hash/u);
    expect(sendInvocations).toBe(1);

    current = transitionJournalEntry(current, first.intentHash, "submitted", { transactionHash: FIRST_TX });
    expect(() => prepareJournalIntent(current, second)).toThrow(/submitted top up intent already exists/u);
    expect(() => transitionJournalEntry(current, first.intentHash, "prepared")).toThrow(
      /cannot transition from submitted to prepared/u,
    );
  });

  it("rejects malformed reload states and safely quarantines identity-less legacy top-ups", async () => {
    const storage = new MemoryStorage();
    const first = firstTopUp();
    const second = secondTopUp();
    const prepared = journalEntryFromIntent(first, new Date("2026-08-09T10:00:00Z"));
    const partialQuote = { ...prepared.topUpQuote } as Record<string, unknown>;
    delete partialQuote.priceTimestamp;
    const malformed = [
      { ...prepared, topUpQuote: undefined },
      { ...prepared, topUpQuote: partialQuote },
      { ...prepared, quoteDeadline: "2001" },
      { ...prepared, status: "submitted", transactionHash: null },
      { ...prepared, status: "confirmed", transactionHash: null },
      { ...prepared, status: "prepared", transactionHash: FIRST_TX },
      { ...prepared, status: "abandoned", transactionHash: FIRST_TX },
    ];
    for (const entry of malformed) {
      storage.setItem(PROOFPAY_JOURNAL_KEY, JSON.stringify({ schemaVersion: 1, entries: [entry] }));
      expect(loadJournal(storage)).toEqual([]);
    }

    const awaiting = beginWalletRequest([prepared], first.intentHash);
    saveJournal(storage, awaiting);
    const preservedAwaiting = loadJournal(storage);
    expect(preservedAwaiting[0]).toMatchObject({ status: "awaiting_wallet", transactionHash: null });
    expect(findBlockingJournalEntry(preservedAwaiting, topUpBlockingInput(second))?.status).toBe("awaiting_wallet");
    expect(() => beginWalletRequest(preservedAwaiting, first.intentHash)).toThrow(
      /Only the current unsigned prepared intent/u,
    );

    storage.setItem(PROOFPAY_JOURNAL_KEY, JSON.stringify({
      schemaVersion: 1,
      entries: [{ ...awaiting[0], quoteDeadline: "2001" }],
    }));
    const mismatchedAwaiting = loadJournal(storage);
    expect(mismatchedAwaiting[0]).toMatchObject({ status: "awaiting_wallet", topUpQuote: null });
    expect(findBlockingJournalEntry(mismatchedAwaiting, topUpBlockingInput(second))?.status).toBe("awaiting_wallet");

    storage.setItem(PROOFPAY_JOURNAL_KEY, JSON.stringify({
      schemaVersion: 1,
      entries: [{ ...prepared, status: "awaiting_wallet", topUpQuote: undefined }],
    }));
    const legacyAwaiting = loadJournal(storage);
    expect(legacyAwaiting[0]).toMatchObject({ status: "awaiting_wallet", topUpQuote: null });
    expect(findBlockingJournalEntry(legacyAwaiting, topUpBlockingInput(second))?.status).toBe("awaiting_wallet");

    const legacySubmitted = {
      ...prepared,
      topUpQuote: undefined,
      status: "submitted",
      transactionHash: FIRST_TX,
    };
    storage.setItem(PROOFPAY_JOURNAL_KEY, JSON.stringify({ schemaVersion: 1, entries: [legacySubmitted] }));
    const quarantined = loadJournal(storage);
    expect(quarantined[0]).toMatchObject({ status: "submitted", topUpQuote: null, transactionHash: FIRST_TX });
    expect(findBlockingJournalEntry(quarantined, topUpBlockingInput(second))?.status).toBe("submitted");
    const reconciled = await reconcileSubmittedEntries(quarantined, async () => ({ status: "success" }));
    expect(reconciled[0]).toMatchObject({ status: "confirmed", topUpQuote: null, transactionHash: FIRST_TX });

    storage.setItem(PROOFPAY_JOURNAL_KEY, JSON.stringify({
      schemaVersion: 1,
      entries: [{ ...submit([prepared], first.intentHash, FIRST_TX)[0], quoteDeadline: "2001" }],
    }));
    const mismatchedSubmitted = loadJournal(storage);
    expect(mismatchedSubmitted[0]).toMatchObject({
      status: "submitted",
      topUpQuote: null,
      transactionHash: FIRST_TX,
    });
    expect(findBlockingJournalEntry(mismatchedSubmitted, topUpBlockingInput(second))?.status).toBe("submitted");

    for (const terminal of [
      { status: "confirmed", transactionHash: FIRST_TX },
      { status: "reverted", transactionHash: FIRST_TX },
      { status: "abandoned", transactionHash: null },
    ] as const) {
      storage.setItem(PROOFPAY_JOURNAL_KEY, JSON.stringify({
        schemaVersion: 1,
        entries: [{ ...prepared, ...terminal, topUpQuote: undefined }],
      }));
      const history = loadJournal(storage);
      expect(history[0]).toMatchObject({ status: terminal.status, topUpQuote: null });
      expect(findBlockingJournalEntry(history, topUpBlockingInput(first))).toBeNull();
      expect(findBlockingJournalEntry(history, topUpBlockingInput(second))).toBeNull();
    }
  });

  it("merges delayed receipt results into the latest journal without discarding newer intents", async () => {
    const first = firstTopUp();
    const submitted = submit([journalEntryFromIntent(first)], first.intentHash, FIRST_TX);
    let resolveReceipt: ((receipt: { status: "success" }) => void) | undefined;
    const pendingResolutions = collectSubmittedReceiptResolutions(submitted, async () => (
      await new Promise<{ status: "success" }>((resolve) => {
        resolveReceipt = resolve;
      })
    ));

    const approvalIntent = buildTransactionIntent({
      action: "approve",
      actionLabel: "Approve a later maximum",
      account: CLIENT,
      invoiceId: "9",
      token: "FXRP",
      tokenAddress: null,
      amountAtomic: "1",
      amountDisplay: "0.000001 FXRP",
      quoteDeadline: null,
      maximumAtomic: "1",
      maximumDisplay: "0.000001 FXRP",
      expectedResult: "Update allowance only.",
    });
    const latest = upsertJournalEntry(submitted, journalEntryFromIntent(approvalIntent));
    resolveReceipt?.({ status: "success" });
    const resolutions = await pendingResolutions;
    const merged = applySubmittedReceiptResolutions(latest, resolutions);

    expect(merged).toHaveLength(2);
    expect(merged.find((entry) => entry.intentHash === first.intentHash)?.status).toBe("confirmed");
    expect(merged.find((entry) => entry.intentHash === approvalIntent.intentHash)?.status).toBe("prepared");
  });

  it("offers no top-up action when the refreshed release quote has no shortfall", () => {
    const context = {
      account: CLIENT,
      client: CLIENT,
      freelancer: FREELANCER,
      status: "SUBMITTED" as const,
      deliveryDeadline: 3_000n,
      now: 2_000n,
    };
    expect(deriveInvoiceActions({ ...context, quoteTopUpAtomic: 1n }).actions).toEqual(["top_up"]);
    expect(deriveInvoiceActions({ ...context, quoteTopUpAtomic: 0n }).actions).toEqual(["release"]);
    expect(deriveInvoiceActions({ ...context, quoteTopUpAtomic: null }).actions).toEqual([]);
  });

  it("retains confirmed blocking for every one-time action", () => {
    const oneTimeActions = ["fund", "submit_evidence", "release", "cancel", "refund"] as const;
    for (const action of oneTimeActions) {
      const intent = buildTransactionIntent({
        action,
        actionLabel: action,
        account: CLIENT,
        invoiceId: "9",
        token: "None",
        tokenAddress: null,
        amountAtomic: null,
        amountDisplay: "No token transfer",
        quoteDeadline: null,
        maximumAtomic: null,
        maximumDisplay: "Not applicable",
        expectedResult: `${action} completes once.`,
      });
      const confirmed = confirm(journalEntryFromIntent(intent), FIRST_TX);
      expect(findBlockingJournalEntry(confirmed, {
        chainId: PROOFPAY_CHAIN_ID,
        contract: PROOFPAY_CONTRACT_ADDRESS,
        account: CLIENT,
        invoiceId: "9",
        action,
      })?.status).toBe("confirmed");
    }
  });
});
