import { expect, test, type Page } from "@playwright/test";

import { PROOFPAY_PUBLIC_DESCRIPTION, PROOFPAY_PUBLIC_TITLE } from "../lib/site-metadata";

const transactionAction =
  /connect(?: a)? wallet|sign|approve|fund|submit evidence|top[ -]?up|release|refund|cancel|send(?: transaction)?/i;

async function openRoute(page: Page, route: string) {
  const response = await page.goto(route, { waitUntil: "networkidle" });

  expect(response, `${route} did not return a document response`).not.toBeNull();
  expect(response?.ok(), `${route} returned HTTP ${response?.status()}`).toBe(true);
}

async function expectReadOnlyDocument(page: Page) {
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator("button").filter({ hasText: transactionAction })).toHaveCount(0);
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

test.describe.configure({ mode: "serial" });

test("root intentionally redirects to the deployment-safe application entry", async ({ page }) => {
  const response = await page.goto("/", { waitUntil: "networkidle" });

  expect(response?.ok()).toBe(true);
  await expect(page).toHaveURL(/\/app$/u);
  await expect(page).toHaveTitle(PROOFPAY_PUBLIC_TITLE);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", PROOFPAY_PUBLIC_DESCRIPTION);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/app$/u);
  await expect(page.getByTestId("public-trust-notice")).toHaveText(
    "ProofPay by PaysmatCoston2 testnet · Test assets only · Not audited · Not legal or fiat escrow",
  );
});

test("fixture invoice 1 renders the released acceptance values without producing live evidence", async ({ page }) => {
  await openRoute(page, "/invoice/1");

  await expect(page.getByTestId("invoice-document")).toBeVisible();
  await expect(page.getByTestId("status-stamp")).toContainText("SETTLED");
  await expect(page.getByTestId("invoice-target")).toContainText("$5.00");
  await expect(page.getByTestId("invoice-current-lock")).toContainText("5.299945 FXRP");
  await expect(page.getByRole("link", { name: "View settlement receipt" })).toBeVisible();
  await expectReadOnlyDocument(page);
});

test("fixture receipt 1 renders the settlement acceptance values without producing live evidence", async ({ page }) => {
  await openRoute(page, "/receipt/1");

  await expect(page.getByTestId("receipt-document")).toBeVisible();
  await expect(page.getByTestId("status-stamp")).toContainText("SETTLED");
  await expect(page.getByTestId("money-target")).toContainText("$5.00");
  await expect(page.getByTestId("money-locked")).toContainText("5.299945 FXRP");
  await expect(page.getByTestId("money-payout")).toContainText("4.818748 FXRP");
  await expect(page.getByTestId("money-refund")).toContainText("0.481197 FXRP");
  await expectReadOnlyDocument(page);
});

test("fixture-only top-up sample is labelled and never presented as a confirmed payment", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openRoute(page, "/invoice/2");

  const preview = page.getByTestId("release-preview");
  await expect(page.getByTestId("status-stamp")).toContainText("SUBMITTED");
  await expect(page.getByRole("heading", { name: "Top-up required", exact: true })).toBeVisible();
  await expect(page.getByTestId("sample-scenario-label")).toHaveText(
    "Sample scenario — Top-up required · fixture only",
  );
  await expect(page.locator(".network-label")).toHaveText("Fixture-only sample · not live Coston2 evidence");
  await expect(page.locator(".sample-footer")).toContainText("not live Coston2 evidence");
  await expect(preview).toContainText("Preview quote");
  await expect(preview).toContainText("Not confirmed");
  await expect(preview).toContainText("No payment has been released.");
  await expect(page.getByTestId("preview-payout")).toContainText(/0(?:\.0+)? FXRP/);
  await expect(page.getByTestId("preview-refund")).toContainText(/0(?:\.0+)? FXRP/);
  await expect(page.getByTestId("preview-top-up")).toContainText(/[1-9]/);
  await expect(page.getByTestId("settlement-rail")).toContainText(
    "Illustrative stages for this fixture-only scenario. Nothing here is confirmed onchain.",
  );
  await expect(page.getByText("Scope commitment", { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("invoice-document")).not.toContainText("Pinned read");
  await expect(page.getByRole("link", { name: "Open the ProofPay contract on the Coston2 explorer" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "View settlement receipt" })).toHaveCount(0);
  await expectReadOnlyDocument(page);
  await expectNoHorizontalOverflow(page);
});
