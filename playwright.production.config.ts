import { defineConfig } from "@playwright/test";

const host = "127.0.0.1";
const port = 3213;
const baseURL = `http://${host}:${port}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/hydration.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: "line",
  timeout: 60_000,
  outputDir: "artifacts/interface/production-test-results",
  use: {
    baseURL,
    browserName: "chromium",
    screenshot: "off",
    trace: "retain-on-failure",
    video: "off",
  },
  webServer: {
    command: `/home/samfresh22/.nvm/versions/node/v22.21.1/bin/npm run start -- --hostname ${host} --port ${port}`,
    url: `${baseURL}/app`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      ...process.env,
      PROOFPAY_DATA_MODE: "fixture",
      PROOFPAY_FIXTURE_AUTH: "phase5a-e2e",
    },
  },
});
