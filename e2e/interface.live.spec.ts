import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const artifactDirectory = resolve(process.cwd(), "artifacts", "interface-refinement");
const transactionAction =
  /connect(?: a)? wallet|sign|approve|fund|submit evidence|top[ -]?up|release|refund|cancel|send(?: transaction)?/i;

const expected = {
  title: "Deploy and verify ProofPayEscrow on Coston2",
  client: "0x3c47ddC46848A7a225d3491DA5c211e2E7A51F42",
  freelancer: "0xB9CC4f51Bb837DC56998474961250287f40FA680",
  contract: "0x53bE2D49f4bFCF2cc04A225Ccb7398Fb5E5EAA21",
  scopeHash: "0x3bf5d3c5e4c43cfd1d31f567803150989c95ae290f2b20196d132c9f03148eb9",
  evidenceHash: "0x84670d349f4ccd01e15e8c6028d03bcc65ee56f072361cc03e44be9e7b927ca5",
  evidenceUri:
    "https://coston2-explorer.flare.network/address/0x53bE2D49f4bFCF2cc04A225Ccb7398Fb5E5EAA21",
  completionNote:
    "ProofPayEscrow was deployed, runtime-bytecode matched, constructor dependencies matched, and public explorer evidence was preserved on Coston2.",
  scope: [
    "deploy ProofPayEscrow on Coston2",
    "verify its deployed runtime bytecode",
    "verify constructor dependencies",
    "provide the deployment transaction and public explorer evidence",
  ],
  lifecycle: [
    {
      stage: "AGREED",
      event: "InvoiceCreated",
      hash: "0x0de4d5979553124244b1677af47938d347b15f3fb8f773177b497413c8cff298",
      block: "33779808",
      time: "2026-08-08 12:10:16 UTC",
    },
    {
      stage: "FUNDED",
      event: "InvoiceFunded",
      hash: "0x48e8ffcc165c61c25efd2e91eef8aa550441d69b6e2cf5c8769affd24acd5e83",
      block: "33779848",
      time: "2026-08-08 12:11:59 UTC",
    },
    {
      stage: "DELIVERED",
      event: "EvidenceSubmitted",
      hash: "0x70c477613d2078a34d41e73fabb2e21665809f88403fbd481c5404a116b50fa1",
      block: "33779864",
      time: "2026-08-08 12:12:21 UTC",
    },
    {
      stage: "SETTLED",
      event: "InvoiceReleased",
      hash: "0xe3b7e5c5e965a8151222ef92febd1be5fb8b5913b2080e5faa528e5b94f141ee",
      block: "33779874",
      time: "2026-08-08 12:12:39 UTC",
    },
  ],
} as const;

const stageLabels = {
  AGREED: "Milestone agreed",
  FUNDED: "FXRP funded",
  DELIVERED: "Delivery evidence attached",
  SETTLED: "Payment settled",
} as const;

async function openLiveRoute(page: Page, route: string, documentTestId: string) {
  const response = await page.goto(route, { waitUntil: "domcontentloaded" });

  expect(response, `${route} did not return a document response`).not.toBeNull();
  expect(response?.ok(), `${route} returned HTTP ${response?.status()}`).toBe(true);
  await expect(page.getByTestId(documentTestId)).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator("button").filter({ hasText: transactionAction })).toHaveCount(0);
  await expect(page.locator("form, input, select, textarea")).toHaveCount(0);
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    contentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    viewportWidth: document.documentElement.clientWidth,
  }));

  expect(
    overflow.contentWidth,
    `content width ${overflow.contentWidth}px exceeds the ${overflow.viewportWidth}px viewport`,
  ).toBeLessThanOrEqual(overflow.viewportWidth);
}

async function expectNoAccessibilityViolations(page: Page) {
  const scan = await new AxeBuilder({ page }).analyze();
  expect(scan.violations, JSON.stringify(scan.violations, null, 2)).toEqual([]);
}

async function capture(page: Page, name: string) {
  await mkdir(artifactDirectory, { recursive: true });
  await page.screenshot({
    path: resolve(artifactDirectory, name),
    fullPage: true,
    animations: "disabled",
  });
}

async function expectPinnedRead(page: Page) {
  const pinnedRead = page.getByTestId("pinned-read");
  await expect(pinnedRead).toHaveText(
    /^Pinned read · block [1-9]\d* · \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC$/,
  );
  await expect(pinnedRead.locator("time")).toHaveAttribute(
    "datetime",
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/,
  );
}

async function expectInvoiceOneFacts(page: Page) {
  const document = page.getByTestId("invoice-document");
  await expect(document.getByRole("heading", { level: 1 })).toHaveText(expected.title);
  await expect(page.getByTestId("status-stamp")).toHaveText("SETTLED");
  await expect(document).toContainText("Milestone invoice #1");
  await expect(document).toContainText("Delivery deadline 2026-08-09 11:45:56 UTC");
  await expect(page.getByTestId("invoice-target")).toContainText("$5.00");
  await expect(page.getByTestId("invoice-current-lock")).toContainText("5.299945 FXRP");
  await expect(document).toContainText(expected.client);
  await expect(document).toContainText(expected.freelancer);
  await expect(document).toContainText(expected.scopeHash);
  for (const line of expected.scope) await expect(document).toContainText(line);
  await expect(document).toContainText(expected.completionNote);
  await expect(document).toContainText(expected.evidenceHash);
  await expect(page.getByTestId("invoice-liabilities")).toContainText(/0(?:\.0+)? FXRP/);
  await expect(page.getByTestId("invoice-contract-balance")).toContainText(/0(?:\.0+)? FXRP/);
  await expect(document).toContainText("Payment settled");
  await expect(document).toContainText("View settlement receipt.");
  await expect(document).toContainText(expected.contract);
  await expect(document).toContainText("Flare Testnet Coston2 · chain 114");
  await expectPinnedRead(page);
  await expect(page.getByRole("link", { name: "View settlement receipt" })).toHaveAttribute(
    "href",
    "/receipt/1",
  );

  const rail = page.getByTestId("settlement-rail");
  for (const stage of expected.lifecycle) {
    await expect(rail).toContainText(stageLabels[stage.stage]);
    await expect(rail).toContainText(`${stage.event} · block ${stage.block}`);
  }
}

async function expectReceiptOneFacts(page: Page) {
  const document = page.getByTestId("receipt-document");
  await expect(document.getByRole("heading", { level: 1 })).toHaveText("SETTLEMENT RECEIPT · INVOICE #1");
  await expect(document.locator(".receipt-milestone-title")).toHaveText(expected.title);
  await expect(page.getByTestId("status-stamp")).toHaveText("SETTLED");
  await expect(document).toContainText("SETTLEMENT RECEIPT · INVOICE #1");
  await expect(page.getByTestId("money-target")).toContainText("$5.00");
  await expect(page.getByTestId("money-locked")).toContainText("5.299945 FXRP");
  await expect(page.getByTestId("money-payout")).toContainText("4.818748 FXRP");
  await expect(page.getByTestId("money-refund")).toContainText("0.481197 FXRP");
  await expect(document).toContainText("The client funded the milestone plus a 10% FXRP protection buffer.");
  await expect(document).toContainText("At release, 4.818748 FXRP covered the $5.00 target.");
  await expect(document).toContainText("The unused 0.481197 FXRP returned to the client.");
  await expect(page.getByTestId("price-movement")).toContainText("−0.01%");
  await expect(document).toContainText("$1.037747");
  await expect(document).toContainText("Feed time 2026-08-08 12:11:59 UTC");
  await expect(document).toContainText("$1.037614");
  await expect(document).toContainText("Feed time 2026-08-08 12:12:27 UTC");
  await expect(document).toContainText(expected.completionNote);
  await expect(document).toContainText(expected.evidenceHash);
  await expect(document).toContainText(expected.contract);
  await expect(document).toContainText("Coston2 testnet evidence.");
  await expectPinnedRead(page);
  await expect(page.getByRole("link", { name: "Open the submitted evidence reference" })).toHaveAttribute(
    "href",
    expected.evidenceUri,
  );
  await expect(page.getByTestId("evidence-details")).not.toHaveAttribute("open", "");
  await expect(page.getByTestId("contract-details")).not.toHaveAttribute("open", "");
}

async function expandReceiptEvidence(page: Page) {
  const evidenceDetails = page.getByTestId("evidence-details");
  const evidenceSummary = evidenceDetails.locator(":scope > summary");
  await evidenceSummary.focus();
  await expect(evidenceSummary).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(evidenceDetails).toHaveAttribute("open", "");

  const contractDetails = page.getByTestId("contract-details");
  const contractSummary = contractDetails.locator(":scope > summary");
  await contractSummary.focus();
  await expect(contractSummary).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(contractDetails).toHaveAttribute("open", "");
}

async function expectExpandedReceiptFacts(page: Page) {
  const evidenceDetails = page.getByTestId("evidence-details");
  const lifecycleRows = evidenceDetails.locator(".proof-row");
  await expect(lifecycleRows).toHaveCount(4);

  for (const entry of expected.lifecycle) {
    const row = lifecycleRows.filter({ hasText: stageLabels[entry.stage] });
    await expect(row).toContainText(entry.event);
    await expect(row).toContainText(entry.hash);
    await expect(row).toContainText(`Block ${entry.block} · ${entry.time}`);
    await expect(
      row.getByRole("link", { name: `Open the ${entry.stage.toLowerCase()} transaction on the Coston2 explorer` }),
    ).toHaveAttribute("href", `https://coston2-explorer.flare.network/tx/${entry.hash}`);
  }

  const contractDetails = page.getByTestId("contract-details");
  await expect(contractDetails).toContainText(expected.scopeHash);
  await expect(contractDetails).toContainText(expected.evidenceHash);
  await expect(contractDetails).toContainText("Current active liabilities");
  await expect(contractDetails).toContainText("Current contract balance");
  await expect(contractDetails.getByText(/0(?:\.0+)? FXRP/)).toHaveCount(2);
}

test.describe.configure({ mode: "serial" });

test("the landing page decodes invoice 2 without substituting illustrative values", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openLiveRoute(page, "/", "landing-live-proof");

  const proof = page.getByTestId("landing-live-proof");
  await expect(proof).toContainText("Invoice #2 · Verify ProofPay wallet actions on Coston2");
  await expect(proof).toContainText("$2.00");
  await expect(proof).toContainText("2.126887 FXRP");
  await expect(proof).toContainText("1.933309 FXRP");
  await expect(proof).toContainText("0.193578 FXRP");
  await expect(proof.locator(".confirmed-state")).toHaveText("SETTLED");

  const identifiers = proof.locator(".live-proof-identifier");
  await expect(identifiers).toHaveCount(4);
  for (const [label, value] of [
    ["ProofPayEscrow contract", "0x53bE2D49f4bFCF2cc04A225Ccb7398Fb5E5EAA21"],
    ["Funding transaction", "0x60aa661a4c755b807a1911cce513603f103912226570ab9d9fafaf272eb3d857"],
    ["Evidence commitment", "0xb98859ff3db3f2bb2f06bb2e8ef96f60bfa47432080fde6159476e2547ecacda"],
    ["Release transaction", "0x6e1b8c009e9021aa05d5aeabaf1e7effcbf0b15402ef7a4b153bfcf26a82d921"],
  ] as const) {
    const row = identifiers.filter({ hasText: label });
    await expect(row.locator("code").first()).toHaveAttribute("aria-label", `${label}: ${value}`);
    await expect(row.getByRole("button", { name: "Copy" })).toBeVisible();
    await expect(row.getByText("Reveal full value", { exact: true })).toBeVisible();
  }
  await expect(proof.getByRole("link", { name: /Coston2 explorer/iu })).toHaveCount(3);
  await expectNoAccessibilityViolations(page);
});

test("one live invoice read proves desktop and mobile evidence", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openLiveRoute(page, "/invoice/1", "invoice-document");
  await expectInvoiceOneFacts(page);
  await expectNoAccessibilityViolations(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await expectInvoiceOneFacts(page);
  await expectNoHorizontalOverflow(page);
  await expectNoAccessibilityViolations(page);
});

test("one live receipt reconciliation proves desktop, mobile, and expanded evidence", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openLiveRoute(page, "/receipt/1", "receipt-document");
  await expectReceiptOneFacts(page);
  await expectNoAccessibilityViolations(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await expectReceiptOneFacts(page);
  await expectNoHorizontalOverflow(page);
  await expectNoAccessibilityViolations(page);

  await expandReceiptEvidence(page);
  await expectExpandedReceiptFacts(page);
  await expectNoHorizontalOverflow(page);
  await expectNoAccessibilityViolations(page);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await expectExpandedReceiptFacts(page);
  await expectNoHorizontalOverflow(page);
  await expectNoAccessibilityViolations(page);
});

test("invoice 2 proves the refined settlement record and required screenshots", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openLiveRoute(page, "/invoice/2", "invoice-document");
  const invoice = page.getByTestId("invoice-document");
  await expect(invoice.locator(".document-label")).toHaveText("MILESTONE RECORD");
  await expect(page.getByTestId("status-stamp")).toHaveText("SETTLED");
  await expect(invoice.getByRole("heading", { level: 1 })).toHaveText("Verify ProofPay wallet actions on Coston2");
  await expect(page.getByTestId("invoice-target")).toContainText("$2.00");
  await expect(page.getByTestId("invoice-current-lock")).toContainText("2.126887 FXRP");
  await expect(page.getByTestId("invoice-current-lock")).toContainText("FXRP locked");
  await expect(invoice).toContainText("The freelancer was paid and the unused FXRP returned to the client.");
  await expect(page.getByTestId("terminal-payout")).toContainText("1.933309 FXRP");
  await expect(page.getByTestId("terminal-refund")).toContainText("0.193578 FXRP");
  await expect(page.getByTestId("price-movement")).toHaveCount(0);
  await expect(page.getByTestId("invoice-contract-state")).toContainText("RELEASED");
  const rail = page.getByTestId("settlement-rail");
  for (const [label, event, block] of [
    ["Milestone agreed", "InvoiceCreated", "33804596"],
    ["FXRP funded", "InvoiceFunded", "33804808"],
    ["Delivery evidence attached", "EvidenceSubmitted", "33804822"],
    ["Payment settled", "InvoiceReleased", "33804839"],
  ] as const) {
    await expect(rail).toContainText(label);
    await expect(rail).toContainText(`${event} · block ${block}`);
  }
  await expect(invoice.locator(".identifier-short").first()).toHaveText(/^0x[0-9a-f]{4}…[0-9a-f]{5}$/iu);
  await expectNoAccessibilityViolations(page);
  await capture(page, "01-invoice-desktop.png");

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".mobile-lifecycle-summary")).toContainText("Agreed");
  await expect(page.locator(".mobile-lifecycle-summary")).toContainText("Funded");
  await expect(page.locator(".mobile-lifecycle-summary")).toContainText("Delivered");
  await expect(page.locator(".mobile-lifecycle-summary")).toContainText("Settled");
  await expectNoHorizontalOverflow(page);
  await expectNoAccessibilityViolations(page);
  await capture(page, "02-invoice-mobile.png");

  await page.setViewportSize({ width: 1440, height: 1000 });
  await openLiveRoute(page, "/receipt/2", "receipt-document");
  const receipt = page.getByTestId("receipt-document");
  await expect(receipt.locator(".document-label")).toHaveText("SETTLEMENT RECEIPT");
  await expect(receipt.getByRole("heading", { level: 1 })).toHaveText("SETTLEMENT RECEIPT · INVOICE #2");
  await expect(page.getByTestId("money-locked")).toContainText("2.126887 FXRP");
  await expect(page.getByTestId("money-payout")).toContainText("1.933309 FXRP");
  await expect(page.getByTestId("money-refund")).toContainText("0.193578 FXRP");
  await expect(page.getByTestId("price-movement")).toContainText("+0.01%");
  await expectNoAccessibilityViolations(page);
  await capture(page, "03-receipt-desktop.png");

  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalOverflow(page);
  await expectNoAccessibilityViolations(page);
  await capture(page, "04-receipt-mobile.png");

  await expandReceiptEvidence(page);
  await expect(receipt).toContainText("InvoiceCreated");
  await expect(receipt).toContainText("InvoiceReleased");
  await expect(receipt).toContainText("Contract state");
  await expect(receipt).toContainText("RELEASED");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expectNoHorizontalOverflow(page);
  await expectNoAccessibilityViolations(page);
  await capture(page, "05-expanded-evidence.png");
});
