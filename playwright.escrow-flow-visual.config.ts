import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/escrow-flow-visual.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: "line",
  timeout: 900_000,
  expect: {
    timeout: 60_000,
  },
  outputDir: "artifacts/escrow-flow-test-results",
  use: {
    browserName: "chromium",
    colorScheme: "light",
    contextOptions: {
      reducedMotion: "reduce",
    },
    locale: "en-US",
    screenshot: "off",
    serviceWorkers: "block",
    timezoneId: "Africa/Lagos",
    trace: "retain-on-failure",
    video: "off",
  },
});
