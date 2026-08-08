import { defineConfig } from "@playwright/test";

const host = "127.0.0.1";
const port = 3211;
const baseURL = `http://${host}:${port}`;
const liveEnvironment = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
);

// The live suite exercises the application's default adapter. Do not allow an
// inherited fixture override to turn this into another deterministic run.
delete liveEnvironment.PROOFPAY_DATA_MODE;
delete liveEnvironment.PROOFPAY_FIXTURE_AUTH;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/interface.live.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: "line",
  outputDir: "artifacts/interface/live-test-results",
  timeout: 90_000,
  use: {
    baseURL,
    browserName: "chromium",
    screenshot: "off",
    trace: "retain-on-failure",
    video: "off",
  },
  webServer: {
    command: `npm run dev -- --hostname ${host} --port ${port}`,
    url: `${baseURL}/invoice/1`,
    timeout: 360_000,
    reuseExistingServer: false,
    env: liveEnvironment,
  },
});
