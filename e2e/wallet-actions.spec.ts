import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { encodeFunctionData, encodeFunctionResult } from "viem";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import {
  fxrpAbi,
  proofPayAbi,
  PROOFPAY_CONTRACT_ADDRESS,
  PROOFPAY_FXRP_ADDRESS,
} from "../lib/proofpay-contract";

const CLIENT = "0x2222222222222222222222222222222222222222";
const FREELANCER = "0x1111111111111111111111111111111111111111";
const OTHER = "0x3333333333333333333333333333333333333333";
const TX_HASH = `0x${"a".repeat(64)}`;
const BLOCK_HASH = `0x${"b".repeat(64)}`;
const refinementArtifacts = resolve(process.cwd(), "artifacts", "interface-refinement");

async function captureRefinement(page: Page, name: string) {
  await mkdir(refinementArtifacts, { recursive: true });
  await page.screenshot({
    path: resolve(refinementArtifacts, name),
    fullPage: true,
    animations: "disabled",
  });
}

const calls = {
  createInvoice: encodeFunctionData({ abi: proofPayAbi, functionName: "createInvoice", args: [CLIENT, 1n, 1n, `0x${"1".repeat(64)}`] }).slice(0, 10),
  quoteFunding: encodeFunctionData({ abi: proofPayAbi, functionName: "quoteFunding", args: [1n] }).slice(0, 10),
  fundInvoice: encodeFunctionData({ abi: proofPayAbi, functionName: "fundInvoice", args: [1n, 1n, 1n] }).slice(0, 10),
  submitEvidence: encodeFunctionData({ abi: proofPayAbi, functionName: "submitEvidence", args: [1n, `0x${"1".repeat(64)}`, "https://example.com"] }).slice(0, 10),
  quoteRelease: encodeFunctionData({ abi: proofPayAbi, functionName: "quoteRelease", args: [1n] }).slice(0, 10),
  topUp: encodeFunctionData({ abi: proofPayAbi, functionName: "topUp", args: [1n, 1n, 1n] }).slice(0, 10),
  release: encodeFunctionData({ abi: proofPayAbi, functionName: "release", args: [1n, 1n, 1n] }).slice(0, 10),
  cancel: encodeFunctionData({ abi: proofPayAbi, functionName: "cancelBeforeFunding", args: [1n] }).slice(0, 10),
  refund: encodeFunctionData({ abi: proofPayAbi, functionName: "refundUnsubmittedAfterDeadline", args: [1n] }).slice(0, 10),
  allowance: encodeFunctionData({ abi: fxrpAbi, functionName: "allowance", args: [CLIENT, PROOFPAY_CONTRACT_ADDRESS] }).slice(0, 10),
  approve: encodeFunctionData({ abi: fxrpAbi, functionName: "approve", args: [PROOFPAY_CONTRACT_ADDRESS, 1n] }).slice(0, 10),
};

const results = {
  createInvoice: encodeFunctionResult({ abi: proofPayAbi, functionName: "createInvoice", result: 8n }),
  quoteFunding: encodeFunctionResult({
    abi: proofPayAbi,
    functionName: "quoteFunding",
    result: [5_500_000n, 1_000_000n, 6, 1_900_000_000n],
  }),
  quoteReleaseTopUp: encodeFunctionResult({
    abi: proofPayAbi,
    functionName: "quoteRelease",
    result: [5_000_000n, 0n, 1_000_000n, 1_000_000n, 6, 1_900_000_000n],
  }),
  quoteReleaseTopUpLater: encodeFunctionResult({
    abi: proofPayAbi,
    functionName: "quoteRelease",
    result: [5_500_000n, 0n, 1_500_000n, 900_000n, 6, 1_900_000_010n],
  }),
  quoteReleaseReady: encodeFunctionResult({
    abi: proofPayAbi,
    functionName: "quoteRelease",
    result: [5_000_000n, 500_000n, 0n, 1_000_000n, 6, 1_900_000_000n],
  }),
  approve: encodeFunctionResult({ abi: fxrpAbi, functionName: "approve", result: true }),
};

type WalletOptions = {
  account: string;
  allowance?: string;
  ambiguousNextSend?: boolean;
  chainId?: number;
  receiptPending?: boolean;
  rejectNextSend?: boolean;
};

async function installInjectedWallet(page: Page, options: WalletOptions) {
  await page.addInitScript(({ wallet, selectors, encoded, addresses, txHash, blockHash }) => {
    const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
    const state = {
      account: wallet.account,
      allowance: wallet.allowance ?? "999999999",
      ambiguousNextSend: wallet.ambiguousNextSend ?? false,
      chainId: wallet.chainId ?? 114,
      connected: false,
      receiptPending: wallet.receiptPending ?? false,
      rejectNextSend: wallet.rejectNextSend ?? false,
      topUpQuoteIndex: 0,
      requests: [] as Array<{ method: string; params?: unknown }>,
      transactionHashes: [] as string[],
      transactions: [] as Array<Record<string, unknown>>,
    };
    const emit = (event: string, value: unknown) => {
      for (const listener of listeners.get(event) ?? []) listener(value);
    };
    const receipt = {
      blockHash,
      blockNumber: "0x64",
      contractAddress: null,
      cumulativeGasUsed: "0x5208",
      effectiveGasPrice: "0x1",
      from: state.account,
      gasUsed: "0x5208",
      logs: [],
      logsBloom: `0x${"0".repeat(512)}`,
      status: "0x1",
      to: addresses.contract,
      transactionHash: txHash,
      transactionIndex: "0x0",
      type: "0x2",
    };
    const provider = {
      isMetaMask: true,
      on(event: string, listener: (...args: unknown[]) => void) {
        const bucket = listeners.get(event) ?? new Set();
        bucket.add(listener);
        listeners.set(event, bucket);
        return provider;
      },
      removeListener(event: string, listener: (...args: unknown[]) => void) {
        listeners.get(event)?.delete(listener);
        return provider;
      },
      async request({ method, params }: { method: string; params?: unknown[] }) {
        state.requests.push({ method, ...(params === undefined ? {} : { params }) });
        switch (method) {
          case "eth_accounts": return state.connected ? [state.account] : [];
          case "eth_requestAccounts":
            state.connected = true;
            emit("accountsChanged", [state.account]);
            return [state.account];
          case "eth_chainId": return `0x${state.chainId.toString(16)}`;
          case "wallet_switchEthereumChain":
            state.chainId = Number.parseInt(String((params?.[0] as { chainId?: string })?.chainId ?? "0x72"), 16);
            emit("chainChanged", `0x${state.chainId.toString(16)}`);
            return null;
          case "wallet_addEthereumChain": return null;
          case "eth_call": {
            const transaction = params?.[0] as { data?: string; to?: string } | undefined;
            const data = transaction?.data?.toLowerCase() ?? "";
            if (data.startsWith(selectors.createInvoice)) return encoded.createInvoice;
            if (data.startsWith(selectors.quoteFunding)) return encoded.quoteFunding;
            if (data.startsWith(selectors.quoteRelease)) {
              const invoiceId = BigInt(`0x${data.slice(-64)}`);
              if (invoiceId !== 6n) return encoded.quoteReleaseReady;
              if (state.topUpQuoteIndex === 0) return encoded.quoteReleaseTopUp;
              if (state.topUpQuoteIndex === 1) return encoded.quoteReleaseTopUpLater;
              return encoded.quoteReleaseReady;
            }
            if (data.startsWith(selectors.allowance)) {
              return `0x${BigInt(state.allowance).toString(16).padStart(64, "0")}`;
            }
            if (data.startsWith(selectors.approve)) return encoded.approve;
            if ([selectors.fundInvoice, selectors.submitEvidence, selectors.topUp, selectors.release, selectors.cancel, selectors.refund]
              .some((selector) => data.startsWith(selector))) return "0x";
            throw new Error(`Unexpected eth_call selector ${data.slice(0, 10)}`);
          }
          case "eth_sendTransaction":
            if (state.rejectNextSend) {
              state.rejectNextSend = false;
              throw Object.assign(new Error("User rejected"), { code: 4001 });
            }
            state.transactions.push((params?.[0] ?? {}) as Record<string, unknown>);
            if (state.ambiguousNextSend) {
              state.ambiguousNextSend = false;
              throw new Error("Provider disconnected before returning a transaction hash.");
            }
            if (String((params?.[0] as { data?: string } | undefined)?.data ?? "").startsWith(selectors.topUp)) {
              state.topUpQuoteIndex = Math.max(1, state.topUpQuoteIndex);
            }
            const nextHash = `0x${(10 + state.transactionHashes.length).toString(16).padStart(64, "0")}`;
            state.transactionHashes.push(nextHash);
            return nextHash;
          case "eth_getTransactionReceipt": return state.receiptPending
            ? null
            : {
              ...receipt,
              transactionHash: String(params?.[0] ?? txHash),
            };
          case "eth_blockNumber": return "0x64";
          case "eth_getBlockByNumber": return {
            baseFeePerGas: "0x1", difficulty: "0x0", extraData: "0x", gasLimit: "0x1c9c380",
            gasUsed: "0x5208", hash: blockHash, logsBloom: `0x${"0".repeat(512)}`,
            miner: "0x0000000000000000000000000000000000000000", mixHash: `0x${"0".repeat(64)}`,
            nonce: "0x0000000000000000", number: "0x64", parentHash: `0x${"c".repeat(64)}`,
            receiptsRoot: `0x${"d".repeat(64)}`, sha3Uncles: `0x${"e".repeat(64)}`,
            size: "0x1", stateRoot: `0x${"f".repeat(64)}`, timestamp: "0x713fb300",
            totalDifficulty: "0x0", transactions: [], transactionsRoot: `0x${"1".repeat(64)}`,
            uncles: [], withdrawals: [], withdrawalsRoot: `0x${"2".repeat(64)}`,
          };
          case "eth_getTransactionByHash": return null;
          case "eth_estimateGas": return "0x5208";
          default: throw new Error(`Unexpected wallet RPC method ${method}`);
        }
      },
    };
    Object.assign(window, {
      ethereum: provider,
      __proofPayWalletTest: {
        state,
        setAllowance(value: string) { state.allowance = value; },
        setTopUpQuoteIndex(value: number) { state.topUpQuoteIndex = value; },
      },
    });
  }, {
    wallet: options,
    selectors: calls,
    encoded: results,
    addresses: { contract: PROOFPAY_CONTRACT_ADDRESS, fxrp: PROOFPAY_FXRP_ADDRESS },
    txHash: TX_HASH,
    blockHash: BLOCK_HASH,
  });
}

async function open(page: Page, route: string) {
  let realRpcCalls = 0;
  await page.route("https://coston2-api.flare.network/**", async (route) => {
    realRpcCalls += 1;
    await route.abort("blockedbyclient");
  });
  const response = await page.goto(route, { waitUntil: "networkidle" });
  expect(response?.ok()).toBe(true);
  expect(realRpcCalls, "wallet-action test contacted the real Coston2 RPC").toBe(0);
}

async function connect(page: Page) {
  await expect(page.locator('[data-testid^="wallet-state-"]:not([data-testid="wallet-state-loading"])')).toBeVisible();
  const button = page.getByRole("button", { name: "Connect wallet" });
  if (await button.isVisible()) await button.click();
  await expect(page.getByTestId(/wallet-state-(client|freelancer|unrelated|connected)/u)).toBeVisible();
}

async function expectPrepared(page: Page, action: RegExp) {
  const intent = page.getByTestId("transaction-intent");
  await expect(intent).toBeVisible();
  await expect(intent).toContainText(action);
  await expect(page.getByTestId("transaction-state")).toContainText("Simulation passed");
  await expect(intent).toContainText("Not confirmed");
  return intent;
}

test.describe.configure({ mode: "serial" });

test("wallet states are explicit and unrelated wallets remain read-only", async ({ page }) => {
  await installInjectedWallet(page, { account: OTHER });
  await open(page, "/invoice/4");
  await expect(page.getByTestId("wallet-state-no-wallet")).toBeVisible();
  await connect(page);
  await expect(page.getByTestId("wallet-state-unrelated")).toBeVisible();
  await expect(page.getByTestId("policy-explanation")).toContainText("not a party");
  await expect(page.getByRole("button", { name: /simulate|sign|approve|fund|submit|release|refund|cancel/iu })).toHaveCount(0);
});

test("wrong-network state gates action until the injected wallet switches to Coston2", async ({ page }) => {
  await installInjectedWallet(page, { account: CLIENT, chainId: 1 });
  await open(page, "/invoice/3");
  await page.getByRole("button", { name: "Connect wallet" }).click();
  await expect(page.getByTestId("wallet-state-wrong-network")).toContainText("chain 1");
  await page.getByRole("button", { name: "Switch to Coston2" }).click();
  await expect(page.getByTestId("wallet-state-client")).toBeVisible();
  await expect(page.getByRole("button", { name: "Preview and simulate funding" })).toBeVisible();
});

test("invoice creation hashes scope, simulates, journals, and handles wallet rejection without a broadcast claim", async ({ page }) => {
  await installInjectedWallet(page, { account: FREELANCER, rejectNextSend: true });
  await open(page, "/app");
  await connect(page);
  await page.getByLabel("Milestone title").fill("Acceptance test milestone");
  await page.getByLabel("Client wallet").fill(CLIENT);
  await page.getByLabel("USD target").fill("5.00");
  const beforePreset = Math.floor(Date.now() / 1_000);
  await page.getByRole("button", { name: "Set 24 hours from now" }).click();
  const deadlineSummary = page.getByTestId("deadline-summary");
  await expect(deadlineSummary).toContainText("Your local time");
  await expect(deadlineSummary).toContainText("UTC equivalent");
  const contractTimestamp = Number((await deadlineSummary.locator("div").last().locator("dd").innerText()).trim());
  expect(contractTimestamp - beforePreset).toBeGreaterThanOrEqual(86_400);
  expect(contractTimestamp - beforePreset).toBeLessThanOrEqual(86_402);
  await page.getByLabel("Scope · one deliverable per line").fill("Implement acceptance test\nPublish receipt");
  await page.getByRole("button", { name: "Simulate invoice creation" }).click();
  const intent = await expectPrepared(page, /Create this \$5 milestone/u);
  await expect(intent.getByTestId("intent-contract-deadline")).toContainText("UTC");
  await expect(intent.getByTestId("intent-contract-deadline")).toContainText(contractTimestamp.toString());
  await expect(page.getByText(/keccak256:/u)).toBeVisible();
  await intent.getByRole("button", { name: /Create this \$5 milestone/u }).click();
  await expect(intent).toContainText("Wallet request rejected. Nothing was submitted.");
  await expect(page.getByTestId("transaction-state")).toContainText("Simulation passed");
  expect(await page.evaluate(() => (window as never as { __proofPayWalletTest: { state: { transactions: unknown[] } } }).__proofPayWalletTest.state.transactions)).toHaveLength(0);
});

test("funding stages exact approval separately, then completes a simulated provider-only funding journal", async ({ page }) => {
  await installInjectedWallet(page, { account: CLIENT, allowance: "0" });
  await open(page, "/invoice/3");
  await connect(page);
  await page.getByRole("button", { name: "Preview and simulate funding" }).click();
  const approval = await expectPrepared(page, /Approve up to 5\.61 FXRP/u);
  await expect(page.getByTestId("funding-preview")).toContainText("10% funding protection");
  await approval.getByRole("button", { name: /Approve up to 5\.61 FXRP/u }).click();
  await expect(page.getByTestId("transaction-state")).toContainText("Transaction confirmed");
  await page.evaluate(() => (window as never as { __proofPayWalletTest: { setAllowance(value: string): void } }).__proofPayWalletTest.setAllowance("999999999"));
  await page.getByRole("button", { name: "Continue with saved funding intent" }).click();
  const funding = await expectPrepared(page, /Fund this \$5 milestone/u);
  await expect(funding).toContainText("5.61 FXRP");
  await captureRefinement(page, "06-funding-intent.png");
  const quoteCalls = await page.evaluate((selector) => (
    (window as never as { __proofPayWalletTest: { state: { requests: Array<{ method: string; params?: Array<{ data?: string }> }> } } })
      .__proofPayWalletTest.state.requests
      .filter((request) => request.method === "eth_call" && request.params?.[0]?.data?.startsWith(selector)).length
  ), calls.quoteFunding);
  expect(quoteCalls).toBe(1);
  await funding.getByRole("button", { name: /Fund this \$5 milestone/u }).click();
  await expect(page.getByTestId("transaction-state")).toContainText("Transaction confirmed");
  expect(await page.evaluate(() => (window as never as { __proofPayWalletTest: { state: { transactions: unknown[] } } }).__proofPayWalletTest.state.transactions)).toHaveLength(2);
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByTestId("transaction-journal")).toContainText("approve");
  await expect(page.getByTestId("transaction-journal")).toContainText("fund");
  await expect(page.getByTestId("transaction-journal")).toContainText("confirmed");
});

test("reload preserves the frozen funding preview without fetching a second quote", async ({ page }) => {
  await installInjectedWallet(page, { account: CLIENT, allowance: "0" });
  await open(page, "/invoice/3");
  await connect(page);
  await page.getByRole("button", { name: "Preview and simulate funding" }).click();
  const previewBefore = await page.getByTestId("funding-preview").textContent();
  expect(await page.evaluate(() => localStorage.getItem("proofpay.funding-intents.v1"))).toContain("5610000");

  await page.reload({ waitUntil: "networkidle" });
  await connect(page);
  await expect(page.getByTestId("funding-preview")).toContainText("5.61 FXRP");
  await expect(page.getByRole("button", { name: "Continue with saved funding intent" })).toBeVisible();
  expect(await page.getByTestId("funding-preview").textContent()).toContain("5.61 FXRP");
  expect(previewBefore).toContain("5.61 FXRP");
});

test("freelancer evidence and cancellation prepare only their exact contract actions", async ({ page }) => {
  await installInjectedWallet(page, { account: FREELANCER });
  await open(page, "/invoice/4");
  await connect(page);
  await page.getByLabel("Public delivery URLs · one per line").fill("https://example.com/delivery?b=2&a=1");
  await page.getByLabel("Wallet-actions commit · optional").fill("abcdef1");
  await page.getByLabel("Completion note").fill("Acceptance tests passed.");
  await page.getByRole("button", { name: "Hash and simulate evidence submission" }).click();
  await expectPrepared(page, /Submit this evidence commitment/u);
  await expect(page.getByTestId("evidence-manifest")).toContainText("not delivery truth or quality");

  await page.goto("/invoice/3", { waitUntil: "networkidle" });
  await connect(page);
  await expect(page.getByTestId("wallet-state-freelancer")).toBeVisible();
  await page.getByRole("button", { name: "Simulate cancellation" }).click();
  await expectPrepared(page, /Cancel this unfunded milestone/u);
});

test("client refund, top-up, and release use the current simulated quote and exact role", async ({ page }) => {
  await installInjectedWallet(page, { account: CLIENT, allowance: "999999999" });
  await open(page, "/invoice/5");
  await connect(page);
  await page.getByRole("button", { name: /Simulate return of 5\.5 FXRP/u }).click();
  await expectPrepared(page, /Return 5\.5 FXRP to the client/u);

  await page.goto("/invoice/6", { waitUntil: "networkidle" });
  await connect(page);
  await page.getByRole("button", { name: "Refresh and simulate settlement" }).click();
  await expect(page.getByTestId("settlement-preview")).toContainText("exact shortfall is 1 FXRP");
  await expectPrepared(page, /Top up 1 FXRP before payment can be released/u);

  await page.goto("/invoice/7", { waitUntil: "networkidle" });
  await connect(page);
  await page.getByRole("button", { name: "Refresh and simulate settlement" }).click();
  await expect(page.getByTestId("settlement-preview")).toContainText("No payment has been released");
  const release = await expectPrepared(page, /Release payment/u);
  await expect(release).toContainText("5 FXRP to the freelancer");
  await expect(release).toContainText("0.5 FXRP");
  await captureRefinement(page, "07-release-intent.png");
});

test("confirmed top-ups stay in history while distinct later quotes can top up again", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-08-09T10:00:00Z"));
  await page.setViewportSize({ width: 390, height: 844 });
  await installInjectedWallet(page, { account: CLIENT, allowance: "999999999" });
  await open(page, "/invoice/6");
  await connect(page);

  const setQuote = async (index: number) => await page.evaluate((value) => (
    (window as never as { __proofPayWalletTest: { setTopUpQuoteIndex(next: number): void } })
      .__proofPayWalletTest.setTopUpQuoteIndex(value)
  ), index);
  const transactionCount = async () => await page.evaluate(() => (
    (window as never as { __proofPayWalletTest: { state: { transactions: unknown[] } } })
      .__proofPayWalletTest.state.transactions.length
  ));
  const readIntentHash = async () => await page
    .getByTestId("transaction-intent")
    .locator("dt")
    .filter({ hasText: "Intent hash" })
    .locator("..")
    .locator("dd")
    .innerText();

  await page.getByRole("button", { name: "Refresh and simulate settlement" }).click();
  await expect(page.getByTestId("settlement-preview")).toContainText("exact shortfall is 1 FXRP");
  const first = await expectPrepared(page, /Top up 1 FXRP before payment can be released/u);
  const firstIntentHash = await readIntentHash();
  await first.getByRole("button", { name: /Top up 1 FXRP/u }).evaluate((button) => {
    if (!(button instanceof HTMLButtonElement)) throw new Error("Expected the top-up signing button.");
    button.click();
    button.click();
  });
  await expect(page.getByTestId("transaction-state")).toContainText("Transaction confirmed");
  expect(await transactionCount()).toBe(1);
  expect(await page.evaluate((selector) => (
    (window as never as { __proofPayWalletTest: { state: { transactions: Array<{ data?: string }> } } })
      .__proofPayWalletTest.state.transactions
      .filter((transaction) => String(transaction.data ?? "").startsWith(selector)).length
  ), calls.topUp)).toBe(1);

  await setQuote(0);
  await page.getByRole("button", { name: "Refresh and simulate settlement" }).click();
  await expect(page.locator(".action-error")).toContainText(/intent already exists/iu);
  expect(await transactionCount()).toBe(1);

  await setQuote(1);
  await page.getByRole("button", { name: "Refresh and simulate settlement" }).click();
  await expect(page.getByTestId("settlement-preview")).toContainText("exact shortfall is 1.5 FXRP");
  const second = await expectPrepared(page, /Top up 1\.5 FXRP before payment can be released/u);
  const secondIntentHash = await readIntentHash();
  expect(secondIntentHash).not.toBe(firstIntentHash);

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""))).toEqual([]);
  const widths = await page.evaluate(() => ({
    content: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    viewport: document.documentElement.clientWidth,
  }));
  expect(widths.content).toBeLessThanOrEqual(widths.viewport);
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus-visible")).toBeVisible();

  await second.getByRole("button", { name: /Top up 1\.5 FXRP/u }).click();
  await expect(page.getByTestId("transaction-state")).toContainText("Transaction confirmed");
  expect(await transactionCount()).toBe(2);
  await expect(page.getByTestId("transaction-journal").locator("li")).toHaveCount(2);

  await page.reload({ waitUntil: "networkidle" });
  await connect(page);
  await expect(page.getByTestId("transaction-journal").locator("li")).toHaveCount(2);
  await expect(page.getByTestId("transaction-journal")).toContainText("top up");
  await expect(page.getByTestId("transaction-journal")).toContainText("confirmed");

  await setQuote(1);
  await page.getByRole("button", { name: "Refresh and simulate settlement" }).click();
  await expect(page.locator(".action-error")).toContainText(/intent already exists/iu);

  await setQuote(2);
  await page.getByRole("button", { name: "Refresh and simulate settlement" }).click();
  await expect(page.getByTestId("settlement-preview")
    .locator("dt")
    .filter({ hasText: "Exact top-up" })
    .locator("..")
    .locator("dd")).toHaveText("0 FXRP");
  await expectPrepared(page, /Release payment/u);
  await expect(page.getByTestId("transaction-intent")).not.toContainText(/Top up/u);
});

test("an ambiguous top-up wallet result remains fail-closed and cannot be signed again", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-08-09T10:00:00Z"));
  await installInjectedWallet(page, {
    account: CLIENT,
    allowance: "999999999",
    ambiguousNextSend: true,
  });
  await open(page, "/invoice/6");
  await connect(page);

  await page.getByRole("button", { name: "Refresh and simulate settlement" }).click();
  const prepared = await expectPrepared(page, /Top up 1 FXRP before payment can be released/u);
  await prepared.getByRole("button", { name: /Top up 1 FXRP/u }).click();
  await expect(page.getByTestId("transaction-state")).toContainText("Signature request opened");
  await expect(page.locator(".action-error")).toContainText(/cannot prove whether it broadcast/iu);
  await expect(page.getByTestId("transaction-journal")).toContainText("Invoice 6 · awaiting_wallet");
  await expect(prepared.getByRole("button", { name: /Top up 1 FXRP/u })).toHaveCount(0);
  expect(await page.evaluate(() => (
    (window as never as { __proofPayWalletTest: { state: { transactions: unknown[] } } })
      .__proofPayWalletTest.state.transactions.length
  ))).toBe(1);
  const ambiguousJournalEntry = await page.evaluate(() => {
    const journal = JSON.parse(
      window.localStorage.getItem("proofpay.transaction-journal.v1") ?? "null",
    ) as {
      entries?: Array<{ status?: string; transactionHash?: string | null }>;
    } | null;
    return journal?.entries?.[0] ?? null;
  });
  expect(ambiguousJournalEntry).toMatchObject({ status: "awaiting_wallet", transactionHash: null });

  await page.reload({ waitUntil: "networkidle" });
  await connect(page);
  await expect(page.getByTestId("transaction-journal")).toContainText("Invoice 6 · awaiting_wallet");
  await page.evaluate(() => {
    const harness = (window as never as {
      __proofPayWalletTest: {
        setAllowance(value: string): void;
        setTopUpQuoteIndex(value: number): void;
      };
    }).__proofPayWalletTest;
    harness.setTopUpQuoteIndex(1);
    harness.setAllowance("0");
  });
  const allowanceCalls = async () => await page.evaluate((selector) => (
    (window as never as {
      __proofPayWalletTest: {
        state: { requests: Array<{ method: string; params?: Array<{ data?: string }> }> };
      };
    }).__proofPayWalletTest.state.requests.filter((request) => (
      request.method === "eth_call"
      && String(request.params?.[0]?.data ?? "").startsWith(selector)
    )).length
  ), calls.allowance);
  expect(await allowanceCalls()).toBe(0);

  await page.getByRole("button", { name: "Refresh and simulate settlement" }).click();
  await expect(page.getByTestId("settlement-preview")).toContainText("exact shortfall is 1.5 FXRP");
  await expect(page.locator(".action-error")).toContainText(/A awaiting_wallet top up intent already exists/iu);
  expect(await allowanceCalls()).toBe(0);
  await expect(page.getByTestId("transaction-intent")).toHaveCount(0);
});

test("an unresolved submitted top-up survives reload and blocks a later quote before allowance or approval", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-08-09T10:00:00Z"));
  await installInjectedWallet(page, {
    account: CLIENT,
    allowance: "999999999",
    receiptPending: true,
  });
  await open(page, "/invoice/6");
  await connect(page);

  await page.getByRole("button", { name: "Refresh and simulate settlement" }).click();
  const prepared = await expectPrepared(page, /Top up 1 FXRP before payment can be released/u);
  await prepared.getByRole("button", { name: /Top up 1 FXRP/u }).click();
  await expect(page.getByTestId("transaction-state")).toContainText("Transaction submitted");

  const storedBeforeReload = await page.evaluate(() => JSON.parse(
    window.localStorage.getItem("proofpay.transaction-journal.v1") ?? "null",
  ) as { entries?: Array<{ action?: string; status?: string; transactionHash?: string }> } | null);
  expect(storedBeforeReload?.entries).toHaveLength(1);
  expect(storedBeforeReload?.entries?.[0]).toMatchObject({
    action: "top_up",
    status: "submitted",
    transactionHash: `0x${"a".padStart(64, "0")}`,
  });
  expect(await page.evaluate((selector) => (
    (window as never as { __proofPayWalletTest: { state: { transactions: Array<{ data?: string }> } } })
      .__proofPayWalletTest.state.transactions
      .filter((transaction) => String(transaction.data ?? "").startsWith(selector)).length
  ), calls.topUp)).toBe(1);

  await page.reload({ waitUntil: "networkidle" });
  await connect(page);
  await expect.poll(async () => await page.evaluate(() => (
    (window as never as { __proofPayWalletTest: { state: { requests: Array<{ method: string }> } } })
      .__proofPayWalletTest.state.requests
      .filter((request) => request.method === "eth_getTransactionReceipt").length
  ))).toBeGreaterThan(0);
  await expect(page.getByTestId("transaction-journal")).toContainText("Invoice 6 · submitted");
  await expect(page.getByTestId("transaction-journal")).toContainText(`0x${"a".padStart(64, "0")}`);

  await page.evaluate(() => {
    const harness = (window as never as {
      __proofPayWalletTest: {
        setAllowance(value: string): void;
        setTopUpQuoteIndex(value: number): void;
      };
    }).__proofPayWalletTest;
    harness.setTopUpQuoteIndex(1);
    harness.setAllowance("0");
  });
  const countCalls = async (selector: string) => await page.evaluate((expectedSelector) => (
    (window as never as {
      __proofPayWalletTest: {
        state: { requests: Array<{ method: string; params?: Array<{ data?: string }> }> };
      };
    }).__proofPayWalletTest.state.requests.filter((request) => (
      request.method === "eth_call"
      && String(request.params?.[0]?.data ?? "").startsWith(expectedSelector)
    )).length
  ), selector);
  expect(await countCalls(calls.allowance)).toBe(0);
  expect(await countCalls(calls.approve)).toBe(0);

  await page.getByRole("button", { name: "Refresh and simulate settlement" }).click();
  await expect(page.getByTestId("settlement-preview")).toContainText("exact shortfall is 1.5 FXRP");
  await expect(page.locator(".action-error")).toContainText(/A submitted top up intent already exists/iu);
  expect(await countCalls(calls.allowance)).toBe(0);
  expect(await countCalls(calls.approve)).toBe(0);
  await expect(page.getByTestId("transaction-intent")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Approve up to/iu })).toHaveCount(0);
  expect(await page.evaluate(() => (
    (window as never as { __proofPayWalletTest: { state: { transactions: unknown[] } } })
      .__proofPayWalletTest.state.transactions.length
  ))).toBe(0);
});

test("wallet-action surfaces have no serious accessibility violations or mobile overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installInjectedWallet(page, { account: CLIENT });
  await open(page, "/invoice/3");
  await connect(page);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""))).toEqual([]);
  const widths = await page.evaluate(() => ({
    content: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    viewport: document.documentElement.clientWidth,
  }));
  expect(widths.content).toBeLessThanOrEqual(widths.viewport);
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus-visible")).toBeVisible();
});
