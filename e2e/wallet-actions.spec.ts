import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { encodeFunctionData, encodeFunctionResult } from "viem";

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
  chainId?: number;
  rejectNextSend?: boolean;
};

async function installInjectedWallet(page: Page, options: WalletOptions) {
  await page.addInitScript(({ wallet, selectors, encoded, addresses, txHash, blockHash }) => {
    const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
    const state = {
      account: wallet.account,
      allowance: wallet.allowance ?? "999999999",
      chainId: wallet.chainId ?? 114,
      connected: false,
      rejectNextSend: wallet.rejectNextSend ?? false,
      requests: [] as Array<{ method: string; params?: unknown }>,
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
              return invoiceId === 6n ? encoded.quoteReleaseTopUp : encoded.quoteReleaseReady;
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
            return txHash;
          case "eth_getTransactionReceipt": return receipt;
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
  await page.getByRole("button", { name: "Connect wallet" }).click();
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
  await page.getByLabel("Delivery deadline").fill("2033-05-18T03:33");
  await page.getByLabel("Scope · one deliverable per line").fill("Implement acceptance test\nPublish receipt");
  await page.getByRole("button", { name: "Simulate invoice creation" }).click();
  const intent = await expectPrepared(page, /Create this \$5 milestone/u);
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
  await page.getByRole("button", { name: "Preview and simulate funding" }).click();
  const funding = await expectPrepared(page, /Fund this \$5 milestone with up to 5\.61 FXRP/u);
  await funding.getByRole("button", { name: /Fund this \$5 milestone/u }).click();
  await expect(page.getByTestId("transaction-state")).toContainText("Transaction confirmed");
  expect(await page.evaluate(() => (window as never as { __proofPayWalletTest: { state: { transactions: unknown[] } } }).__proofPayWalletTest.state.transactions)).toHaveLength(2);
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByTestId("transaction-journal")).toContainText("approve");
  await expect(page.getByTestId("transaction-journal")).toContainText("fund");
  await expect(page.getByTestId("transaction-journal")).toContainText("confirmed");
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
  await expect(page.getByTestId("settlement-preview")).toContainText("short by 1 FXRP");
  await expectPrepared(page, /Top up 1 FXRP before payment can be released/u);

  await page.goto("/invoice/7", { waitUntil: "networkidle" });
  await connect(page);
  await page.getByRole("button", { name: "Refresh and simulate settlement" }).click();
  await expect(page.getByTestId("settlement-preview")).toContainText("No payment has been released");
  await expectPrepared(page, /Release 5 FXRP and return 0\.5 FXRP/u);
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
