import AxeBuilder from "@axe-core/playwright";
import { createHash } from "node:crypto";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { promisify } from "node:util";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { encodeFunctionData, encodeFunctionResult } from "viem";

import { fxrpAbi, proofPayAbi, PROOFPAY_CONTRACT_ADDRESS } from "../lib/proofpay-contract";

const execFileAsync = promisify(execFile);
const repositoryRoot = process.cwd();
const finalDirectory = resolve(repositoryRoot, "artifacts", "escrow-flow-final");
const manifestPath = resolve(finalDirectory, "visual-proof.json");
const protectedSignalLedgerDirectory = resolve(repositoryRoot, "artifacts", "signal-ledger");
const nextEnvPath = resolve(repositoryRoot, "next-env.d.ts");
const nextBinary = resolve(repositoryRoot, "node_modules", "next", "dist", "bin", "next");
const rpcHook = resolve(repositoryRoot, "e2e", "support", "signal-ledger-rpc-hook.cjs");
const CLIENT = "0x2222222222222222222222222222222222222222";
const FREELANCER = "0x1111111111111111111111111111111111111111";
const transactionAction = /sign|approve|send transaction|fund now|submit evidence|top[ -]?up now|release now|refund now|cancel now/iu;

const captureNames = [
  "01-landing-desktop.png",
  "02-landing-mobile-320.png",
  "03-scenario-rise.png",
  "04-scenario-stable.png",
  "05-scenario-within-buffer.png",
  "06-scenario-top-up-required.png",
  "07-app-disconnected.png",
  "08-app-connected-fixture.png",
  "09-funding-action-fixture.png",
  "10-release-action-fixture.png",
  "11-top-up-action-fixture.png",
  "12-terminal-invoice-2-live.png",
  "13-receipt-2-desktop-live.png",
  "14-receipt-2-mobile-live.png",
  "15-receipt-2-expanded-live.png",
  "16-controlled-loading.png",
  "17-controlled-rpc-failure.png",
] as const;

const selectors = {
  createInvoice: encodeFunctionData({
    abi: proofPayAbi,
    functionName: "createInvoice",
    args: [CLIENT, 1n, 1n, `0x${"1".repeat(64)}`],
  }).slice(0, 10),
  quoteFunding: encodeFunctionData({ abi: proofPayAbi, functionName: "quoteFunding", args: [1n] }).slice(0, 10),
  fundInvoice: encodeFunctionData({ abi: proofPayAbi, functionName: "fundInvoice", args: [1n, 1n, 1n] }).slice(0, 10),
  quoteRelease: encodeFunctionData({ abi: proofPayAbi, functionName: "quoteRelease", args: [1n] }).slice(0, 10),
  topUp: encodeFunctionData({ abi: proofPayAbi, functionName: "topUp", args: [1n, 1n, 1n] }).slice(0, 10),
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
  quoteReleaseReady: encodeFunctionResult({
    abi: proofPayAbi,
    functionName: "quoteRelease",
    result: [5_000_000n, 500_000n, 0n, 1_000_000n, 6, 1_900_000_000n],
  }),
  quoteReleaseTopUp: encodeFunctionResult({
    abi: proofPayAbi,
    functionName: "quoteRelease",
    result: [5_000_000n, 0n, 1_000_000n, 1_000_000n, 6, 1_900_000_000n],
  }),
};

type ServerMode = "live" | "hang" | "fail" | "fixture";
type AccessibilityAudit = { totalViolations: number; serious: number; critical: number };
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
  reducedMotion: boolean;
  accessibility: AccessibilityAudit;
  bytes: number;
  sha256: string;
};
type SafetyTotals = {
  blockedExternalBrowserRequests: number;
  walletConnections: number;
  signatureRequests: number;
  sendRequests: number;
  actualSignatures: number;
  actualSends: number;
  broadcasts: number;
  consoleErrors: number;
  pageErrors: number;
};
type ResponsiveCheck = {
  route: string;
  width: number;
  height: number;
  contentWidth: number;
  viewportWidth: number;
  horizontalOverflow: boolean;
};

const delay = async (milliseconds: number) => await new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

async function startServer(mode: ServerMode, port: number): Promise<{ child: ChildProcess; logs: string[] }> {
  const environment = { ...process.env };
  delete environment.PROOFPAY_DATA_MODE;
  delete environment.PROOFPAY_FIXTURE_AUTH;
  delete environment.PROOFPAY_VISUAL_RPC_MODE;
  if (mode === "fixture") {
    environment.NODE_ENV = "development";
    environment.PROOFPAY_DATA_MODE = "fixture";
    environment.PROOFPAY_FIXTURE_AUTH = "phase5a-e2e";
  } else {
    environment.NODE_ENV = "production";
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
      // The server has not bound the port yet.
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
      // The process group already exited.
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

async function installStrictSyntheticWallet(context: BrowserContext, account: string): Promise<void> {
  await context.addInitScript(({ walletAccount, callSelectors, results, contractAddress }) => {
    const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
    const state = {
      account: walletAccount,
      connected: false,
      requests: [] as Array<{ method: string; params?: unknown }>,
      walletConnections: 0,
      signatureRequests: 0,
      sendRequests: 0,
      actualSignatures: 0,
      actualSends: 0,
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
        if (["personal_sign", "eth_sign", "eth_signTransaction", "eth_signTypedData", "eth_signTypedData_v3", "eth_signTypedData_v4"].includes(method)) {
          state.signatureRequests += 1;
          throw new Error("Escrow Flow visual proof forbids signature requests.");
        }
        if (["eth_sendTransaction", "eth_sendRawTransaction", "eth_sendUserOperation", "wallet_sendCalls"].includes(method)) {
          state.sendRequests += 1;
          throw new Error("Escrow Flow visual proof forbids transaction submission.");
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
            if (data.startsWith(callSelectors.quoteRelease)) {
              const invoiceId = data.length >= 64 ? BigInt(`0x${data.slice(-64)}`) : 0n;
              return invoiceId === 6n ? results.quoteReleaseTopUp : results.quoteReleaseReady;
            }
            if (data.startsWith(callSelectors.allowance)) {
              return `0x${999_999_999n.toString(16).padStart(64, "0")}`;
            }
            if ([callSelectors.fundInvoice, callSelectors.topUp, callSelectors.release].some((selector) => data.startsWith(selector))) return "0x";
            throw new Error(`Unexpected Escrow Flow visual-proof eth_call ${data.slice(0, 10)}`);
          }
          case "eth_estimateGas": return "0x5208";
          case "eth_blockNumber": return "0x64";
          case "eth_getCode": return contractAddress ? "0x01" : "0x";
          default: throw new Error(`Unexpected Escrow Flow visual-proof wallet RPC method ${method}`);
        }
      },
    };
    Object.assign(window, { ethereum: provider, __proofPayEscrowFlowWallet: { state } });
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
    window as never as { __proofPayEscrowFlowWallet?: { state: {
      walletConnections: number;
      signatureRequests: number;
      sendRequests: number;
      actualSignatures: number;
      actualSends: number;
      broadcasts: number;
    } } }
  ).__proofPayEscrowFlowWallet?.state ?? null);
  if (!walletState) return;
  safety.walletConnections += walletState.walletConnections;
  safety.signatureRequests += walletState.signatureRequests;
  safety.sendRequests += walletState.sendRequests;
  safety.actualSignatures += walletState.actualSignatures;
  safety.actualSends += walletState.actualSends;
  safety.broadcasts += walletState.broadcasts;
}

async function navigate(
  page: Page,
  baseUrl: string,
  route: string,
  waitUntil: "commit" | "domcontentloaded" | "networkidle" = "networkidle",
): Promise<number> {
  const response = await page.goto(`${baseUrl}${route}`, { timeout: 120_000, waitUntil });
  expect(response, `${route} did not return a document response`).not.toBeNull();
  expect(response?.status(), `${route} returned an unexpected status`).toBeLessThan(500);
  return response?.status() ?? 0;
}

async function auditAccessibility(page: Page): Promise<AccessibilityAudit> {
  const scan = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = scan.violations.filter((violation) => violation.impact === "serious");
  const critical = scan.violations.filter((violation) => violation.impact === "critical");
  expect(
    [...serious, ...critical],
    `Axe serious/critical violations:\n${JSON.stringify([...serious, ...critical], null, 2)}`,
  ).toEqual([]);
  return { totalViolations: scan.violations.length, serious: serious.length, critical: critical.length };
}

async function readLayout(page: Page) {
  return await page.evaluate(() => ({
    contentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    viewportWidth: document.documentElement.clientWidth,
    offenders: [...document.querySelectorAll("body *")]
      .map((element) => {
        const bounds = element.getBoundingClientRect();
        return {
          selector: `${element.tagName.toLowerCase()}${typeof element.className === "string" && element.className ? `.${element.className.trim().replaceAll(/\s+/gu, ".")}` : ""}`,
          left: Math.round(bounds.left),
          right: Math.round(bounds.right),
        };
      })
      .filter((element) => element.left < -1 || element.right > document.documentElement.clientWidth + 1)
      .slice(0, 8),
  }));
}

async function checkResponsiveViewport(
  page: Page,
  route: string,
  width: number,
  height: number,
  checks: ResponsiveCheck[],
): Promise<void> {
  await page.setViewportSize({ width, height });
  const dimensions = await readLayout(page);
  const horizontalOverflow = dimensions.contentWidth > dimensions.viewportWidth;
  expect(horizontalOverflow, `${route} overflows horizontally at ${width}px: ${JSON.stringify(dimensions.offenders)}`).toBe(false);
  checks.push({ route, width, height, ...dimensions, horizontalOverflow });
}

async function capture(
  records: CaptureRecord[],
  page: Page,
  input: Omit<CaptureRecord, "accessibility" | "bytes" | "finalUrl" | "horizontalOverflow" | "reducedMotion" | "sha256" | "viewport">,
): Promise<void> {
  for (const marker of input.expectedMarkers) await expect(page.locator("body")).toContainText(marker);
  const accessibility = await auditAccessibility(page);
  const reducedMotion = await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  expect(reducedMotion, "capture context does not honor prefers-reduced-motion").toBe(true);
  const dimensions = await readLayout(page);
  const horizontalOverflow = dimensions.contentWidth > dimensions.viewportWidth;
  expect(horizontalOverflow, `${input.route} overflows horizontally`).toBe(false);

  const path = resolve(finalDirectory, input.file);
  const viewport = page.viewportSize() ?? { width: 0, height: 0 };
  if (input.elementSelector) {
    await page.locator(input.elementSelector).screenshot({ animations: "disabled", caret: "hide", path });
  } else {
    await page.screenshot({ animations: "disabled", caret: "hide", fullPage: input.fullPage, path });
  }
  const bytes = await readFile(path);
  records.push({
    ...input,
    accessibility,
    bytes: bytes.byteLength,
    finalUrl: page.url(),
    horizontalOverflow,
    reducedMotion,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    viewport,
  });
}

async function sourceDiffSha256(): Promise<{ head: string; sha256: string }> {
  const { stdout: headOutput } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot });
  const { stdout: trackedDiff } = await execFileAsync(
    "git",
    ["diff", "--binary", "HEAD", "--", "app", "components", "lib", "tests", "e2e", "package.json", "playwright.config.ts", "playwright.escrow-flow-visual.config.ts"],
    { cwd: repositoryRoot, maxBuffer: 20 * 1024 * 1024 },
  );
  const { stdout: untrackedOutput } = await execFileAsync("git", ["ls-files", "--others", "--exclude-standard"], { cwd: repositoryRoot });
  const digest = createHash("sha256").update(trackedDiff);
  for (const file of untrackedOutput.split("\n").filter((candidate) =>
    /^(app|components|lib|tests|e2e)\//u.test(candidate) || candidate === "package.json" || candidate.endsWith(".config.ts"))) {
    digest.update(file).update("\0").update(await readFile(resolve(repositoryRoot, file)));
  }
  return { head: headOutput.trim(), sha256: digest.digest("hex") };
}

async function directoryFingerprint(directory: string): Promise<string> {
  const digest = createHash("sha256");
  const visit = async (currentDirectory: string, prefix: string): Promise<void> => {
    let entries;
    try {
      entries = await readdir(currentDirectory, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        digest.update("absent\0");
        return;
      }
      throw error;
    }
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const entryName = prefix ? `${prefix}/${entry.name}` : entry.name;
      const entryPath = resolve(currentDirectory, entry.name);
      digest.update(entryName).update("\0");
      if (entry.isDirectory()) await visit(entryPath, entryName);
      else digest.update(await readFile(entryPath));
    }
  };
  await visit(directory, "");
  return digest.digest("hex");
}

async function resetFinalDirectory(): Promise<void> {
  expect(relative(repositoryRoot, finalDirectory)).toBe("artifacts/escrow-flow-final");
  await rm(finalDirectory, { force: true, recursive: true });
  await mkdir(finalDirectory, { recursive: true });
}

async function restoreNextEnv(expected: Buffer): Promise<void> {
  const current = await readFile(nextEnvPath);
  if (!current.equals(expected)) await writeFile(nextEnvPath, expected);
  expect((await readFile(nextEnvPath)).equals(expected), "next-env.d.ts was not restored byte-for-byte").toBe(true);
}

async function connectWallet(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Connect wallet/iu }).first().click();
  await expect(page.locator('[data-testid^="wallet-state-"]:not([data-testid="wallet-state-loading"])')).toBeVisible();
}

test("captures exactly 17 Escrow Flow frames without signatures, sends, or broadcasts", async ({ browser }) => {
  test.setTimeout(900_000);
  const captureStartedAt = new Date().toISOString();
  const source = await sourceDiffSha256();
  const protectedSignalLedgerSha256 = await directoryFingerprint(protectedSignalLedgerDirectory);
  const nextEnvBefore = await readFile(nextEnvPath);
  const records: CaptureRecord[] = [];
  const responsiveChecks: ResponsiveCheck[] = [];
  const safety: SafetyTotals = {
    blockedExternalBrowserRequests: 0,
    walletConnections: 0,
    signatureRequests: 0,
    sendRequests: 0,
    actualSignatures: 0,
    actualSends: 0,
    broadcasts: 0,
    consoleErrors: 0,
    pageErrors: 0,
  };
  await resetFinalDirectory();
  const phases: Array<{ mode: ServerMode; port: number; dataClassification: string; rpcPolicy: string }> = [];

  let server = await startServer("live", 3270);
  phases.push({
    mode: "live",
    port: 3270,
    dataClassification: "live-read-only",
    rpcPolicy: "server-side public reads only; no wallet injection",
  });
  try {
    const context = await createSafeContext(browser, safety);
    const page = await context.newPage();
    await observePage(page, safety);
    let status = await navigate(page, "http://127.0.0.1:3270", "/");
    const liveProof = page.getByTestId("landing-live-proof");
    await expect(liveProof).toContainText("Invoice #2");
    await expect(liveProof).toContainText("$2.00");
    await expect(liveProof).toContainText("2.126887 FXRP");
    await expect(liveProof).toContainText("1.933309 FXRP");
    await expect(liveProof).toContainText("0.193578 FXRP");
    await expect(liveProof).toContainText("SETTLED");
    await expect(page.getByTestId("illustrative-milestone")).toContainText(
      "Illustrative $100 milestone · no transaction is being sent",
    );
    await capture(records, page, {
      id: 1,
      file: captureNames[0],
      route: "/",
      responseStatus: status,
      dataClassification: "live-read-only",
      fullPage: true,
      interactions: [],
      expectedMarkers: [
        "Keep the milestone in dollars. Settle it in FXRP.",
        "USD agreement",
        "FXRP lock",
        "Settled on Coston2",
      ],
    });

    await checkResponsiveViewport(page, "/", 320, 844, responsiveChecks);
    await expect(page.locator(".scenario-controls button")).toHaveCount(4);
    await capture(records, page, {
      id: 2,
      file: captureNames[1],
      route: "/",
      responseStatus: status,
      dataClassification: "live-read-only",
      fullPage: true,
      interactions: ["viewport 320x844"],
      expectedMarkers: ["Create a milestone", "See a real settlement", "USD agreement", "FXRP lock"],
    });

    await checkResponsiveViewport(page, "/", 390, 844, responsiveChecks);
    await page.setViewportSize({ width: 1024, height: 1000 });
    const scenarios = [
      ["rise", captureNames[2], "80 FXRP", "30 FXRP", "Enter"],
      ["steady", captureNames[3], "100 FXRP", "10 FXRP", "Space"],
      ["protected-fall", captureNames[4], "105.263158 FXRP", "4.736842 FXRP", "Enter"],
      ["blocked-fall", captureNames[5], "111.111112 FXRP", "1.111112 FXRP", "Space"],
    ] as const;
    for (const [scenarioId, file, required, outcome, key] of scenarios) {
      const button = page.locator(`[data-scenario-id="${scenarioId}"]`);
      await button.focus();
      await expect(button).toBeFocused();
      await page.keyboard.press(key);
      await expect(button).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByTestId("scenario-calculation")).toContainText(required);
      await expect(page.getByTestId("illustrative-milestone")).toContainText(outcome);
      await capture(records, page, {
        id: records.length + 1,
        file,
        route: "/#illustrative-milestone-title",
        responseStatus: status,
        dataClassification: "illustrative-client-math",
        fullPage: false,
        elementSelector: '[data-testid="illustrative-milestone"]',
        interactions: [`keyboard selected ${scenarioId} with ${key}`],
        expectedMarkers: [required, outcome, "Illustrative $100 milestone · no transaction is being sent"],
      });
    }

    await page.setViewportSize({ width: 1440, height: 1000 });
    status = await navigate(page, "http://127.0.0.1:3270", "/invoice/2", "domcontentloaded");
    await expect(page.getByTestId("invoice-document")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("status-stamp")).toHaveText("SETTLED");
    await expect(page.getByTestId("terminal-payout")).toContainText("1.933309 FXRP");
    await expect(page.getByTestId("terminal-refund")).toContainText("0.193578 FXRP");
    await expect(page.locator("button").filter({ hasText: transactionAction })).toHaveCount(0);
    await capture(records, page, {
      id: 12,
      file: captureNames[11],
      route: "/invoice/2",
      responseStatus: status,
      dataClassification: "live-read-only",
      fullPage: true,
      interactions: [],
      expectedMarkers: [
        "Verify ProofPay wallet actions on Coston2",
        "SETTLED",
        "1.933309 FXRP",
        "0.193578 FXRP",
        "View settlement receipt",
      ],
    });

    status = await navigate(page, "http://127.0.0.1:3270", "/receipt/2", "domcontentloaded");
    const receipt = page.getByTestId("receipt-document");
    await expect(receipt).toBeVisible({ timeout: 60_000 });
    await expect(receipt.getByRole("heading", { level: 1 })).toHaveText("SETTLEMENT RECEIPT · INVOICE #2");
    await expect(page.getByTestId("money-locked")).toContainText("2.126887 FXRP");
    await expect(page.getByTestId("money-payout")).toContainText("1.933309 FXRP");
    await expect(page.getByTestId("money-refund")).toContainText("0.193578 FXRP");
    await capture(records, page, {
      id: 13,
      file: captureNames[12],
      route: "/receipt/2",
      responseStatus: status,
      dataClassification: "live-read-only",
      fullPage: true,
      interactions: ["evidence collapsed"],
      expectedMarkers: [
        "SETTLEMENT RECEIPT · INVOICE #2",
        "SETTLED",
        "2.126887 FXRP",
        "1.933309 FXRP",
        "0.193578 FXRP",
      ],
    });

    await checkResponsiveViewport(page, "/receipt/2", 390, 844, responsiveChecks);
    await capture(records, page, {
      id: 14,
      file: captureNames[13],
      route: "/receipt/2",
      responseStatus: status,
      dataClassification: "live-read-only",
      fullPage: true,
      interactions: ["viewport 390x844", "evidence collapsed"],
      expectedMarkers: ["SETTLEMENT RECEIPT · INVOICE #2", "SETTLED", "Coston2 testnet evidence"],
    });

    await page.setViewportSize({ width: 1440, height: 1000 });
    const evidenceSummary = page.getByTestId("evidence-details").locator(":scope > summary");
    await evidenceSummary.focus();
    await expect(evidenceSummary).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("evidence-details")).toHaveAttribute("open", "");
    const contractSummary = page.getByTestId("contract-details").locator(":scope > summary");
    await contractSummary.focus();
    await expect(contractSummary).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("contract-details")).toHaveAttribute("open", "");
    await capture(records, page, {
      id: 15,
      file: captureNames[14],
      route: "/receipt/2",
      responseStatus: status,
      dataClassification: "live-read-only",
      fullPage: true,
      interactions: ["keyboard opened settlement evidence", "keyboard opened contract state"],
      expectedMarkers: ["InvoiceCreated", "InvoiceFunded", "EvidenceSubmitted", "InvoiceReleased", "RELEASED"],
    });
    await context.close();
  } finally {
    await stopServer(server.child);
  }

  server = await startServer("hang", 3271);
  phases.push({
    mode: "hang",
    port: 3271,
    dataClassification: "controlled-failure",
    rpcPolicy: "official RPC fetch suspended before network",
  });
  try {
    const context = await createSafeContext(browser, safety);
    const page = await context.newPage();
    await observePage(page, safety);
    const status = await navigate(page, "http://127.0.0.1:3271", "/invoice/1", "commit");
    await expect(page.getByRole("heading", { name: "Waiting for Coston2 data" })).toBeVisible();
    await expect(page.locator('[aria-busy="true"]')).toHaveAttribute("aria-live", "polite");
    await capture(records, page, {
      id: 16,
      file: captureNames[15],
      route: "/invoice/1",
      responseStatus: status,
      dataClassification: "controlled-failure",
      fullPage: true,
      interactions: ["official RPC fetch suspended before network"],
      expectedMarkers: ["Waiting for Coston2 data", "Reading the invoice terms and settlement evidence."],
    });
    await context.close();
  } finally {
    await stopServer(server.child);
  }

  server = await startServer("fail", 3272);
  phases.push({
    mode: "fail",
    port: 3272,
    dataClassification: "controlled-failure",
    rpcPolicy: "official RPC fetch rejected before network",
  });
  try {
    const context = await createSafeContext(browser, safety);
    const page = await context.newPage();
    await observePage(page, safety);
    const status = await navigate(page, "http://127.0.0.1:3272", "/invoice/1");
    await expect(page.getByRole("heading", { name: "Coston2 data could not be read" })).toBeVisible();
    await expect(page.getByTestId("status-stamp")).toHaveText("Read failed");
    await expect(page.locator("button").filter({ hasText: transactionAction })).toHaveCount(0);
    await capture(records, page, {
      id: 17,
      file: captureNames[16],
      route: "/invoice/1",
      responseStatus: status,
      dataClassification: "controlled-failure",
      fullPage: true,
      interactions: ["official RPC fetch rejected before network"],
      expectedMarkers: ["Coston2 data could not be read", "No stored artifact has been substituted", "Read failed"],
    });
    await context.close();
  } finally {
    await stopServer(server.child);
  }

  try {
    server = await startServer("fixture", 3273);
  } catch (error) {
    await restoreNextEnv(nextEnvBefore);
    throw error;
  }
  phases.push({
    mode: "fixture",
    port: 3273,
    dataClassification: "deterministic fixtures",
    rpcPolicy: "strict synthetic provider; browser external requests blocked",
  });
  try {
    const baseUrl = "http://127.0.0.1:3273";

    const disconnectedContext = await createSafeContext(browser, safety);
    await installStrictSyntheticWallet(disconnectedContext, FREELANCER);
    const disconnectedPage = await disconnectedContext.newPage();
    await observePage(disconnectedPage, safety);
    let status = await navigate(disconnectedPage, baseUrl, "/app");
    await expect(disconnectedPage.getByRole("button", { name: "Connect wallet to create a milestone" })).toBeVisible();
    await expect(disconnectedPage.getByTestId("transaction-journal")).toHaveCount(0);
    await capture(records, disconnectedPage, {
      id: 7,
      file: captureNames[6],
      route: "/app",
      responseStatus: status,
      dataClassification: "synthetic-wallet-fixture",
      fullPage: true,
      interactions: ["strict synthetic provider present but disconnected"],
      expectedMarkers: ["Create a dollar-priced FXRP milestone", "Connect wallet to create a milestone", "Find an existing milestone."],
    });
    await addWalletSafety(disconnectedPage, safety);
    await disconnectedContext.close();

    const connectedContext = await createSafeContext(browser, safety);
    await installStrictSyntheticWallet(connectedContext, FREELANCER);
    const connectedPage = await connectedContext.newPage();
    await observePage(connectedPage, safety);
    status = await navigate(connectedPage, baseUrl, "/app");
    await connectWallet(connectedPage);
    await expect(connectedPage.getByRole("button", { name: "Simulate invoice creation" })).toBeEnabled();
    await capture(records, connectedPage, {
      id: 8,
      file: captureNames[7],
      route: "/app",
      responseStatus: status,
      dataClassification: "synthetic-wallet-fixture",
      fullPage: true,
      interactions: ["connected strict synthetic freelancer", "did not prepare or sign"],
      expectedMarkers: ["Coston2", "Simulate invoice creation", "Find an existing milestone."],
    });
    await addWalletSafety(connectedPage, safety);
    await connectedContext.close();

    const fundingContext = await createSafeContext(browser, safety);
    await installStrictSyntheticWallet(fundingContext, CLIENT);
    const fundingPage = await fundingContext.newPage();
    await observePage(fundingPage, safety);
    status = await navigate(fundingPage, baseUrl, "/invoice/3");
    await connectWallet(fundingPage);
    await fundingPage.getByRole("button", { name: "Preview and simulate funding" }).click();
    const fundingIntent = fundingPage.getByTestId("transaction-intent");
    await expect(fundingIntent).toContainText("Fund this $5 milestone");
    await expect(fundingIntent).toContainText("5.61 FXRP");
    await expect(fundingIntent.getByRole("button", { name: /Fund this \$5 milestone/iu })).toBeVisible();
    await capture(records, fundingPage, {
      id: 9,
      file: captureNames[8],
      route: "/invoice/3",
      responseStatus: status,
      dataClassification: "synthetic-wallet-fixture",
      fullPage: true,
      interactions: ["connected strict synthetic client", "previewed funding", "did not click final wallet action"],
      expectedMarkers: ["Fund this $5 milestone", "5.61 FXRP", "Simulation passed", "Not confirmed"],
    });
    await addWalletSafety(fundingPage, safety);
    await fundingContext.close();

    const releaseContext = await createSafeContext(browser, safety);
    await installStrictSyntheticWallet(releaseContext, CLIENT);
    const releasePage = await releaseContext.newPage();
    await observePage(releasePage, safety);
    status = await navigate(releasePage, baseUrl, "/invoice/7");
    await connectWallet(releasePage);
    await releasePage.getByRole("button", { name: "Refresh and simulate settlement" }).click();
    const releaseIntent = releasePage.getByTestId("transaction-intent");
    await expect(releaseIntent).toContainText("Release payment");
    await expect(releaseIntent).toContainText("5 FXRP to the freelancer");
    await expect(releaseIntent).toContainText("0.5 FXRP");
    await expect(releaseIntent.getByRole("button", { name: /Release payment/iu })).toBeVisible();
    await capture(records, releasePage, {
      id: 10,
      file: captureNames[9],
      route: "/invoice/7",
      responseStatus: status,
      dataClassification: "synthetic-wallet-fixture",
      fullPage: true,
      interactions: ["connected strict synthetic client", "previewed release", "did not click final wallet action"],
      expectedMarkers: ["Release payment", "5 FXRP to the freelancer", "0.5 FXRP", "Not confirmed"],
    });
    await addWalletSafety(releasePage, safety);
    await releaseContext.close();

    const topUpContext = await createSafeContext(browser, safety);
    await installStrictSyntheticWallet(topUpContext, CLIENT);
    const topUpPage = await topUpContext.newPage();
    await observePage(topUpPage, safety);
    status = await navigate(topUpPage, baseUrl, "/invoice/6");
    await connectWallet(topUpPage);
    await topUpPage.getByRole("button", { name: "Refresh and simulate settlement" }).click();
    await expect(topUpPage.getByTestId("settlement-preview")).toContainText("exact shortfall is 1 FXRP");
    const topUpIntent = topUpPage.getByTestId("transaction-intent");
    await expect(topUpIntent).toContainText("Top up 1 FXRP before payment can be released");
    await expect(topUpIntent.getByRole("button", { name: /Top up 1 FXRP/iu })).toBeVisible();
    await capture(records, topUpPage, {
      id: 11,
      file: captureNames[10],
      route: "/invoice/6",
      responseStatus: status,
      dataClassification: "synthetic-wallet-fixture",
      fullPage: true,
      interactions: ["connected strict synthetic client", "prepared top-up only", "did not click final wallet action"],
      expectedMarkers: [
        "Top up 1 FXRP before payment can be released",
        "exact shortfall is 1 FXRP",
        "Simulation passed",
        "Not confirmed",
      ],
    });
    await addWalletSafety(topUpPage, safety);
    await topUpContext.close();
  } finally {
    await stopServer(server.child);
    await restoreNextEnv(nextEnvBefore);
  }

  records.sort((left, right) => left.id - right.id);
  expect(records).toHaveLength(17);
  expect(records.map((record) => record.id)).toEqual(Array.from({ length: 17 }, (_, index) => index + 1));
  expect(records.map((record) => record.file)).toEqual([...captureNames]);
  expect(records.every((record) => !record.horizontalOverflow)).toBe(true);
  expect(records.every((record) => record.reducedMotion)).toBe(true);
  expect(records.every((record) => record.accessibility.serious === 0 && record.accessibility.critical === 0)).toBe(true);
  expect(responsiveChecks.some((check) => check.width === 320 && !check.horizontalOverflow)).toBe(true);
  expect(responsiveChecks.some((check) => check.width === 390 && !check.horizontalOverflow)).toBe(true);
  expect(safety.walletConnections).toBe(4);
  expect(safety.signatureRequests).toBe(0);
  expect(safety.sendRequests).toBe(0);
  expect(safety.actualSignatures).toBe(0);
  expect(safety.actualSends).toBe(0);
  expect(safety.broadcasts).toBe(0);
  expect(safety.consoleErrors).toBe(0);
  expect(safety.pageErrors).toBe(0);
  expect(await directoryFingerprint(protectedSignalLedgerDirectory)).toBe(protectedSignalLedgerSha256);

  const totalBytes = records.reduce((total, record) => total + record.bytes, 0);
  const manifest = {
    schemaVersion: 1,
    phase: "6B2",
    kind: "escrow-flow-visual-proof",
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
    responsiveChecks,
    protectedArtifacts: { signalLedgerSha256: protectedSignalLedgerSha256, unchanged: true },
    safety,
    captures: records,
    summary: { captureCount: records.length, pngCount: records.length, totalBytes, failures: 0 },
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  expect((await stat(manifestPath)).size).toBeGreaterThan(0);
  expect((await readdir(finalDirectory)).sort()).toEqual([...captureNames, "visual-proof.json"].sort());
});
