import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { keccak256, toHex } from "viem";

import {
  ProofPayDataError,
  __test,
  formatAtomic,
  formatFxrp,
  formatPrice,
  formatTimestamp,
  formatUsd,
  getInvoiceView,
  getReceiptView,
  normalizeProofPayDataMode,
  parseInvoiceId,
  shortenHex,
} from "../lib/proofpay.js";

const previousMode = process.env.PROOFPAY_DATA_MODE;
const previousNodeEnv = process.env.NODE_ENV;
const mutableEnvironment = process.env as Record<string, string | undefined>;
const previousFixtureAuth = process.env.PROOFPAY_FIXTURE_AUTH;

function validReceiptLocator() {
  return {
    network: { chainId: 114 },
    invoice: { invoiceId: "1" },
    contract: { address: __test.EXPECTED_CONTRACT_ADDRESS },
    transactions: {
      create: `0x${"1".repeat(64)}`,
      funding: `0x${"2".repeat(64)}`,
      evidence: `0x${"3".repeat(64)}`,
      release: `0x${"4".repeat(64)}`,
    },
  };
}

describe("ProofPay Phase 5A data boundary", () => {
  beforeEach(() => {
    mutableEnvironment.NODE_ENV = "test";
    process.env.PROOFPAY_DATA_MODE = "fixture";
    process.env.PROOFPAY_FIXTURE_AUTH = "phase5a-e2e";
  });

  afterEach(() => {
    if (previousMode === undefined) delete process.env.PROOFPAY_DATA_MODE;
    else process.env.PROOFPAY_DATA_MODE = previousMode;
    if (previousNodeEnv === undefined) delete mutableEnvironment.NODE_ENV;
    else mutableEnvironment.NODE_ENV = previousNodeEnv;
    if (previousFixtureAuth === undefined) delete process.env.PROOFPAY_FIXTURE_AUTH;
    else process.env.PROOFPAY_FIXTURE_AUTH = previousFixtureAuth;
  });

  it("accepts only canonical positive uint256 invoice IDs", () => {
    expect(parseInvoiceId("1")).toBe(1n);
    expect(parseInvoiceId(42)).toBe(42n);
    expect(parseInvoiceId(7n)).toBe(7n);
    for (const invalid of ["0", "-1", "+1", "01", "1.0", "abc", "", 0, -2]) {
      expect(() => parseInvoiceId(invalid)).toThrow(ProofPayDataError);
    }
    expect(() => parseInvoiceId(Number.MAX_SAFE_INTEGER + 1)).toThrow(ProofPayDataError);
    expect(() => parseInvoiceId(1n << 256n)).toThrow(ProofPayDataError);
  });

  it("normalizes data mode before enforcing live-only callers", () => {
    expect(normalizeProofPayDataMode(undefined)).toBe("live");
    expect(normalizeProofPayDataMode("  live  ")).toBe("live");
    expect(normalizeProofPayDataMode("\tfixture\n")).toBe("fixture");
    expect(__test.RPC_TIMEOUT_MS).toBe(15_000);
    expect(__test.RPC_RETRY_COUNT).toBe(1);
  });

  it("formats atomic values without floating-point conversion", () => {
    expect(formatAtomic("5000000", 6, 2)).toBe("5.00");
    expect(formatUsd(5_000_000n)).toBe("$5.00");
    expect(formatFxrp(5_299_945n)).toBe("5.299945 FXRP");
    expect(formatPrice(1_037_614n, 6)).toBe("$1.037614");
    expect(formatTimestamp("1786191147")).toBe("2026-08-08T12:12:27.000Z");
    expect(shortenHex("0x1234567890abcdef")).toBe("0x1234…cdef");
  });

  it("builds the known invoice only in explicit test fixture mode", async () => {
    const invoice = await getInvoiceView("1");
    expect(invoice.exists).toBe(true);
    expect(invoice.status).toBe("RELEASED");
    expect(invoice.title).toBe("Deploy and verify ProofPayEscrow on Coston2");
    expect(invoice.scopeLines).toHaveLength(4);
    expect(invoice.usdTarget?.atomic).toBe("5000000");
    expect(invoice.currentFxrpLocked?.atomic).toBe("5299945");
    expect(invoice.evidence?.completionNote).toContain("runtime-bytecode matched");
    expect(invoice.preview).toBeUndefined();
    expect(invoice.receiptLocatorAvailable).toBe(true);
    expect(invoice.sampleScenario).toBeUndefined();
    expect(invoice.nextStep).toBe("View the public receipt.");
    expect(invoice.lifecycle.map((stage) => stage.reached)).toEqual([true, true, true, true]);
  });

  it("treats an unknown mapping entry as a normal invoice result", async () => {
    const invoice = await getInvoiceView("42");
    expect(invoice.exists).toBe(false);
    expect(invoice.status).toBe("UNKNOWN");
    expect(invoice.title).toBe("ProofPay milestone #42");
    expect(invoice.client).toBeNull();
    expect(invoice.freelancer).toBeNull();
    expect(invoice.receiptLocatorAvailable).toBe(false);
    expect(invoice.lifecycle.every((stage) => !stage.reached)).toBe(true);
  });

  it("isolates the top-up presentation sample to fixture invoice 2", async () => {
    const invoice = await getInvoiceView(2);
    expect(invoice.exists).toBe(true);
    expect(invoice.status).toBe("SUBMITTED");
    expect(invoice.sampleScenario).toBe("TOP_UP_REQUIRED");
    expect(invoice.receiptLocatorAvailable).toBe(false);
    expect(invoice.contractAddress).toBe("0x0000000000000000000000000000000000000000");
    expect(invoice.client).toBeNull();
    expect(invoice.freelancer).toBeNull();
    expect(invoice.scopeHash).toBeNull();
    expect(invoice.preview?.payout.atomic).toBe("0");
    expect(invoice.preview?.refund.atomic).toBe("0");
    expect(BigInt(invoice.preview?.topUp.atomic ?? "0")).toBeGreaterThan(0n);
    expect(invoice.lifecycle.every((stage) => !stage.confirmed)).toBe(true);
  });

  it("keeps confirmed funding and release evidence distinct and reconciled", async () => {
    const receipt = await getReceiptView(1);
    expect(receipt).not.toBeNull();
    if (!receipt) return;
    expect(receipt.confirmed.locked.atomic).toBe("5299945");
    expect(receipt.confirmed.payout.atomic).toBe("4818748");
    expect(receipt.confirmed.refund.atomic).toBe("481197");
    expect(
      BigInt(receipt.confirmed.payout.atomic) + BigInt(receipt.confirmed.refund.atomic),
    ).toBe(BigInt(receipt.confirmed.locked.atomic));
    expect(receipt.confirmed.fundingPrice.raw).toBe("1037747");
    expect(receipt.confirmed.releasePrice.raw).toBe("1037614");
    expect(receipt.currentPartyBalances.client.atomic).toBe("5180252");
    expect(receipt.currentPartyBalances.freelancer.atomic).toBe("4819748");
    expect(receipt.reconciliation.partyBalancesReadAtPinnedBlock).toBe(true);
    expect(receipt.lifecycle.map((stage) => stage.eventName)).toEqual([
      "InvoiceCreated",
      "InvoiceFunded",
      "EvidenceSubmitted",
      "InvoiceReleased",
    ]);
    expect(new Set(receipt.lifecycle.map((stage) => stage.transactionHash)).size).toBe(4);
    expect(receipt.invoice.network.pinnedBlockNumber).toBe("33781048");
    expect(receipt.invoice.network.pinnedBlockTimestamp.unix).toBe("1786193322");
    expect(receipt.lifecycle.map((stage) => stage.blockTimestamp.unix)).toEqual([
      "1786191016",
      "1786191119",
      "1786191141",
      "1786191159",
    ]);
  });

  it("does not scan or invent receipts for IDs without preserved transaction pointers", async () => {
    await expect(getReceiptView(2)).resolves.toBeNull();
  });

  it("rejects contradictory settlement arithmetic", () => {
    expect(() => __test.assertSettlementConservation(100n, 80n, 20n)).not.toThrow();
    expect(() => __test.assertSettlementConservation(100n, 80n, 19n)).toThrowError(
      expect.objectContaining({ code: "ONCHAIN_CONTRADICTION" }),
    );
  });

  it("requires one deployed-contract log decoding to the expected event", () => {
    const created = { eventName: "InvoiceCreated" };
    expect(__test.selectExactContractEvent(1, [created], "InvoiceCreated")).toBe(created);
    for (const [logCount, events] of [
      [2, [created]],
      [1, []],
      [1, [created, { eventName: "InvoiceFunded" }]],
      [1, [{ eventName: "InvoiceFunded" }]],
    ] as const) {
      expect(() => __test.selectExactContractEvent(logCount, events, "InvoiceCreated")).toThrowError(
        expect.objectContaining({ code: "ONCHAIN_CONTRADICTION" }),
      );
    }
  });

  it("classifies deployed-contract log decoder failures as onchain contradictions", () => {
    expect(() => __test.decodeExactContractEvent(1, "InvoiceCreated", () => {
      throw new Error("malformed deployed log");
    })).toThrowError(expect.objectContaining({ code: "ONCHAIN_CONTRADICTION" }));
  });

  it("validates receipt locator identity and transaction uniqueness", () => {
    const valid = validReceiptLocator();
    expect(__test.parseReceiptPointers(valid)).toEqual(valid.transactions);

    const duplicate = validReceiptLocator();
    duplicate.transactions.release = duplicate.transactions.create;
    expect(() => __test.parseReceiptPointers(duplicate)).toThrowError(
      expect.objectContaining({ code: "INVALID_LOCAL_EVIDENCE" }),
    );

    const wrongInvoice = validReceiptLocator();
    wrongInvoice.invoice.invoiceId = "2";
    expect(() => __test.parseReceiptPointers(wrongInvoice)).toThrowError(
      expect.objectContaining({ code: "INVALID_LOCAL_EVIDENCE" }),
    );
  });

  it("classifies a missing committed manifest as invalid local evidence", async () => {
    const missing = resolve(process.cwd(), "artifacts", "phase5a-manifest-does-not-exist.json");
    await expect(__test.readHashVerifiedJson(missing, __test.ZERO_HASH, "test manifest")).rejects.toMatchObject({
      code: "INVALID_LOCAL_EVIDENCE",
    });
  });

  it("rejects manifest bytes changed after their commitment was calculated", async () => {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), "proofpay-manifest-"));
    const manifestPath = join(temporaryDirectory, "manifest.json");
    const committedBytes = Buffer.from('{"result":"original"}', "utf8");
    const expectedHash = keccak256(toHex(committedBytes));
    try {
      await writeFile(manifestPath, Buffer.from('{"result":"tampered"}', "utf8"));
      await expect(
        __test.readHashVerifiedJson(manifestPath, expectedHash, "test manifest"),
      ).rejects.toMatchObject({ code: "MANIFEST_HASH_MISMATCH" });
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it("requires explicit fixture authorization", async () => {
    delete process.env.PROOFPAY_FIXTURE_AUTH;
    await expect(getInvoiceView(1)).rejects.toMatchObject({ code: "FIXTURE_DISABLED" });
  });

  it("never enables fixture data in production", async () => {
    mutableEnvironment.NODE_ENV = "production";
    await expect(getInvoiceView(1)).rejects.toMatchObject({ code: "FIXTURE_DISABLED" });
  });

  it("does not imply a receipt exists for arbitrary released invoice IDs", () => {
    const copy = __test.statusCopy("RELEASED", undefined, false);
    expect(copy.nextStep).toContain(
      "no verified receipt locator",
    );
    expect(copy.summary).toContain("release state and price are confirmed");
    expect(copy.summary).not.toMatch(/payout|refund/i);
  });

  it("rejects unknown data modes instead of falling back", async () => {
    process.env.PROOFPAY_DATA_MODE = "fallback";
    await expect(getInvoiceView(1)).rejects.toMatchObject({ code: "CONFIGURATION" });
  });
});
