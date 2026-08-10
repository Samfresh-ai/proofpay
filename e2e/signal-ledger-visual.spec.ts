import { createHash } from "node:crypto";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { encodeFunctionData, encodeFunctionResult } from "viem";

import {
  fxrpAbi,
  proofPayAbi,
  PROOFPAY_CONTRACT_ADDRESS,
} from "../lib/proofpay-contract";

const execFileAsync = promisify(execFile);
const repositoryRoot = process.cwd();
const finalDirectory = resolve(repositoryRoot, "artifacts", "signal-ledger", "final");
const manifestPath = resolve(repositoryRoot, "artifacts", "signal-ledger", "visual-proof.json");
const nextBinary = resolve(repositoryRoot, "node_modules", "next", "dist", "bin", "next");
const rpcHook = resolve(repositoryRoot, "e2e", "support", "signal-ledger-rpc-hook.cjs");
const CLIENT = "0x2222222222222222222222222222222222222222";
const FREELANCER = "0x1111111111111111111111111111111111111111";
const transactionAction = /sign|approve|send transaction|fund now|submit evidence|top[ -]?up now|release now|refund now|cancel now/iu;

const selectors = {
  createInvoice: encodeFunctionData({
    abi: proofPayAbi,
    functionName: "createInvoice",
    args: [CLIENT, 1n, 1n, `0x${"1".repeat(64)}`],
  }).slice(0, 10),
  quoteFunding: encodeFunctionData({ abi: proofPayAbi, functionName: "quoteFunding", args: [1n] }).slice(0, 10),
  fundInvoice: encodeFunctionData({ abi: proofPayAbi, functionName: "fundInvoice", args: [1n, 1n, 1n] }).slice(0, 10),
  quoteRelease: encodeFunctionData({ abi: proofPayAbi, functionName: "quoteRelease", args: [1n] }).slice(0, 10),
  release: encodeFunctionData({ abi: proofPayAbi, functionName: "release", args: [1n, 1n, 1n] }).slice(0, 10),
  allowance: encodeFunctionData({
    abi: fxrpAbi,
    functionName: "allowance",
    args: [CLIENT, PROOFPAY_CONTRACT_ADDRESS],
  }).slice(0, 10),
};

const encodedResults = {
  createInvoice: encodeFunctionResult({ abi: proofPayAbi, functionName: "createInvoice", result: 8n }),
  quoteFunding: encodeFunctionResult({
    abi: proofPayAbi,
    functionName: "quoteFunding",
    result: [5_500_000n, 1_000_000n, 6, 1_900_000_000n],
  }),
  quoteRelease: encodeFunctionResult({
    abi: proofPayAbi,
    functionName: "quoteRelease",
    result: [5_000_000n, 500_000n, 0n, 1_000_000n, 6, 1_900_000_000n],
  }),
};

type ServerMode = "live" | "hang" | "fail" | "fixture";

type CaptureRecord = {
  id: number;
  file: string;
  route: string;
  finalUrl: string;
  responseStatus: number;
  dataClassification: string;
  viewport: { width: number; height: number };
  fullPage: boolean;
  elementSelector?: string;
  interactions: string[];
  expectedMarkers: string[];
  horizontalOverflow: boolean;
  bytes: number;
  sha256: string;
};

type SafetyTotals = {
  blockedExternalBrowserRequests: number;
  walletConnections: number;
  signingRequests: number;
  sendRequests: number;
  broadcasts: number;
  consoleErrors: number;
  pageErrors: number;
};

const delay = async (milliseconds: number) => await new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

async function startServer(mode: ServerMode, port: number): Promise<{ child: ChildProcess; logs: string[] }> {
  const environment = { ...process.env };
  delete environment.PROOFPAY_DATA_MODE;
  delete environment.PROOFPAY_FIXTURE_AUTH;
  delete environment.PROOFPAY_VISUAL_RPC_MODE;
  if (mode === "fixture") {
    environment.PROOFPAY_DATA_MODE = "fixture";
    environment.PROOFPAY_FIXTURE_AUTH = "phase5a-e2e";
  }
  if (mode === "hang" || mode === "fail") {
    environment.PROOFPAY_VISUAL_RPC_MODE = mode;
    environment.NODE_OPTIONS = [environment.NODE_OPTIONS, `--require=${rpcHook}`].filter(Boolean).join(" ");
  }

  const command = mode === "fixture" ? "dev" : "start";
  const child = spawn(process.execPath, [nextBinary, command, "-H", "127.0.0.1", "-p", String(port)], {
    cwd: repositoryRoot,
    detached: true,
    env: environment,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const logs: string[] = [];
  const collect = (chunk: Buffer) => {
    logs.push(chunk.toString());
    if (logs.join("").length > 50_000) logs.shift();
  };
  child.stdout?.on("data", collect);
  child.stderr?.on("data", collect);

  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Next ${command} exited early.\n${logs.join("")}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/app`, { redirect: "manual" });
      if (response.status < 500) return { child, logs };
    } catch {
      // Server has not bound the port yet.
    }
    await delay(250);
  }
  throw new Error(`Next ${command} did not become ready.\n${logs.join("")}`);
}

async function stopServer(child: ChildProcess): Promise<void> {
  if (!child.pid || child.exitCode !== null) return;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    return;
  }
  await Promise.race([once(child, "exit"), delay(5_000)]);
  if (child.exitCode === null) {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      // Process group already exited.
    }
  }
}

async function createSafeContext(
  browser: Browser,
  safety: SafetyTotals,
  viewport = { width: 1440, height: 1000 },
): Promise<BrowserContext> {
  const context = await browser.newContext({
    colorScheme: "light",
    locale: "en-US",
    reducedMotion: "reduce",
    serviceWorkers: "block",
    timezoneId: "Africa/Lagos",
    viewport,
  });
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (["127.0.0.1", "localhost"].includes(url.hostname) || ["data:", "blob:"].includes(url.protocol)) {
      await route.continue();
      return;
    }
    safety.blockedExternalBrowserRequests += 1;
    await route.abort("blockedbyclient");
  });
  return context;
}

async function installReadOnlyWallet(context: BrowserContext, account: string): Promise<void> {
  await context.addInitScript(({ walletAccount, callSelectors, results, contractAddress }) => {
    const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
    const state = {
      account: walletAccount,
      connected: false,
      requests: [] as Array<{ method: string; params?: unknown }>,
      walletConnections: 0,
      signingRequests: 0,
      sendRequests: 0,
      broadcasts: 0,
    };
    const emit = (event: string, value: unknown) => {
      for (const listener of listeners.get(event) ?? []) listener(value);
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
        if (method === "eth_sendTransaction" || method === "eth_sendRawTransaction") {
          state.sendRequests += 1;
          throw new Error("Visual-proof provider forbids transaction submission.");
        }
        if (method === "personal_sign" || method === "eth_sign" || method.includes("signTypedData")) {
          state.signingRequests += 1;
          throw new Error("Visual-proof provider forbids signatures.");
        }
        switch (method) {
          case "eth_accounts": return state.connected ? [state.account] : [];
          case "eth_requestAccounts":
            state.connected = true;
            state.walletConnections += 1;
            emit("accountsChanged", [state.account]);
            return [state.account];
          case "eth_chainId": return "0x72";
          case "wallet_switchEthereumChain": return null;
          case "wallet_addEthereumChain": return null;
          case "eth_call": {
            const transaction = params?.[0] as { data?: string } | undefined;
            const data = transaction?.data?.toLowerCase() ?? "";
            if (data.startsWith(callSelectors.createInvoice)) return results.createInvoice;
            if (data.startsWith(callSelectors.quoteFunding)) return results.quoteFunding;
            if (data.startsWith(callSelectors.quoteRelease)) return results.quoteRelease;
            if (data.startsWith(callSelectors.allowance)) {
              return `0x${999_999_999n.toString(16).padStart(64, "0")}`;
            }
            if (data.startsWith(callSelectors.fundInvoice) || data.startsWith(callSelectors.release)) return "0x";
            throw new Error(`Unexpected visual-proof eth_call ${data.slice(0, 10)}`);
          }
          case "eth_estimateGas": return "0x5208";
          case "eth_blockNumber": return "0x64";
          case "eth_getCode": return contractAddress ? "0x01" : "0x";
          default: throw new Error(`Unexpected visual-proof wallet RPC method ${method}`);
        }
      },
    };
    Object.assign(window, { ethereum: provider, __proofPayVisualWallet: { state } });
  }, {
    walletAccount: account,
    callSelectors: selectors,
    results: encodedResults,
    contractAddress: PROOFPAY_CONTRACT_ADDRESS,
  });
}

async function observePage(page: Page, safety: SafetyTotals): Promise<void> {
  page.on("console", (message) => {
    if (message.type() === "error") safety.consoleErrors += 1;
  });
  page.on("pageerror", () => {
    safety.pageErrors += 1;
  });
}

async function addWalletSafety(page: Page, safety: SafetyTotals): Promise<void> {
  const walletState = await page.evaluate(() => (
    window as never as { __proofPayVisualWallet?: { state: {
      walletConnections: number;
      signingRequests: number;
      sendRequests: number;
      broadcasts: number;
    } } }
  ).__proofPayVisualWallet?.state ?? null);
  if (!walletState) return;
  safety.walletConnections += walletState.walletConnections;
  safety.signingRequests += walletState.signingRequests;
  safety.sendRequests += walletState.sendRequests;
  safety.broadcasts += walletState.broadcasts;
}

async function navigate(page: Page, baseUrl: string, route: string, waitUntil: "commit" | "networkidle" = "networkidle") {
  const response = await page.goto(`${baseUrl}${route}`, { timeout: 120_000, waitUntil });
  expect(response, `${route} did not return a document response`).not.toBeNull();
  expect(response?.status(), `${route} returned an unexpected status`).toBeLessThan(500);
  return response?.status() ?? 0;
}

async function capture(
  records: CaptureRecord[],
  page: Page,
  input: Omit<CaptureRecord, "bytes" | "finalUrl" | "horizontalOverflow" | "sha256" | "viewport">,
): Promise<void> {
  const path = resolve(finalDirectory, input.file);
  const viewport = page.viewportSize() ?? { width: 0, height: 0 };
  if (input.elementSelector) {
    await page.locator(input.elementSelector).screenshot({ animations: "disabled", caret: "hide", path });
  } else {
    await page.screenshot({ animations: "disabled", caret: "hide", fullPage: input.fullPage, path });
  }
  const bytes = await readFile(path);
  const dimensions = await page.evaluate(() => ({
    content: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    viewport: document.documentElement.clientWidth,
  }));
  records.push({
    ...input,
    bytes: bytes.byteLength,
    finalUrl: page.url(),
    horizontalOverflow: dimensions.content > dimensions.viewport,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    viewport,
  });
}

async function sourceDiffSha256(): Promise<{ head: string; sha256: string }> {
  const { stdout: headOutput } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot });
  const { stdout: trackedDiff } = await execFileAsync(
    "git",
    ["diff", "--binary", "HEAD", "--", "app", "components", "lib", "tests", "e2e", "playwright.config.ts", "playwright.signal-ledger-visual.config.ts"],
    { cwd: repositoryRoot, maxBuffer: 20 * 1024 * 1024 },
  );
  const { stdout: untrackedOutput } = await execFileAsync("git", ["ls-files", "--others", "--exclude-standard"], {
    cwd: repositoryRoot,
  });
  const digest = createHash("sha256").update(trackedDiff);
  for (const file of untrackedOutput.split("\n").filter((candidate) =>
    /^(app|components|lib|tests|e2e)\//u.test(candidate) || candidate.endsWith(".config.ts"))) {
    digest.update(file).update("\0").update(await readFile(resolve(repositoryRoot, file)));
  }
  return { head: headOutput.trim(), sha256: digest.digest("hex") };
}

async function connectWallet(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Connect wallet/iu }).first().click();
  await expect(page.locator('[data-testid^="wallet-state-"]:not([data-testid="wallet-state-loading"])')).toBeVisible();
}

test("captures the complete Signal Ledger visual proof without signing or broadcasting", async ({ browser }) => {
  test.setTimeout(900_000);
  const captureStartedAt = new Date().toISOString();
  const source = await sourceDiffSha256();
  const records: CaptureRecord[] = [];
  const safety: SafetyTotals = {
    blockedExternalBrowserRequests: 0,
    walletConnections: 0,
    signingRequests: 0,
    sendRequests: 0,
    broadcasts: 0,
    consoleErrors: 0,
    pageErrors: 0,
  };
  await rm(finalDirectory, { force: true, recursive: true });
  await mkdir(finalDirectory, { recursive: true });

  const phases: Array<{ mode: ServerMode; port: number; dataClassification: string; rpcPolicy: string }> = [];

  let server = await startServer("live", 3230);
  phases.push({ mode: "live", port: 3230, dataClassification: "live-read-only", rpcPolicy: "server-side public reads only" });
  try {
    const context = await createSafeContext(browser, safety);
    const page = await context.newPage();
    await observePage(page, safety);
    const status = await navigate(page, "http://127.0.0.1:3230", "/");
    const liveProof = page.getByTestId("landing-live-proof");
    await expect(liveProof).toContainText("$2.00");
    await expect(liveProof).toContainText("2.126887 FXRP");
    await expect(liveProof).toContainText("1.933309 FXRP");
    await expect(liveProof).toContainText("0.193578 FXRP");
    await expect(liveProof).toContainText("SETTLED");
    await capture(records, page, {
      id: 1, file: "01-landing-desktop-live.png", route: "/", responseStatus: status,
      dataClassification: "live-read-only", fullPage: true, interactions: [],
      expectedMarkers: ["invoice 2", "$2.00", "2.126887 FXRP", "1.933309 FXRP", "0.193578 FXRP", "SETTLED"],
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await capture(records, page, {
      id: 2, file: "02-landing-mobile-live.png", route: "/", responseStatus: status,
      dataClassification: "live-read-only", fullPage: true, interactions: ["viewport 390x844"],
      expectedMarkers: ["mobile landing", "live invoice 2", "2x2 scenario controls"],
    });
    await page.setViewportSize({ width: 1024, height: 1000 });
    const scenarios = [
      ["rise", "03-scenario-rise-125.png", "80 FXRP", "30 FXRP"],
      ["steady", "04-scenario-steady-100.png", "100 FXRP", "10 FXRP"],
      ["protected-fall", "05-scenario-fall-095.png", "105.263158 FXRP", "4.736842 FXRP"],
      ["blocked-fall", "06-scenario-blocked-090.png", "111.111112 FXRP", "1.111112 FXRP"],
    ] as const;
    for (const [scenarioId, file, required, outcome] of scenarios) {
      const button = page.locator(`[data-scenario-id="${scenarioId}"]`);
      await button.focus();
      await page.keyboard.press("Enter");
      await expect(button).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByTestId("scenario-calculation")).toContainText(required);
      await expect(page.getByTestId("illustrative-milestone")).toContainText(outcome);
      await capture(records, page, {
        id: records.length + 1, file, route: "/#illustrative-milestone-title", responseStatus: status,
        dataClassification: "illustrative-client-math", fullPage: false,
        elementSelector: '[data-testid="illustrative-milestone"]',
        interactions: [`keyboard selected ${scenarioId}`], expectedMarkers: [required, outcome],
      });
    }
    await context.close();
  } finally {
    await stopServer(server.child);
  }

  server = await startServer("hang", 3231);
  phases.push({ mode: "hang", port: 3231, dataClassification: "controlled-failure", rpcPolicy: "official RPC fetch suspended before network" });
  try {
    const context = await createSafeContext(browser, safety);
    const page = await context.newPage();
    await observePage(page, safety);
    const status = await navigate(page, "http://127.0.0.1:3231", "/invoice/1", "commit");
    await expect(page.getByRole("heading", { name: "Waiting for Coston2 data" })).toBeVisible();
    await expect(page.locator('[aria-busy="true"]')).toHaveAttribute("aria-live", "polite");
    await capture(records, page, {
      id: 16, file: "16-loading.png", route: "/invoice/1", responseStatus: status,
      dataClassification: "controlled-failure", fullPage: true, interactions: ["official RPC fetch suspended"],
      expectedMarkers: ["Waiting for Coston2 data", "aria-busy", "aria-live polite"],
    });
    await context.close();
  } finally {
    await stopServer(server.child);
  }

  server = await startServer("fail", 3232);
  phases.push({ mode: "fail", port: 3232, dataClassification: "controlled-failure", rpcPolicy: "official RPC fetch rejected before network" });
  try {
    const context = await createSafeContext(browser, safety);
    const page = await context.newPage();
    await observePage(page, safety);
    const status = await navigate(page, "http://127.0.0.1:3232", "/invoice/1");
    await expect(page.getByRole("heading", { name: "Coston2 data could not be read" })).toBeVisible();
    await expect(page.getByTestId("status-stamp")).toHaveText("Read failed");
    await expect(page.locator("button").filter({ hasText: transactionAction })).toHaveCount(0);
    await capture(records, page, {
      id: 17, file: "17-rpc-failure.png", route: "/invoice/1", responseStatus: status,
      dataClassification: "controlled-failure", fullPage: true, interactions: ["official RPC fetch rejected"],
      expectedMarkers: ["Coston2 data could not be read", "No stored artifact has been substituted", "Read failed"],
    });
    await context.close();
  } finally {
    await stopServer(server.child);
  }

  server = await startServer("fixture", 3233);
  phases.push({ mode: "fixture", port: 3233, dataClassification: "deterministic fixtures", rpcPolicy: "browser external requests blocked; fixture authorization" });
  try {
    const baseUrl = "http://127.0.0.1:3233";
    const context = await createSafeContext(browser, safety);
    const page = await context.newPage();
    await observePage(page, safety);
    let status = await navigate(page, baseUrl, "/app");
    await expect(page.getByRole("button", { name: "Connect wallet to create a milestone" })).toBeVisible();
    await expect(page.getByTestId("transaction-journal")).toHaveCount(0);
    await capture(records, page, {
      id: 7, file: "07-app-disconnected.png", route: "/app", responseStatus: status,
      dataClassification: "synthetic-wallet-fixture", fullPage: true, interactions: [],
      expectedMarkers: ["Connect wallet to create a milestone", "no empty journal"],
    });

    await page.setViewportSize({ width: 390, height: 844 });
    status = await navigate(page, baseUrl, "/invoice/2");
    await expect(page.getByTestId("sample-scenario-label")).toContainText("fixture only");
    await expect(page.getByTestId("preview-top-up")).toContainText("1 FXRP");
    await capture(records, page, {
      id: 11, file: "11-top-up-sample-mobile.png", route: "/invoice/2", responseStatus: status,
      dataClassification: "explicit-sample-fixture", fullPage: true, interactions: ["viewport 390x844"],
      expectedMarkers: ["Sample scenario", "fixture only", "1 FXRP", "No payment has been released"],
    });

    await page.setViewportSize({ width: 1440, height: 1000 });
    status = await navigate(page, baseUrl, "/invoice/1");
    await expect(page.getByTestId("terminal-payout")).toContainText("4.818748 FXRP");
    await expect(page.getByTestId("terminal-refund")).toContainText("0.481197 FXRP");
    await expect(page.locator(".wallet-actions, .action-focus-panel")).toHaveCount(0);
    await capture(records, page, {
      id: 12, file: "12-terminal-invoice.png", route: "/invoice/1", responseStatus: status,
      dataClassification: "verified-historical-fixture", fullPage: true, interactions: [],
      expectedMarkers: ["SETTLED", "4.818748 FXRP", "0.481197 FXRP", "View settlement receipt"],
    });

    status = await navigate(page, baseUrl, "/receipt/1");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("SETTLEMENT RECEIPT · INVOICE #1");
    await capture(records, page, {
      id: 13, file: "13-receipt-desktop.png", route: "/receipt/1", responseStatus: status,
      dataClassification: "verified-historical-fixture", fullPage: true, interactions: ["evidence collapsed"],
      expectedMarkers: ["SETTLEMENT RECEIPT · INVOICE #1", "SETTLED"],
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await capture(records, page, {
      id: 14, file: "14-receipt-mobile.png", route: "/receipt/1", responseStatus: status,
      dataClassification: "verified-historical-fixture", fullPage: true, interactions: ["viewport 390x844", "evidence collapsed"],
      expectedMarkers: ["mobile archival receipt", "no outer shadow"],
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByTestId("evidence-details").locator(":scope > summary").click();
    await page.getByTestId("contract-details").locator(":scope > summary").click();
    await capture(records, page, {
      id: 15, file: "15-receipt-expanded-evidence.png", route: "/receipt/1", responseStatus: status,
      dataClassification: "verified-historical-fixture", fullPage: true,
      interactions: ["opened How this settlement was confirmed", "opened Commitments and final contract state"],
      expectedMarkers: ["InvoiceCreated", "InvoiceFunded", "EvidenceSubmitted", "InvoiceReleased", "RELEASED"],
    });

    status = await navigate(page, baseUrl, "/invoice/999");
    await expect(page.getByRole("heading", { name: "This invoice does not exist" })).toBeVisible();
    await expect(page.locator("button").filter({ hasText: transactionAction })).toHaveCount(0);
    await capture(records, page, {
      id: 18, file: "18-unknown-invoice.png", route: "/invoice/999", responseStatus: status,
      dataClassification: "deterministic-fixture", fullPage: true, interactions: [],
      expectedMarkers: ["This invoice does not exist", "No record", "no transaction controls"],
    });
    await context.close();

    const connectedContext = await createSafeContext(browser, safety);
    await installReadOnlyWallet(connectedContext, FREELANCER);
    const connectedPage = await connectedContext.newPage();
    await observePage(connectedPage, safety);
    status = await navigate(connectedPage, baseUrl, "/app");
    await connectWallet(connectedPage);
    await expect(connectedPage.getByRole("button", { name: "Simulate invoice creation" })).toBeEnabled();
    await capture(records, connectedPage, {
      id: 8, file: "08-app-connected.png", route: "/app", responseStatus: status,
      dataClassification: "synthetic-wallet-fixture", fullPage: true, interactions: ["connected synthetic freelancer"],
      expectedMarkers: ["Coston2", "connected wallet", "Simulate invoice creation"],
    });
    await addWalletSafety(connectedPage, safety);
    await connectedContext.close();

    const fundingContext = await createSafeContext(browser, safety);
    await installReadOnlyWallet(fundingContext, CLIENT);
    const fundingPage = await fundingContext.newPage();
    await observePage(fundingPage, safety);
    status = await navigate(fundingPage, baseUrl, "/invoice/3");
    await connectWallet(fundingPage);
    await fundingPage.getByRole("button", { name: "Preview and simulate funding" }).click();
    await expect(fundingPage.getByTestId("transaction-intent")).toContainText("Fund this $5 milestone");
    await expect(fundingPage.getByTestId("transaction-intent")).toContainText("5.61 FXRP");
    await capture(records, fundingPage, {
      id: 9, file: "09-funding-action.png", route: "/invoice/3", responseStatus: status,
      dataClassification: "synthetic-wallet-fixture", fullPage: true,
      interactions: ["connected synthetic client", "previewed and simulated funding", "did not sign"],
      expectedMarkers: ["Fund this $5 milestone", "5.61 FXRP", "Simulation passed", "Not confirmed"],
    });
    await addWalletSafety(fundingPage, safety);
    await fundingContext.close();

    const releaseContext = await createSafeContext(browser, safety);
    await installReadOnlyWallet(releaseContext, CLIENT);
    const releasePage = await releaseContext.newPage();
    await observePage(releasePage, safety);
    status = await navigate(releasePage, baseUrl, "/invoice/7");
    await connectWallet(releasePage);
    await releasePage.getByRole("button", { name: "Refresh and simulate settlement" }).click();
    await expect(releasePage.getByTestId("transaction-intent")).toContainText("Release payment");
    await expect(releasePage.getByTestId("transaction-intent")).toContainText("5 FXRP to the freelancer");
    await expect(releasePage.getByTestId("transaction-intent")).toContainText("0.5 FXRP");
    await capture(records, releasePage, {
      id: 10, file: "10-release-action.png", route: "/invoice/7", responseStatus: status,
      dataClassification: "synthetic-wallet-fixture", fullPage: true,
      interactions: ["connected synthetic client", "refreshed and simulated release", "did not sign"],
      expectedMarkers: ["Release payment", "5 FXRP to the freelancer", "0.5 FXRP", "Not confirmed"],
    });
    await addWalletSafety(releasePage, safety);
    await releaseContext.close();
  } finally {
    await stopServer(server.child);
  }

  records.sort((left, right) => left.id - right.id);
  expect(records).toHaveLength(18);
  expect(records.every((record) => !record.horizontalOverflow)).toBe(true);
  expect(safety.signingRequests).toBe(0);
  expect(safety.sendRequests).toBe(0);
  expect(safety.broadcasts).toBe(0);
  expect(safety.consoleErrors).toBe(0);
  expect(safety.pageErrors).toBe(0);

  const totalBytes = records.reduce((total, record) => total + record.bytes, 0);
  const manifest = {
    schemaVersion: 1,
    phase: "6B1",
    kind: "signal-ledger-visual-proof",
    captureWindowUtc: { startedAt: captureStartedAt, completedAt: new Date().toISOString() },
    sourceHeadAtCapture: source.head,
    sourceDiffSha256: source.sha256,
    runner: {
      node: process.version,
      playwright: "1.62.1",
      browser: `chromium ${browser.version()}`,
      workers: 1,
      locale: "en-US",
      timezone: "Africa/Lagos",
      colorScheme: "light",
      reducedMotion: "reduce",
    },
    serverPhases: phases,
    safety,
    captures: records,
    summary: { captureCount: records.length, totalBytes, failures: 0 },
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  expect((await stat(manifestPath)).size).toBeGreaterThan(0);
});
