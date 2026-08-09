import { describe, expect, it } from "vitest";
import { encodeErrorResult, getAddress } from "viem";

import { proofPayAbi, PROOFPAY_CHAIN_ID, PROOFPAY_CONTRACT_ADDRESS } from "../lib/proofpay-contract.js";
import { buildEvidenceManifest, buildScopeManifest } from "../lib/proofpay-manifests.js";
import {
  buildApprovalIntent,
  buildFundingIntent,
  buildFundingPlan,
  buildReleaseIntent,
  buildTopUpIntent,
  decodeProofPayError,
  transactionStateCopy,
} from "../lib/transaction-intents.js";
import {
  abandonPreparedIntent,
  findBlockingJournalEntry,
  journalEntryFromIntent,
  loadJournal,
  PROOFPAY_JOURNAL_KEY,
  reconcileSubmittedEntries,
  saveJournal,
  transitionJournalEntry,
  type StorageLike,
} from "../lib/transaction-journal.js";
import { deriveInvoiceActions, getChainGuardState, getWalletRole } from "../lib/wallet-policy.js";

const CLIENT = getAddress("0x2222222222222222222222222222222222222222");
const FREELANCER = getAddress("0x1111111111111111111111111111111111111111");
const OTHER = getAddress("0x3333333333333333333333333333333333333333");
const TX_HASH = `0x${"a".repeat(64)}` as const;

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

describe("ProofPay Phase 5B1 wallet policy", () => {
  it("separates disconnected, client, freelancer, and unrelated roles", () => {
    expect(getWalletRole(null, CLIENT, FREELANCER)).toBe("disconnected");
    expect(getWalletRole(CLIENT.toLowerCase(), CLIENT, FREELANCER)).toBe("client");
    expect(getWalletRole(FREELANCER, CLIENT, FREELANCER)).toBe("freelancer");
    expect(getWalletRole(OTHER, CLIENT, FREELANCER)).toBe("unrelated");
  });

  it("requires Coston2 chain 114 before any wallet action", () => {
    expect(getChainGuardState(false, null)).toBe("no_wallet");
    expect(getChainGuardState(true, 1)).toBe("wrong_network");
    expect(getChainGuardState(true, PROOFPAY_CHAIN_ID)).toBe("ready");
  });

  it("enforces role, status, and deadline action boundaries", () => {
    const base = { client: CLIENT, freelancer: FREELANCER, deliveryDeadline: 1_000n };
    expect(deriveInvoiceActions({ ...base, account: CLIENT, status: "CREATED", now: 999n }).actions).toEqual(["fund"]);
    expect(deriveInvoiceActions({ ...base, account: CLIENT, status: "CREATED", now: 1_000n }).actions).toEqual([]);
    expect(deriveInvoiceActions({ ...base, account: FREELANCER, status: "CREATED", now: 999n }).actions).toEqual(["cancel"]);
    expect(deriveInvoiceActions({ ...base, account: FREELANCER, status: "FUNDED", now: 1_000n }).actions).toEqual(["submit_evidence"]);
    expect(deriveInvoiceActions({ ...base, account: CLIENT, status: "FUNDED", now: 1_001n }).actions).toEqual(["refund"]);
    expect(deriveInvoiceActions({ ...base, account: OTHER, status: "FUNDED", now: 999n }).actions).toEqual([]);
    expect(deriveInvoiceActions({ ...base, account: CLIENT, status: "RELEASED", now: 999n }).actions).toEqual([]);
  });

  it("requires a fresh release quote and selects top-up or release from its exact shortfall", () => {
    const base = {
      account: CLIENT,
      client: CLIENT,
      freelancer: FREELANCER,
      status: "SUBMITTED" as const,
      deliveryDeadline: 1_000n,
      now: 900n,
    };
    expect(deriveInvoiceActions({ ...base, quoteTopUpAtomic: null }).actions).toEqual([]);
    expect(deriveInvoiceActions({ ...base, quoteTopUpAtomic: 1n }).actions).toEqual(["top_up"]);
    expect(deriveInvoiceActions({ ...base, quoteTopUpAtomic: 0n }).actions).toEqual(["release"]);
  });
});

describe("ProofPay Phase 5B1 amounts, manifests, and copy", () => {
  it("reproduces the contract funding rule and approves only the accepted maximum", () => {
    const plan = buildFundingPlan({
      usdTargetAtomic: 5_000_000n,
      quoteRequiredFxrp: 5_500_000n,
      price: 1_000_000n,
      priceDecimals: 6,
      toleranceBps: 200n,
      allowanceFxrp: 5_000_000n,
    });
    expect(plan).toMatchObject({
      baseRequiredFxrp: 5_000_000n,
      protectedRequiredFxrp: 5_500_000n,
      maximumFxrp: 5_610_000n,
      approvalRequired: true,
      exactApprovalFxrp: 5_610_000n,
    });
    const approval = buildApprovalIntent({ account: CLIENT, invoiceId: 3n, maximumFxrp: plan.exactApprovalFxrp });
    expect(approval.amountAtomic).toBe("5610000");
    expect(approval.maximumAtomic).toBe("5610000");
    expect(approval.expectedResult).toContain("No escrow funding occurs");
    expect(() => buildFundingPlan({
      usdTargetAtomic: 5_000_000n,
      quoteRequiredFxrp: 5_499_999n,
      price: 1_000_000n,
      priceDecimals: 6,
      toleranceBps: 200n,
      allowanceFxrp: 0n,
    })).toThrow(/10% protection rule/u);
  });

  it("builds exact funding, top-up, and release intents without claiming preview completion", () => {
    const funding = buildFundingIntent({
      account: CLIENT, invoiceId: 3n, usdTargetAtomic: 5_000_000n,
      requiredFxrp: 5_500_000n, maximumFxrp: 5_610_000n, quoteDeadline: 2_000n,
    });
    const topUp = buildTopUpIntent({
      account: CLIENT, invoiceId: 6n, shortfallFxrp: 1_000_000n,
      maximumFxrp: 1_020_000n, quoteDeadline: 2_000n,
    });
    const release = buildReleaseIntent({
      account: CLIENT, invoiceId: 7n, payoutFxrp: 5_000_000n,
      refundFxrp: 500_000n, maximumFxrp: 5_100_000n, quoteDeadline: 2_000n,
    });
    expect(funding.maximumAtomic).toBe("5610000");
    expect(topUp.amountAtomic).toBe("1000000");
    expect(topUp.expectedResult).toContain("Nothing is released");
    expect(release.amountAtomic).toBe("5000000");
    expect(transactionStateCopy("prepared")).toContain("Simulation passed");
    expect(transactionStateCopy("prepared")).not.toMatch(/confirmed|completed/iu);
  });

  it("canonicalizes evidence and scope deterministically before hashing", () => {
    const first = buildEvidenceManifest({
      deliveryUrls: ["https://example.com/delivery/?b=2&a=1#result", "https://example.org/proof"],
      gitCommit: "ABCDEF1",
      completionNote: "  Acceptance tests passed.  ",
    });
    const second = buildEvidenceManifest({
      deliveryUrls: ["https://example.org/proof", "https://example.com/delivery?a=1&b=2"],
      gitCommit: "abcdef1",
      completionNote: "Acceptance tests passed.",
    });
    expect(first.hash).toBe(second.hash);
    expect(first.canonicalJson).toBe(second.canonicalJson);
    expect(first.primaryEvidenceUri).toBe("https://example.com/delivery?a=1&b=2");
    expect(() => buildEvidenceManifest({
      deliveryUrls: ["http://127.0.0.1/private"], completionNote: "Done",
    })).toThrow(/publicly reachable/u);

    const scope = buildScopeManifest({
      client: CLIENT, freelancer: FREELANCER, milestoneTitle: "Contract test",
      scope: ["Implement acceptance test", "Implement acceptance test", "Publish receipt"],
      usdTargetAtomic: 5_000_000n, deliveryDeadline: 2_000_000_000n,
    });
    expect(scope.value.scope).toEqual(["Implement acceptance test", "Publish receipt"]);
    expect(scope.hash).toMatch(/^0x[0-9a-f]{64}$/u);
  });

  it("maps wallet rejection and custom contract errors to specific product copy", () => {
    expect(decodeProofPayError({ code: 4001 })).toBe("Wallet request rejected. Nothing was submitted.");
    expect(decodeProofPayError({ cause: { cause: { code: 4001 } } })).toBe(
      "Wallet request rejected. Nothing was submitted.",
    );
    const data = encodeErrorResult({
      abi: proofPayAbi,
      errorName: "TopUpRequired",
      args: [5_000_000n, 4_000_000n, 1_000_000n],
    });
    expect(decodeProofPayError({ data })).toBe("The escrow is short by 1 FXRP. No payment was released.");
  });
});

describe("ProofPay Phase 5B1 browser-local journal", () => {
  it("persists, validates, downgrades an interrupted wallet prompt, and blocks duplicates", () => {
    const storage = new MemoryStorage();
    const intent = buildFundingIntent({
      account: CLIENT, invoiceId: 3n, usdTargetAtomic: 5_000_000n,
      requiredFxrp: 5_500_000n, maximumFxrp: 5_610_000n, quoteDeadline: 2_000n,
    });
    const prepared = journalEntryFromIntent(intent, new Date("2026-08-09T10:00:00Z"));
    const awaiting = transitionJournalEntry([prepared], intent.intentHash, "awaiting_wallet", {
      now: new Date("2026-08-09T10:00:01Z"),
    });
    saveJournal(storage, awaiting);
    const reloaded = loadJournal(storage);
    expect(reloaded[0]?.status).toBe("prepared");
    expect(findBlockingJournalEntry(reloaded, { account: CLIENT, invoiceId: "3", action: "fund" })).not.toBeNull();
    expect(storage.getItem(PROOFPAY_JOURNAL_KEY)).not.toContain("private");
    const abandoned = abandonPreparedIntent(reloaded, intent.intentHash);
    expect(findBlockingJournalEntry(abandoned, { account: CLIENT, invoiceId: "3", action: "fund" })).toBeNull();
  });

  it("reconciles a submitted receipt exactly once and preserves its transaction hash", async () => {
    const intent = buildFundingIntent({
      account: CLIENT, invoiceId: 3n, usdTargetAtomic: 5_000_000n,
      requiredFxrp: 5_500_000n, maximumFxrp: 5_610_000n, quoteDeadline: 2_000n,
    });
    const prepared = journalEntryFromIntent(intent, new Date("2026-08-09T10:00:00Z"));
    const submitted = transitionJournalEntry([prepared], intent.intentHash, "submitted", {
      transactionHash: TX_HASH,
      now: new Date("2026-08-09T10:00:01Z"),
    });
    let calls = 0;
    const confirmed = await reconcileSubmittedEntries(submitted, async (hash) => {
      calls += 1;
      expect(hash).toBe(TX_HASH);
      return { status: "success" };
    }, new Date("2026-08-09T10:00:02Z"));
    expect(calls).toBe(1);
    expect(confirmed[0]).toMatchObject({ status: "confirmed", transactionHash: TX_HASH });
    expect(findBlockingJournalEntry(confirmed, { account: CLIENT, invoiceId: "3", action: "fund" })).not.toBeNull();
  });

  it("drops malformed and cross-contract journal records", () => {
    const storage = new MemoryStorage();
    storage.setItem(PROOFPAY_JOURNAL_KEY, JSON.stringify({
      schemaVersion: 1,
      entries: [{
        chainId: 114,
        contract: getAddress("0x4444444444444444444444444444444444444444"),
        account: CLIENT,
        invoiceId: "3",
        action: "fund",
        intentHash: TX_HASH,
        quoteDeadline: null,
        transactionHash: null,
        status: "prepared",
        updatedAt: "2026-08-09T10:00:00Z",
      }],
    }));
    expect(loadJournal(storage)).toEqual([]);
    expect(PROOFPAY_CONTRACT_ADDRESS).not.toBe(getAddress("0x4444444444444444444444444444444444444444"));
  });
});
