import { describe, expect, it } from "vitest";
import { getAddress } from "viem";

import {
  createFrozenFundingIntent,
  fundingIntentInvalidationReason,
  loadFundingIntents,
  nextFundingStep,
  PROOFPAY_FUNDING_INTENT_KEY,
  saveFundingIntents,
  type FundingIntentStorage,
} from "../lib/funding-intent.js";
import { PROOFPAY_CHAIN_ID } from "../lib/proofpay-contract.js";
import { buildApprovalIntent, buildFundingPlan } from "../lib/transaction-intents.js";
import {
  beginWalletRequest,
  journalEntryFromIntent,
  transitionJournalEntry,
} from "../lib/transaction-journal.js";

const CLIENT = getAddress("0x2222222222222222222222222222222222222222");
const OTHER = getAddress("0x3333333333333333333333333333333333333333");
const TX_HASH = `0x${"a".repeat(64)}` as const;

class MemoryStorage implements FundingIntentStorage {
  readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

function intent(allowanceFxrp = 0n) {
  const plan = buildFundingPlan({
    usdTargetAtomic: 5_000_000n,
    quoteRequiredFxrp: 5_500_000n,
    price: 1_000_000n,
    priceDecimals: 6,
    toleranceBps: 200n,
    allowanceFxrp,
  });
  return createFrozenFundingIntent({
    account: CLIENT,
    invoiceId: 3n,
    plan,
    price: 1_000_000n,
    priceDecimals: 6,
    priceTimestamp: 1_900_000_000n,
    quoteDeadline: 1_900_000_300n,
  });
}

describe("ProofPay Phase 5C frozen funding intent", () => {
  it("ordinary funding requests one exact approval and then funds", () => {
    const frozen = intent();
    expect(nextFundingStep(frozen, 0n)).toBe("approve");
    expect(nextFundingStep(frozen, BigInt(frozen.maximumFxrp))).toBe("fund");
    expect(frozen.maximumFxrp).toBe("5610000");
    expect(frozen.maximumFxrp).not.toBe((2n ** 256n - 1n).toString());
  });

  it("keeps quote movement inside tolerance on the same intent", () => {
    const frozen = intent();
    expect(fundingIntentInvalidationReason(frozen, {
      account: CLIENT,
      chainId: PROOFPAY_CHAIN_ID,
      invoiceId: 3n,
      nowSeconds: 1_900_000_100n,
      currentRequiredFxrp: 5_609_999n,
    })).toBeNull();
  });

  it("invalidates an expired intent", () => {
    const frozen = intent();
    expect(fundingIntentInvalidationReason(frozen, {
      account: CLIENT,
      chainId: PROOFPAY_CHAIN_ID,
      invoiceId: 3n,
      nowSeconds: 1_900_000_300n,
    })).toBe("quote_expired");
  });

  it("invalidates movement beyond the accepted maximum", () => {
    const frozen = intent();
    expect(fundingIntentInvalidationReason(frozen, {
      account: CLIENT,
      chainId: PROOFPAY_CHAIN_ID,
      invoiceId: 3n,
      nowSeconds: 1_900_000_100n,
      currentRequiredFxrp: 5_610_001n,
    })).toBe("requirement_exceeds_maximum");
  });

  it("skips approval when the existing allowance covers the maximum", () => {
    const frozen = intent(9_000_000n);
    expect(nextFundingStep(frozen, 9_000_000n)).toBe("fund");
  });

  it("preserves the frozen preview, maximum, deadline, and hash across reload", () => {
    const storage = new MemoryStorage();
    const frozen = intent();
    saveFundingIntents(storage, [frozen]);
    expect(loadFundingIntents(storage)).toEqual([frozen]);
    expect(storage.getItem(PROOFPAY_FUNDING_INTENT_KEY)).not.toContain("private");
  });

  it("never repeats a confirmed exact approval when allowance remains sufficient", () => {
    const frozen = intent();
    const approval = journalEntryFromIntent(buildApprovalIntent({
      account: CLIENT,
      invoiceId: 3n,
      maximumFxrp: BigInt(frozen.maximumFxrp),
    }));
    const awaiting = beginWalletRequest([approval], approval.intentHash);
    const submitted = transitionJournalEntry(awaiting, approval.intentHash, "submitted", {
      transactionHash: TX_HASH,
    });
    const confirmed = transitionJournalEntry(submitted, approval.intentHash, "confirmed", {
      transactionHash: TX_HASH,
    });
    expect(confirmed[0]?.status).toBe("confirmed");
    expect(nextFundingStep(frozen, BigInt(frozen.maximumFxrp))).toBe("fund");
  });

  it("invalidates changed account, chain, or invoice context", () => {
    const frozen = intent();
    const base = { nowSeconds: 1_900_000_100n };
    expect(fundingIntentInvalidationReason(frozen, {
      ...base, account: OTHER, chainId: PROOFPAY_CHAIN_ID, invoiceId: 3n,
    })).toBe("account_changed");
    expect(fundingIntentInvalidationReason(frozen, {
      ...base, account: CLIENT, chainId: 1, invoiceId: 3n,
    })).toBe("chain_changed");
    expect(fundingIntentInvalidationReason(frozen, {
      ...base, account: CLIENT, chainId: PROOFPAY_CHAIN_ID, invoiceId: 4n,
    })).toBe("invoice_changed");
  });
});
