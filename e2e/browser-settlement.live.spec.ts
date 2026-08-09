import { mkdir, writeFile } from "node:fs/promises";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { parseEventLogs, type Hash, type TransactionReceipt } from "viem";

import {
  CHAIN_ID,
  CLIENT,
  CONTRACT,
  EVIDENCE_PATH,
  EXPLORER_URL,
  FREELANCER,
  LiveBrowserWalletBridge,
  RECEIPT_PATH,
  SCREENSHOT_DIRECTORY,
  SCOPE_PATH,
  WALLET_ACTIONS_COMMIT,
  hashCanonical,
  preflight,
  proofPayAbi,
  publicClient,
  readSnapshot,
  transactionHash,
  verifyNoSecretLeak,
  type BrowserJournal,
} from "./browser-settlement-support";

const TITLE = "Verify ProofPay wallet actions on Coston2";
const SCOPE = [
  "create an invoice through the ProofPay browser interface",
  "fund it with test FXRP",
  "submit deterministic evidence",
  "release payment through the browser interface",
  "display a verified public receipt",
] as const;
const COMPLETION_NOTE = "ProofPay wallet actions completed through the browser interface and independently reconciled on Coston2.";

function hashFrom(text: string): Hash {
  const matches = text.match(/0x[0-9a-f]{64}/giu);
  const value = matches?.[0];
  if (!value) throw new Error("A 32-byte hash was not displayed by the interface.");
  return value.toLowerCase() as Hash;
}

function datetimeInput(unixSeconds: bigint): string {
  return new Date(Number(unixSeconds) * 1_000).toISOString().slice(0, 16);
}

async function ensureConnected(page: Page): Promise<void> {
  const button = page.getByRole("button", { name: "Connect wallet" });
  if (await button.isVisible().catch(() => false)) await button.click();
  await expect(page.getByTestId(/wallet-state-(client|freelancer|connected)/u)).toBeVisible();
}

async function visibleIntent(page: Page): Promise<{ locator: Locator; text: string }> {
  const locator = page.getByTestId("transaction-intent");
  await expect(locator).toBeVisible();
  await expect(page.getByTestId("transaction-state")).toContainText("Simulation passed");
  const text = await locator.innerText();
  expect(text).toContain("Review the exact intent");
  expect(text.toLowerCase()).toContain("not confirmed");
  return { locator, text };
}

async function executePrepared(
  page: Page,
  bridge: LiveBrowserWalletBridge,
  action: Parameters<LiveBrowserWalletBridge["plan"]>[0],
  route: string,
): Promise<TransactionReceipt> {
  const prepared = await visibleIntent(page);
  await bridge.plan(action, route, prepared.text);
  bridge.journal.friction.walletPrompts += 1;
  if (action === "approveFunding" || action === "approveTopUp") bridge.journal.friction.approvalPrompts += 1;
  const start = Date.now();
  const sign = prepared.locator.locator("button.transaction-button");
  await expect(sign).toHaveCount(1);
  await sign.click();
  await expect(page.getByTestId("transaction-state")).toContainText("Transaction confirmed", { timeout: 180_000 });
  const browserResult = await page.getByTestId("transaction-state").innerText();
  const receipt = await bridge.complete(action, browserResult);
  bridge.journal.friction.actionStateDelaysMs.push(Date.now() - start);
  return receipt;
}

async function expectStatus(page: Page, status: "CREATED" | "FUNDED" | "SUBMITTED" | "RELEASED"): Promise<void> {
  await expect(page.getByTestId("status-stamp")).toHaveText(status === "RELEASED" ? "SETTLED" : status, { timeout: 90_000 });
}

async function screenshot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${SCREENSHOT_DIRECTORY}/${name}`, fullPage: true });
}

async function assertNoOverflow(page: Page): Promise<void> {
  const width = await page.evaluate(() => ({
    content: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    viewport: document.documentElement.clientWidth,
  }));
  expect(width.content).toBeLessThanOrEqual(width.viewport);
}

async function restoreBrowserJournal(page: Page, journal: BrowserJournal): Promise<void> {
  const actionMap = {
    create: "create",
    approveFunding: "approve",
    fund: "fund",
    evidence: "submit_evidence",
    approveTopUp: "approve",
    topUp: "top_up",
    release: "release",
  } as const;
  const durableEntries = [
    ...journal.approvalHistory.map((entry) => [entry.action, entry] as const),
    ...Object.entries(journal.transactions),
  ];
  const entries = durableEntries.flatMap(([key, entry]) => {
    if (!entry?.transactionHash || entry.status !== "COMPLETE" || !journal.invoiceId) return [];
    return [{
      chainId: CHAIN_ID,
      contract: CONTRACT,
      account: entry.activeAccount,
      invoiceId: journal.invoiceId,
      action: actionMap[key as keyof typeof actionMap],
      intentHash: hashFrom(entry.browserVisibleIntent),
      quoteDeadline: null,
      transactionHash: entry.transactionHash,
      status: "confirmed",
      updatedAt: entry.intendedAt,
    }];
  });
  await page.evaluate((restored) => {
    window.localStorage.setItem("proofpay.transaction-journal.v1", JSON.stringify({
      schemaVersion: 1,
      entries: restored,
    }));
  }, entries);
  await page.reload({ waitUntil: "networkidle" });
}

function eventArgs(receipt: TransactionReceipt, eventName: "InvoiceFunded"): {
  invoiceId: bigint; fxrpLocked: bigint; price: bigint; priceDecimals: number; priceTimestamp: bigint;
};
function eventArgs(receipt: TransactionReceipt, eventName: "EvidenceSubmitted"): {
  invoiceId: bigint; evidenceHash: Hash; evidenceURI: string;
};
function eventArgs(receipt: TransactionReceipt, eventName: "InvoiceToppedUp"): {
  invoiceId: bigint; amount: bigint; newFxrpLocked: bigint; price: bigint; priceDecimals: number; priceTimestamp: bigint;
};
function eventArgs(receipt: TransactionReceipt, eventName: "InvoiceReleased"): {
  invoiceId: bigint; freelancerPayout: bigint; clientRefund: bigint; price: bigint; priceDecimals: number; priceTimestamp: bigint;
};
function eventArgs(receipt: TransactionReceipt, eventName: "InvoiceFunded" | "EvidenceSubmitted" | "InvoiceToppedUp" | "InvoiceReleased") {
  const events = parseEventLogs({ abi: proofPayAbi, logs: receipt.logs, eventName, strict: true });
  const event = events[0];
  if (!event) throw new Error(`${eventName} was not found.`);
  return event.args as Record<string, unknown>;
}

async function writeSettlementReceipt(journal: BrowserJournal): Promise<void> {
  const invoiceId = BigInt(journal.invoiceId ?? "0");
  const [createReceipt, fundReceipt, evidenceReceipt, releaseReceipt] = await Promise.all([
    publicClient.getTransactionReceipt({ hash: transactionHash(journal, "create") }),
    publicClient.getTransactionReceipt({ hash: transactionHash(journal, "fund") }),
    publicClient.getTransactionReceipt({ hash: transactionHash(journal, "evidence") }),
    publicClient.getTransactionReceipt({ hash: transactionHash(journal, "release") }),
  ]);
  const funded = eventArgs(fundReceipt, "InvoiceFunded");
  const evidence = eventArgs(evidenceReceipt, "EvidenceSubmitted");
  const released = eventArgs(releaseReceipt, "InvoiceReleased");
  const finalSnapshot = await readSnapshot(invoiceId);
  const receipt = {
    schemaVersion: 1,
    phase: "5B2",
    network: { name: "Flare Testnet Coston2", chainId: CHAIN_ID, testnet: true },
    invoice: {
      invoiceId: invoiceId.toString(),
      milestoneTitle: TITLE,
      usdTargetAtomic: finalSnapshot.invoice?.usdTargetAtomic,
      freelancer: FREELANCER,
      client: CLIENT,
      creationBlockNumber: createReceipt.blockNumber.toString(),
      deliveryDeadline: finalSnapshot.invoice?.deliveryDeadline,
      scopeHash: finalSnapshot.invoice?.scopeHash,
      evidenceHash: finalSnapshot.invoice?.evidenceHash,
      evidenceUri: evidence.evidenceURI,
    },
    settlement: {
      fundingPrice: funded.price.toString(),
      fundingPriceDecimals: Number(funded.priceDecimals),
      fundingPriceTimestamp: funded.priceTimestamp.toString(),
      releasePrice: released.price.toString(),
      releasePriceDecimals: Number(released.priceDecimals),
      releasePriceTimestamp: released.priceTimestamp.toString(),
      fxrpLockedAtomic: funded.fxrpLocked.toString(),
      fxrpPaidAtomic: released.freelancerPayout.toString(),
      fxrpRefundedAtomic: released.clientRefund.toString(),
      topUpAtomic: journal.transactions.topUp
        ? eventArgs(await publicClient.getTransactionReceipt({ hash: transactionHash(journal, "topUp") }), "InvoiceToppedUp").amount.toString()
        : "0",
      payoutPlusRefundEqualsPriorLock: released.freelancerPayout + released.clientRefund === funded.fxrpLocked,
    },
    contract: { address: CONTRACT },
    transactions: {
      create: transactionHash(journal, "create"),
      approval: journal.transactions.approveFunding?.transactionHash ?? null,
      approvalHistory: journal.approvalHistory.map((entry) => entry.transactionHash),
      funding: transactionHash(journal, "fund"),
      evidence: transactionHash(journal, "evidence"),
      topUpApproval: journal.transactions.approveTopUp?.transactionHash ?? null,
      topUp: journal.transactions.topUp?.transactionHash ?? null,
      release: transactionHash(journal, "release"),
    },
    balances: {
      initial: journal.preflight.initialSnapshot,
      final: finalSnapshot,
    },
    final: {
      invoiceState: finalSnapshot.invoice?.statusName,
      activeFxrpLiabilitiesAtomic: finalSnapshot.activeFxrpLiabilitiesAtomic,
      contractFxrpBalanceAtomic: finalSnapshot.contractFxrpAtomic,
    },
    manifests: {
      scope: { path: journal.scopeManifest?.path, keccak256: journal.scopeManifest?.keccak256 },
      evidence: {
        path: journal.evidenceManifest?.path,
        keccak256: journal.evidenceManifest?.keccak256,
        evidenceUri: journal.evidenceManifest?.evidenceUri,
      },
    },
    executionGitCommit: WALLET_ACTIONS_COMMIT,
  };
  await writeFile(RECEIPT_PATH, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
}

test("settles one new Coston2 invoice through the injected browser wallet path", async ({ page }) => {
  await mkdir(SCREENSHOT_DIRECTORY, { recursive: true });
  const { journal, wallets } = await preflight();
  const completedAtStart = journal.completionStatus === "PASS";
  const broadcastsAtStart = [
    ...journal.approvalHistory,
    ...Object.values(journal.transactions).filter((entry) => entry !== null),
  ].reduce((sum, entry) => sum + entry.broadcastCount, 0);
  expect(journal.preflight.nextInvoiceId).toBe((journal.preflight.invoiceCount + 1).toString());
  expect(journal.preflight.liabilitiesAtomic).toBe("0");
  expect(journal.preflight.ftsoFeeWei).toBe("0");
  const bridge = new LiveBrowserWalletBridge(journal, wallets);
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  await bridge.install(page);

  if (!journal.transactions.create) {
    await bridge.setAccount(page, FREELANCER);
    await page.goto("/app", { waitUntil: "networkidle" });
    await ensureConnected(page);
    const latest = await publicClient.getBlock({ blockTag: "latest" });
    const requestedDeadline = latest.timestamp + 86_520n;
    await page.getByLabel("Milestone title").fill(TITLE);
    await page.getByLabel("Client wallet").fill(CLIENT);
    await page.getByLabel("USD target").fill("2.00");
    await page.getByLabel("Delivery deadline").fill(datetimeInput(requestedDeadline));
    await page.getByLabel("Scope · one deliverable per line").fill(SCOPE.join("\n"));
    await page.getByRole("button", { name: "Simulate invoice creation" }).click();
    const canonicalScope = await page.locator("pre.canonical-manifest").textContent();
    if (!canonicalScope) throw new Error("The canonical scope manifest is empty.");
    const scopeHash = hashFrom(await page.getByText(/keccak256:/u).innerText());
    const scope = JSON.parse(canonicalScope) as { usdTargetAtomic: string; scope: string[]; milestoneTitle: string };
    expect(scope).toMatchObject({ usdTargetAtomic: "2000000", scope: [...SCOPE], milestoneTitle: TITLE });
    await bridge.persistScope(canonicalScope, scopeHash);
    await screenshot(page, "01-invoice-creation.png");
    const receipt = await executePrepared(page, bridge, "create", "/app");
    const invoiceId = await bridge.assignCreatedInvoice(receipt);
    expect(invoiceId.toString()).toBe(journal.preflight.nextInvoiceId);
  }

  const invoiceId = journal.invoiceId;
  if (!invoiceId) throw new Error("The confirmed browser creation did not yield an invoice ID.");
  const invoiceRoute = `/invoice/${invoiceId}`;

  if (!journal.transactions.fund) {
    await bridge.setAccount(page, CLIENT);
    await page.goto(invoiceRoute, { waitUntil: "networkidle" });
    await restoreBrowserJournal(page, journal);
    await ensureConnected(page);
    await expect(page.getByTestId("wallet-state-client")).toBeVisible();
    await expect(page.getByRole("button", { name: /submit|cancel/iu })).toHaveCount(0);
    await page.getByRole("button", { name: "Preview and simulate funding" }).click();
    journal.friction.quoteRefreshes += 1;
    let prepared = await visibleIntent(page);
    await expect(page.getByTestId("funding-preview")).toContainText("Preview quote");
    await expect(page.getByTestId("funding-preview")).toContainText("10% funding protection");
    await expect(page.getByTestId("funding-preview")).toContainText("2% transaction maximum");
    await screenshot(page, "02-client-funding-intent.png");
    if (prepared.text.includes("Approve up to")) {
      expect(prepared.text).toContain("FXRP");
      expect(prepared.text).toContain(CONTRACT);
      await executePrepared(page, bridge, "approveFunding", invoiceRoute);
      await page.getByRole("button", { name: "Continue with saved funding intent" }).click();
      prepared = await visibleIntent(page);
    }
    expect(prepared.text).toContain("Fund this");
    await executePrepared(page, bridge, "fund", invoiceRoute);
    await page.reload({ waitUntil: "networkidle" });
    await ensureConnected(page);
    await expectStatus(page, "FUNDED");
    const sendCount = Object.values(journal.transactions).reduce((sum, entry) => sum + (entry?.broadcastCount ?? 0), 0);
    await page.evaluate(() => {
      const key = "proofpay.transaction-journal.v1";
      const raw = window.localStorage.getItem(key);
      if (!raw) throw new Error("Browser journal is unavailable for replay proof.");
      const parsed = JSON.parse(raw) as { entries: Array<{ action: string; status: string }> };
      const fund = parsed.entries.find((entry) => entry.action === "fund");
      if (!fund) throw new Error("Funding entry is unavailable for replay proof.");
      fund.status = "submitted";
      window.localStorage.setItem(key, JSON.stringify(parsed));
    });
    await page.reload({ waitUntil: "networkidle" });
    await ensureConnected(page);
    await expect(page.getByTestId("transaction-journal")).toContainText("confirmed");
    expect(Object.values(journal.transactions).reduce((sum, entry) => sum + (entry?.broadcastCount ?? 0), 0)).toBe(sendCount);
    journal.friction.reloadRecoveries += 1;
    const fundedSnapshot = await readSnapshot(BigInt(invoiceId));
    expect(fundedSnapshot.invoice?.statusName).toBe("FUNDED");
    expect(fundedSnapshot.contractFxrpAtomic).toBe(fundedSnapshot.invoice?.fxrpLockedAtomic);
    expect(fundedSnapshot.activeFxrpLiabilitiesAtomic).toBe(fundedSnapshot.invoice?.fxrpLockedAtomic);
    await screenshot(page, "03-confirmed-funded-invoice.png");
    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""))).toEqual([]);
  }

  if (!journal.transactions.evidence) {
    await bridge.setAccount(page, FREELANCER);
    await page.goto(invoiceRoute, { waitUntil: "networkidle" });
    await restoreBrowserJournal(page, journal);
    await ensureConnected(page);
    await expect(page.getByTestId("wallet-state-freelancer")).toBeVisible();
    const fundingUrl = `${EXPLORER_URL}/tx/${transactionHash(journal, "fund")}`;
    await page.getByLabel("Public delivery URLs · one per line").fill(fundingUrl);
    await page.getByLabel("Wallet-actions commit · optional").fill(WALLET_ACTIONS_COMMIT);
    await page.getByLabel("Completion note").fill(COMPLETION_NOTE);
    await page.getByRole("button", { name: "Hash and simulate evidence submission" }).click();
    const manifestBox = page.getByTestId("evidence-manifest");
    await expect(manifestBox).toContainText("not delivery truth or quality");
    await expect(manifestBox).toContainText(COMPLETION_NOTE);
    const canonicalEvidence = await manifestBox.locator("pre").innerText();
    const evidenceHash = hashFrom(await manifestBox.innerText());
    const evidenceManifest = JSON.parse(canonicalEvidence) as Record<string, unknown>;
    expect(evidenceManifest).toMatchObject({
      schemaVersion: 1,
      milestoneTitle: TITLE,
      createTransaction: transactionHash(journal, "create"),
      approvalTransaction: journal.transactions.approveFunding?.transactionHash ?? null,
      fundingTransaction: transactionHash(journal, "fund"),
      walletActionsCommit: WALLET_ACTIONS_COMMIT,
      completionNote: COMPLETION_NOTE,
      deliveryUrls: [fundingUrl],
    });
    expect(hashCanonical(canonicalEvidence)).toBe(evidenceHash);
    await bridge.persistEvidence(canonicalEvidence, evidenceHash, fundingUrl);
    await screenshot(page, "04-evidence-manifest.png");
    const lockedBefore = (await readSnapshot(BigInt(invoiceId))).invoice?.fxrpLockedAtomic;
    const receipt = await executePrepared(page, bridge, "evidence", invoiceRoute);
    const submitted = eventArgs(receipt, "EvidenceSubmitted");
    expect(submitted.evidenceHash).toBe(evidenceHash);
    expect(submitted.evidenceURI).toBe(fundingUrl);
    await page.reload({ waitUntil: "networkidle" });
    await ensureConnected(page);
    await expectStatus(page, "SUBMITTED");
    const after = await readSnapshot(BigInt(invoiceId));
    expect(after.invoice?.fxrpLockedAtomic).toBe(lockedBefore);
    expect(after.activeFxrpLiabilitiesAtomic).toBe(lockedBefore);
    await screenshot(page, "05-submitted-invoice.png");
  }

  if (!journal.transactions.release) {
    await bridge.setAccount(page, CLIENT);
    await page.goto(invoiceRoute, { waitUntil: "networkidle" });
    await restoreBrowserJournal(page, journal);
    await ensureConnected(page);
    await page.getByRole("button", { name: "Refresh and simulate settlement" }).click();
    journal.friction.quoteRefreshes += 1;
    const quote = page.getByTestId("settlement-preview");
    await expect(quote).toContainText("Current XRP / USD price");
    await expect(quote).toContainText("Required freelancer payout");
    await expect(quote).toContainText("Client refund");
    await expect(quote).toContainText("Exact top-up");
    let prepared = await visibleIntent(page);
    await screenshot(page, "06-release-intent.png");
    if (prepared.text.includes("Approve up to")) {
      await executePrepared(page, bridge, "approveTopUp", invoiceRoute);
      await page.getByRole("button", { name: "Refresh and simulate settlement" }).click();
      journal.friction.quoteRefreshes += 1;
      await expect(page.getByTestId("transaction-intent")).not.toContainText("Approve up to");
      prepared = await visibleIntent(page);
    }
    if (prepared.text.includes("Top up")) {
      await executePrepared(page, bridge, "topUp", invoiceRoute);
      await page.reload({ waitUntil: "networkidle" });
      await ensureConnected(page);
      await page.getByRole("button", { name: "Refresh and simulate settlement" }).click();
      journal.friction.quoteRefreshes += 1;
      prepared = await visibleIntent(page);
    }
    expect(prepared.text).toContain("Release");
    const lockedBeforeRelease = BigInt((await readSnapshot(BigInt(invoiceId))).invoice?.fxrpLockedAtomic ?? "0");
    const clientBefore = BigInt((await readSnapshot(BigInt(invoiceId))).clientFxrpAtomic);
    const freelancerBefore = BigInt((await readSnapshot(BigInt(invoiceId))).freelancerFxrpAtomic);
    const receipt = await executePrepared(page, bridge, "release", invoiceRoute);
    const released = eventArgs(receipt, "InvoiceReleased");
    expect(released.freelancerPayout + released.clientRefund).toBe(lockedBeforeRelease);
    await page.reload({ waitUntil: "networkidle" });
    await expectStatus(page, "RELEASED");
    const final = await readSnapshot(BigInt(invoiceId));
    expect(final.invoice?.statusName).toBe("RELEASED");
    expect(final.activeFxrpLiabilitiesAtomic).toBe("0");
    expect(final.contractFxrpAtomic).toBe("0");
    expect(BigInt(final.freelancerFxrpAtomic) - freelancerBefore).toBe(released.freelancerPayout);
    expect(BigInt(final.clientFxrpAtomic) - clientBefore).toBe(released.clientRefund);
    await expect(page.getByTestId("wallet-actions-terminal")).toBeVisible();
    await screenshot(page, "07-released-invoice.png");
  }

  await writeSettlementReceipt(journal);
  await page.goto(`/receipt/${invoiceId}`, { waitUntil: "networkidle" });
  const receiptDocument = page.getByTestId("receipt-document");
  await expect(receiptDocument).toBeVisible();
  await expect(page.getByTestId("money-target")).toContainText("$2.00");
  await expect(page.getByTestId("money-locked")).toContainText("FXRP");
  await expect(page.getByTestId("money-payout")).toContainText("FXRP");
  await expect(page.getByTestId("money-refund")).toContainText("FXRP");
  await page.getByTestId("evidence-details").getByText("Reveal lifecycle transactions").click();
  for (const hash of [
    transactionHash(journal, "create"), transactionHash(journal, "fund"),
    transactionHash(journal, "evidence"), transactionHash(journal, "release"),
  ]) await expect(receiptDocument).toContainText(hash);
  await page.getByTestId("contract-details").getByText("Reveal commitments and contract state").click();
  await expect(page.getByTestId("contract-details")).toContainText("0 FXRP");
  await screenshot(page, "08-final-public-receipt.png");
  const receiptAxe = await new AxeBuilder({ page }).analyze();
  expect(receiptAxe.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""))).toEqual([]);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(invoiceRoute, { waitUntil: "networkidle" });
  await expectStatus(page, "RELEASED");
  await assertNoOverflow(page);
  await screenshot(page, "09-mobile-released-invoice.png");
  await page.goto(`/receipt/${invoiceId}`, { waitUntil: "networkidle" });
  await expect(page.getByTestId("receipt-document")).toBeVisible();
  await assertNoOverflow(page);
  await screenshot(page, "10-mobile-receipt.png");

  const creationTimestamp = BigInt(journal.transactions.create?.after?.blockTimestamp ?? "0");
  const deliveryDeadline = BigInt(journal.transactions.create?.after?.invoice?.deliveryDeadline ?? "0");
  const deliveryWindow = deliveryDeadline - creationTimestamp;
  journal.friction.observedIssues = [
    ...(journal.approvalHistory.length > 0
      ? [`The moving live quote required ${journal.approvalHistory.length + 1} exact approval prompts before funding remained within the 2% maximum.`]
      : []),
    ...(deliveryWindow !== 86_400n
      ? [`The datetime-local field produced a ${deliveryWindow}-second confirmed delivery window rather than exactly 86400 seconds.`]
      : []),
    ...(browserErrors.some((message) => message.includes("Hydration failed"))
      ? ["Restored injected-wallet state produced a React hydration-mismatch development warning before client rendering recovered."]
      : []),
  ];

  await bridge.finish();
  if (completedAtStart) {
    const broadcastsAfterReplay = [
      ...journal.approvalHistory,
      ...Object.values(journal.transactions).filter((entry) => entry !== null),
    ].reduce((sum, entry) => sum + entry.broadcastCount, 0);
    expect(broadcastsAfterReplay).toBe(broadcastsAtStart);
  }
  await verifyNoSecretLeak([
    SCOPE_PATH,
    EVIDENCE_PATH,
    RECEIPT_PATH,
    ...Array.from({ length: 10 }, (_, index) => `${SCREENSHOT_DIRECTORY}/${String(index + 1).padStart(2, "0")}-${[
      "invoice-creation", "client-funding-intent", "confirmed-funded-invoice", "evidence-manifest", "submitted-invoice",
      "release-intent", "released-invoice", "final-public-receipt", "mobile-released-invoice", "mobile-receipt",
    ][index]}.png`),
  ]);
});
