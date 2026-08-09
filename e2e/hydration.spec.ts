import { expect, test } from "@playwright/test";

const ACCOUNT = "0x1111111111111111111111111111111111111111";
const hydrationWarning = /hydration|did not match|server rendered html/iu;

test("a restored injected wallet crosses the server/client boundary without hydration warnings", async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.addInitScript((account) => {
    localStorage.setItem("wagmi.injected.connected", "true");
    localStorage.removeItem("wagmi.injected.disconnected");
    const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
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
      async request({ method }: { method: string }) {
        if (method === "eth_accounts" || method === "eth_requestAccounts") return [account];
        if (method === "eth_chainId") return "0x72";
        throw new Error(`Unexpected restored-wallet method: ${method}`);
      },
    };
    Object.assign(window, { ethereum: provider });
  }, ACCOUNT);

  const response = await page.goto("/app", { waitUntil: "networkidle" });
  expect(response?.ok()).toBe(true);
  await expect(page.getByTestId("wallet-state-connected")).toBeVisible();
  await expect(page.locator("h1")).toHaveCount(1);
  expect(consoleErrors.filter((message) => hydrationWarning.test(message))).toEqual([]);
  expect(pageErrors.filter((message) => hydrationWarning.test(message))).toEqual([]);
});
