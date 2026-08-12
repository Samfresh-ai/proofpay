import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

import { PROOFPAY_PUBLIC_DESCRIPTION } from "../lib/site-metadata";

const transactionAction =
  /connect(?: a)? wallet|sign|approve|fund|submit evidence|top[ -]?up|release|refund|cancel|send(?: transaction)?/i;

async function openRoute(page: Page, route: string) {
  const response = await page.goto(route, { waitUntil: "networkidle" });
  expect(response, `${route} did not return a document response`).not.toBeNull();
  expect(response?.ok(), `${route} returned HTTP ${response?.status()}`).toBe(true);
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
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
  expect(
    dimensions.contentWidth,
    `content width ${dimensions.contentWidth}px exceeds the ${dimensions.viewportWidth}px viewport at ${page.url()}; offenders ${JSON.stringify(dimensions.offenders)}`,
  ).toBeLessThanOrEqual(dimensions.viewportWidth);
}

async function expectNoSeriousAccessibilityViolations(page: Page) {
  const scan = await new AxeBuilder({ page }).analyze();
  const serious = scan.violations.filter((violation) =>
    violation.impact === "serious" || violation.impact === "critical");
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
}

function definitionValue(root: Locator, label: string): Locator {
  return root.locator("dt").filter({ hasText: label }).locator("..").locator("dd");
}

function durationInMilliseconds(value: string): number {
  return Math.max(...value.split(",").map((duration) => {
    const normalized = duration.trim();
    return normalized.endsWith("ms")
      ? Number.parseFloat(normalized)
      : Number.parseFloat(normalized) * 1_000;
  }));
}

test.describe.configure({ mode: "serial" });

test("the root is a canonical wallet-free landing page with the Escrow Flow narrative", async ({ page }) => {
  await openRoute(page, "/");

  expect(new URL(page.url()).pathname).toBe("/");
  await expect(page).toHaveTitle("Dollar-priced FXRP milestones");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", PROOFPAY_PUBLIC_DESCRIPTION);
  const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
  expect(new URL(canonical ?? "", page.url()).pathname).toBe("/");

  const productHeader = page.getByRole("banner");
  await expect(productHeader.getByRole("link", { name: "ProofPay home" })).toHaveAttribute("href", "/");
  await expect(productHeader.getByRole("link", { name: "How it works" })).toHaveAttribute("href", "#how-it-works");
  await expect(productHeader.getByRole("link", { name: "Live proof" })).toHaveAttribute("href", "#live-proof");
  await expect(productHeader.getByText("Coston2 testnet", { exact: true })).toBeVisible();
  await expect(productHeader.getByRole("link", { name: "Create a milestone" })).toHaveAttribute("href", "/app");
  await expect(productHeader.locator('[data-testid^="wallet-state-"]')).toHaveCount(0);
  await expect(productHeader.getByText(/wallet/iu)).toHaveCount(0);

  const sectionOrder = await page.locator("main > section").evaluateAll((sections) =>
    sections.map((section) => section.getAttribute("aria-labelledby")));
  expect(sectionOrder).toEqual([
    "landing-hero-title",
    "problem-title",
    "how-it-works-title",
    "price-protection-title",
    "live-proof-title",
    "built-on-flare-title",
    "final-cta-title",
  ]);

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Keep the milestone in dollars. Settle it in FXRP.",
  );
  await expect(page.locator(".hero-support")).toHaveText(
    "ProofPay prices the milestone when it is funded and again when it is released. A 10% FXRP buffer protects the target; unused FXRP returns to the client, and a shortfall blocks release until it is topped up.",
  );
  await expect(page.locator(".hero-copy").getByRole("link", { name: "Create a milestone" })).toHaveAttribute("href", "/app");
  await expect(page.locator(".hero-copy").getByRole("link", { name: "See a real settlement" })).toHaveAttribute("href", "/receipt/2");
  await expect(page.getByRole("heading", { name: "Funding alone does not preserve the agreement." })).toBeVisible();
  await expect(page.locator(".problem-section .continuous-explanation")).toHaveText(
    "A crypto invoice can be fully funded and still be worth less by release time. ProofPay keeps the agreement in USD, then recalculates the FXRP needed before payment moves.",
  );
  await expect(page.locator(".mechanism-stage")).toHaveText(["AGREE", "FUND", "DELIVER", "SETTLE"]);
  await expect(page.locator(".how-section")).toContainText("InvoiceFunded");
  await expect(page.locator(".how-section")).toContainText("EvidenceSubmitted");
  await expect(page.locator(".how-section")).toContainText("InvoiceReleased");
  await expect(page.locator(".blocked-path")).toContainText("BLOCKED");
  await expect(page.locator(".protection-calculation")).toContainText("100 FXRP target");
  await expect(page.locator(".protection-calculation")).toContainText("10 FXRP protection");
  await expect(page.locator(".protection-calculation")).toContainText("110 FXRP locked");
  await expect(page.getByRole("heading", { name: "One settled milestone, decoded from Coston2" })).toBeVisible();
  await expect(page.getByTestId("landing-live-proof-unavailable")).toContainText(
    "No stored or illustrative settlement value is substituted for invoice #2.",
  );
  await expect(page.locator(".flare-mechanism dt")).toHaveText(["FXRP", "FTSOv2", "ProofPayEscrow", "Coston2"]);
  await expect(page.getByRole("heading", { name: "Create a dollar-priced FXRP milestone" })).toBeVisible();

  await expectNoSeriousAccessibilityViolations(page);
});

test("all four illustrative prices expose exact settlement math and retain keyboard focus", async ({ page }) => {
  await openRoute(page, "/");

  const illustration = page.getByTestId("illustrative-milestone");
  await expect(illustration.getByRole("heading", { level: 2 })).toHaveText(
    "Illustrative $100 milestone · no transaction is being sent",
  );
  await expect(illustration.locator(".funding-basis")).toHaveText(
    "Funded at $1.00 per XRP · 100 FXRP base + 10 FXRP protection = 110 FXRP locked",
  );
  await expect(illustration.locator(".scenario-calculation dt")).toHaveText([
    "USD target",
    "FXRP locked",
    "FXRP required now",
    "Result",
  ]);

  const scenarios = [
    {
      button: "XRP rises to $1.25",
      key: "Enter",
      price: "$1.25",
      required: "80 FXRP",
      result: "80 FXRP payout · 30 FXRP refund",
      outcome: "covered",
    },
    {
      button: "XRP remains $1.00",
      key: "Space",
      price: "$1.00",
      required: "100 FXRP",
      result: "100 FXRP payout · 10 FXRP refund",
      outcome: "covered",
    },
    {
      button: "XRP falls to $0.95",
      key: "Enter",
      price: "$0.95",
      required: "105.263158 FXRP",
      result: "105.263158 FXRP payout · 4.736842 FXRP refund",
      outcome: "covered",
    },
    {
      button: "XRP falls to $0.90",
      key: "Space",
      price: "$0.90",
      required: "111.111112 FXRP",
      result: "Release blocked · 1.111112 FXRP top-up required",
      outcome: "blocked",
    },
  ] as const;

  const announcement = illustration.locator(".scenario-announcement");
  await expect(announcement).toHaveAttribute("aria-live", "polite");
  await expect(announcement).toHaveAttribute("aria-atomic", "true");

  for (const scenario of scenarios) {
    const button = illustration.getByRole("button", { name: scenario.button });
    await button.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(button).toBeFocused();
    await page.keyboard.press(scenario.key);
    await expect(button).toBeFocused();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    expect(Number.parseFloat(await button.evaluate((element) => getComputedStyle(element).outlineWidth)))
      .toBeGreaterThanOrEqual(3);
    await expect(definitionValue(illustration.locator(".scenario-calculation"), "USD target")).toHaveText("$100.00");
    await expect(definitionValue(illustration.locator(".scenario-calculation"), "FXRP locked")).toHaveText("110 FXRP");
    await expect(definitionValue(illustration.locator(".scenario-calculation"), "FXRP required now")).toHaveText(scenario.required);
    await expect(definitionValue(illustration.locator(".scenario-calculation"), "Result")).toHaveText(scenario.result);
    await expect(illustration.locator(".escrow-line")).toHaveAttribute("data-outcome", scenario.outcome);
    await expect(illustration.locator(".escrow-flow-agreement")).toContainText("USD agreement");
    await expect(illustration.locator(".escrow-flow-lock")).toContainText("110 FXRP");
    await expect(announcement).toContainText(`At ${scenario.price} per XRP`);
    await expect(announcement).toContainText(`ProofPay requires ${scenario.required}`);
    await expect(announcement).toContainText(scenario.result);
  }

  const rise = illustration.getByRole("button", { name: "XRP rises to $1.25" });
  const steady = illustration.getByRole("button", { name: "XRP remains $1.00" });
  await rise.focus();
  await page.keyboard.press("ArrowRight");
  await expect(steady).toBeFocused();
  await expect(steady).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("End");
  await expect(illustration.getByRole("button", { name: "XRP falls to $0.90" })).toBeFocused();
  await expect(illustration.locator(".escrow-flow-barrier")).toContainText("Top up exactly 1.111112 FXRP");
  await page.keyboard.press("Home");
  await expect(rise).toBeFocused();
  await expect(illustration.locator(".escrow-flow-payout")).toContainText("80 FXRP");
  await expect(illustration.locator(".escrow-flow-refund")).toContainText("30 FXRP");
});

test("reduced-motion users receive the same scenario result without a visual transition", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openRoute(page, "/");

  const button = page.getByRole("button", { name: "XRP falls to $0.90" });
  const transitionDuration = await button.evaluate((element) => getComputedStyle(element).transitionDuration);
  expect(durationInMilliseconds(transitionDuration)).toBeLessThanOrEqual(1);
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(button).toBeFocused();
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await expect(definitionValue(page.getByTestId("scenario-calculation"), "Result")).toHaveText(
    "Release blocked · 1.111112 FXRP top-up required",
  );
  await expect(page.locator(".scenario-announcement")).toContainText(
    "ProofPay requires 111.111112 FXRP. Release blocked · 1.111112 FXRP top-up required.",
  );
  const animatedFlow = await page.locator(".escrow-rule, .escrow-branches .escrow-flow-node, .escrow-flow-barrier")
    .evaluateAll((elements) => elements.map((element) => ({
      animationName: getComputedStyle(element).animationName,
      transitionDuration: getComputedStyle(element).transitionDuration,
    })));
  for (const style of animatedFlow) {
    expect(style.animationName).toBe("none");
    expect(durationInMilliseconds(style.transitionDuration)).toBeLessThanOrEqual(1);
  }
});

test("the disconnected application shell makes creation primary and hides an empty journal", async ({ page }) => {
  await openRoute(page, "/app");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Create a dollar-priced FXRP milestone");
  await expect(page.locator(".product-header").getByText("Coston2 testnet", { exact: true })).toBeVisible();
  await expect(page.locator(".wallet-state-label")).toHaveText("Wallet not connected");
  const wallet = page.getByTestId("wallet-state-no-wallet");
  await expect(wallet).toBeVisible();
  await expect(wallet.getByRole("button", { name: "Connect wallet to create a milestone" })).toBeVisible();
  await expect(page.locator(".form-grid")).toHaveClass(/form-grid-receded/u);
  const formControls = page.locator(".form-grid input, .form-grid textarea");
  expect(await formControls.count()).toBeGreaterThan(0);
  for (let index = 0; index < await formControls.count(); index += 1) {
    await expect(formControls.nth(index)).toBeVisible();
    await expect(formControls.nth(index)).toBeEnabled();
  }
  await expect(page.getByRole("button", { name: "Simulate invoice creation" })).toBeDisabled();
  await expect(page.getByRole("heading", { name: "Find an existing milestone." })).toBeVisible();
  await expect(page.getByTestId("transaction-journal")).toHaveCount(0);
  await expect(page.locator("aside, nav[aria-label*='sidebar' i]")).toHaveCount(0);

  await expectNoSeriousAccessibilityViolations(page);
});

test("a terminal milestone has one mobile lifecycle, no wallet panel, and progressive technical evidence", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openRoute(page, "/invoice/1");

  await expect(page.getByTestId("status-stamp")).toHaveText("SETTLED");
  const facts = page.locator(".milestone-facts");
  await expect(definitionValue(facts, "State")).toHaveText("SETTLED");
  await expect(definitionValue(facts, "Wallet role")).toHaveText("No action required");
  await expect(definitionValue(facts, "Next permitted action")).toHaveText("No further wallet action");
  await expect(page.getByTestId("terminal-payout")).toContainText("4.818748 FXRP");
  await expect(page.getByTestId("terminal-refund")).toContainText("0.481197 FXRP");
  await expect(page.getByRole("link", { name: "View settlement receipt" })).toHaveAttribute("href", "/receipt/1");
  await expect(page.locator('[data-testid^="wallet-state-"]')).toHaveCount(0);
  await expect(page.locator(".wallet-actions, .action-focus-panel")).toHaveCount(0);
  await expect(page.locator("button").filter({ hasText: transactionAction })).toHaveCount(0);

  const visibleLifecycleCount = await page
    .locator(".mobile-lifecycle-summary, [data-testid='settlement-rail']")
    .evaluateAll((elements) => elements.filter((element) => element.checkVisibility()).length);
  expect(visibleLifecycleCount).toBe(1);

  const technicalDetails = page.locator(".milestone-technical-details");
  await expect(technicalDetails).not.toHaveAttribute("open", "");
  await expect(page.getByTestId("invoice-contract-state")).toBeHidden();
  await technicalDetails.locator(":scope > summary").click();
  await expect(technicalDetails).toHaveAttribute("open", "");
  await expect(page.getByTestId("invoice-contract-state")).toContainText("RELEASED");
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousAccessibilityViolations(page);
});

test("the fixture-only top-up route stays visibly sample data and exposes no wallet action", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openRoute(page, "/invoice/2");

  await expect(page.getByTestId("status-stamp")).toHaveText("SUBMITTED");
  await expect(page.getByRole("heading", { name: "Top-up required", exact: true })).toBeVisible();
  await expect(page.getByTestId("sample-scenario-label")).toHaveText(
    "Sample scenario — Top-up required · fixture only",
  );
  await expect(page.locator(".network-label")).toHaveText("Fixture-only sample · not live Coston2 evidence");
  await expect(page.getByTestId("release-preview")).toContainText("No payment has been released.");
  await expect(page.getByTestId("preview-top-up")).toContainText("1 FXRP");
  await expect(page.locator('[data-testid^="wallet-state-"]')).toHaveCount(0);
  await expect(page.locator(".wallet-actions, .action-focus-panel")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "View settlement receipt" })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousAccessibilityViolations(page);
});

test("the receipt prioritizes its receipt number and keeps both renamed evidence disclosures progressive", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openRoute(page, "/receipt/1");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("SETTLEMENT RECEIPT · INVOICE #1");
  await expect(page.locator(".receipt-paper")).toHaveCSS("background-color", "rgb(251, 248, 241)");
  expect(await page.getByRole("heading", { level: 1 }).evaluate((element) => getComputedStyle(element).fontFamily))
    .toMatch(/Iowan|Baskerville|Times/iu);
  await expect(page.locator(".receipt-milestone-title")).toHaveText("Deploy and verify ProofPayEscrow on Coston2");
  const evidence = page.getByTestId("evidence-details");
  const contract = page.getByTestId("contract-details");
  const evidenceSummary = evidence.locator(":scope > summary");
  const contractSummary = contract.locator(":scope > summary");
  await expect(evidenceSummary).toHaveText("How this settlement was confirmed");
  await expect(contractSummary).toHaveText("Commitments and final contract state");
  await expect(evidence).not.toHaveAttribute("open", "");
  await expect(contract).not.toHaveAttribute("open", "");

  await evidenceSummary.focus();
  await page.keyboard.press("Enter");
  await expect(evidenceSummary).toBeFocused();
  await expect(evidence).toHaveAttribute("open", "");
  await contractSummary.focus();
  await page.keyboard.press("Enter");
  await expect(contractSummary).toBeFocused();
  await expect(contract).toHaveAttribute("open", "");
  await expect(contract).toContainText("RELEASED");
  const identifierTargetSizes = await page
    .locator(".identifier-button, .identifier-link, .identifier-reveal summary")
    .evaluateAll((elements) => elements
      .filter((element) => element.checkVisibility())
      .map((element) => {
        const bounds = element.getBoundingClientRect();
        return { height: bounds.height, width: bounds.width };
      }));
  for (const size of identifierTargetSizes) {
    expect(size.height).toBeGreaterThanOrEqual(44);
    expect(size.width).toBeGreaterThanOrEqual(44);
  }
  await expectNoSeriousAccessibilityViolations(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalOverflow(page);
  await expect(page.locator(".receipt-paper")).toHaveCSS("box-shadow", "none");
  await expect(page.getByTestId("public-trust-notice")).toBeVisible();
});

test("prototype concepts and design routes are absent from the production application", async ({ page }) => {
  for (const route of ["/", "/app", "/invoice/1", "/receipt/1"]) {
    await openRoute(page, route);
    await expect(page.locator("body")).not.toContainText(/Concept A|Concept B|Concept C|Application shell · disconnected state|The product surface ends here/u);
  }

  for (const route of ["/__design", "/__design/signal-black", "/__design/redline-protocol", "/__design/escrow-flow"]) {
    const response = await page.goto(route, { waitUntil: "networkidle" });
    expect(response?.status(), `${route} unexpectedly exists`).toBe(404);
  }
});

test("deterministic unknown and unavailable routes fail closed without transaction controls", async ({ page }) => {
  await openRoute(page, "/invoice/999");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("This invoice does not exist");
  await expect(page.getByTestId("status-stamp")).toHaveText("No record");
  await expect(page.locator("button").filter({ hasText: transactionAction })).toHaveCount(0);

  await openRoute(page, "/receipt/2");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("No settlement receipt exists yet");
  await expect(page.locator(".state-summary")).toContainText("The invoice is SUBMITTED.");
  await expect(page.locator(".state-summary")).toContainText("No confirmed payout or refund is available.");
  await expect(page.locator("button").filter({ hasText: transactionAction })).toHaveCount(0);

  await openRoute(page, "/receipt/999");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("This invoice does not exist");
  await expect(page.getByTestId("status-stamp")).toHaveText("No record");
  await expectNoSeriousAccessibilityViolations(page);
});

test("landing layout survives all target widths and a 200%-zoom-equivalent CSS viewport", async ({ page }) => {
  await openRoute(page, "/");

  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: width <= 390 ? 844 : 1000 });
    await expectNoHorizontalOverflow(page);
    const mainBox = await page.locator(".landing-shell > main").boundingBox();
    expect(mainBox, `landing main was not laid out at ${width}px`).not.toBeNull();
    expect(mainBox?.x ?? 0).toBeGreaterThanOrEqual(15.5);
    expect(width - ((mainBox?.x ?? 0) + (mainBox?.width ?? width))).toBeGreaterThanOrEqual(15.5);

    if (width <= 390) {
      const headerBox = await page.locator(".product-header-inner").boundingBox();
      expect(headerBox?.x ?? 0).toBeGreaterThanOrEqual(15.5);
      expect(width - ((headerBox?.x ?? 0) + (headerBox?.width ?? width))).toBeGreaterThanOrEqual(15.5);
      const columns = await page.locator(".scenario-controls").evaluate((element) =>
        getComputedStyle(element).gridTemplateColumns.split(" ").filter(Boolean).length);
      expect(columns).toBe(2);
      const targetSizes = await page.locator(".scenario-button, .hero-copy .primary-action").evaluateAll((elements) =>
        elements.map((element) => {
          const bounds = element.getBoundingClientRect();
          return { height: bounds.height, width: bounds.width };
        }));
      for (const size of targetSizes) {
        expect(size.height).toBeGreaterThanOrEqual(44);
        expect(size.width).toBeGreaterThanOrEqual(44);
      }
    }
  }

  // A 1280px browser at 200% zoom exposes roughly 640 CSS pixels for reflow.
  await page.setViewportSize({ width: 640, height: 900 });
  await expectNoHorizontalOverflow(page);
  await expect(page.locator(".scenario-controls")).toHaveCSS("grid-template-columns", /.+px .+px/u);
  await expectNoSeriousAccessibilityViolations(page);
});

test("application, milestone, receipt, and failure routes reflow without horizontal overflow", async ({ page }) => {
  const routes = ["/app", "/invoice/1", "/receipt/1", "/invoice/999", "/receipt/999"];
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: width <= 390 ? 844 : 1000 });
    for (const route of routes) {
      await openRoute(page, route);
      await expectNoHorizontalOverflow(page);
    }
  }
});
