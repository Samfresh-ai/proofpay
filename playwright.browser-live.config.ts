import { defineConfig } from "@playwright/test";

const host = "127.0.0.1";
const port = 3212;
const baseURL = `http://${host}:${port}`;
const liveEnvironment = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
);
delete liveEnvironment.PROOFPAY_DATA_MODE;
delete liveEnvironment.PROOFPAY_FIXTURE_AUTH;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/browser-settlement.live.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: "line",
  outputDir: "artifacts/browser-settlement/test-results",
  timeout: 900_000,
  expect: { timeout: 45_000 },
  use: {
    baseURL,
    browserName: "chromium",
    screenshot: "off",
    trace: "off",
    video: "off",
  },
  webServer: {
    command: `/home/samfresh22/.nvm/versions/node/v22.21.1/bin/npm run dev -- --hostname ${host} --port ${port}`,
    url: `${baseURL}/app`,
    timeout: 360_000,
    reuseExistingServer: false,
    env: liveEnvironment,
  },
});
