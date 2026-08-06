import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  createPublicClient,
  defineChain,
  getAddress,
  http,
  parseAbi,
  zeroAddress,
  type Address,
} from "viem";

const EXPECTED_CHAIN_ID = 114;
const COSTON2_RPC_URL = "https://coston2-api.flare.network/ext/C/rpc";
const FLARE_CONTRACT_REGISTRY_ADDRESS = getAddress(
  "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019",
);
const FTSO_V2_REGISTRY_NAME = "FtsoV2";
const XRP_USD_FEED_ID =
  "0x015852502f55534400000000000000000000000000" as const;
const ARTIFACT_PATH = resolve("artifacts/ftso-tolerance.json");

const MINIMUM_SUCCESSFUL_READS = 24;
const MINIMUM_SUCCESSFUL_SPAN_MS = 120_000;
const SAMPLE_INTERVAL_MS = 5_500;
const MAXIMUM_ATTEMPTS = 48;
const PLANNED_MAX_PRICE_AGE_SECONDS = 30;

const registryAbi = parseAbi([
  "function getContractAddressByName(string _name) view returns (address)",
]);

const ftsoV2Abi = parseAbi([
  "function calculateFeeById(bytes21 _feedId) view returns (uint256)",
  "function getFeedById(bytes21 _feedId) payable returns (uint256 _value, int8 _decimals, uint64 _timestamp)",
]);

const coston2 = defineChain({
  id: EXPECTED_CHAIN_ID,
  name: "Flare Testnet Coston2",
  nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
  rpcUrls: { default: { http: [COSTON2_RPC_URL] } },
  testnet: true,
});

const publicClient = createPublicClient({
  chain: coston2,
  transport: http(COSTON2_RPC_URL, { timeout: 15_000 }),
});

interface FtsoSample {
  attempt: number;
  requestStartedAt: string;
  localReadTime: string;
  rawValue: string | null;
  decimals: number | null;
  feedTimestamp: string | null;
  feedTimestampIso: string | null;
  observedFeedAgeSeconds: number | null;
  feeReturned: string | null;
  rpcSuccess: boolean;
  failure: string | null;
}

async function main() {
  const startedAt = new Date();
  const actualChainId = await publicClient.getChainId();
  if (actualChainId !== EXPECTED_CHAIN_ID) {
    throw new Error(`Expected Coston2 chain 114, received ${actualChainId}.`);
  }

  const ftsoV2Address = await publicClient.readContract({
    address: FLARE_CONTRACT_REGISTRY_ADDRESS,
    abi: registryAbi,
    functionName: "getContractAddressByName",
    args: [FTSO_V2_REGISTRY_NAME],
  });
  if (ftsoV2Address === zeroAddress) {
    throw new Error("The Flare Contract Registry returned a zero FtsoV2 address.");
  }

  const samples: FtsoSample[] = [];
  let firstSuccessfulReadMs: number | undefined;
  let lastSuccessfulReadMs: number | undefined;
  let successfulReads = 0;

  for (let attempt = 1; attempt <= MAXIMUM_ATTEMPTS; attempt += 1) {
    const sample = await readSample(ftsoV2Address, attempt);
    samples.push(sample);

    if (sample.rpcSuccess) {
      const readTimeMs = Date.parse(sample.localReadTime);
      firstSuccessfulReadMs ??= readTimeMs;
      lastSuccessfulReadMs = readTimeMs;
      successfulReads += 1;
      console.log(
        `Sample ${attempt}: PASS; age=${sample.observedFeedAgeSeconds}s; fee=${sample.feeReturned}`,
      );
    } else {
      console.log(`Sample ${attempt}: FAIL; ${sample.failure}`);
    }

    const successfulSpanMs =
      firstSuccessfulReadMs === undefined || lastSuccessfulReadMs === undefined
        ? 0
        : lastSuccessfulReadMs - firstSuccessfulReadMs;
    if (
      successfulReads >= MINIMUM_SUCCESSFUL_READS &&
      successfulSpanMs >= MINIMUM_SUCCESSFUL_SPAN_MS
    ) {
      break;
    }
    if (attempt < MAXIMUM_ATTEMPTS) await delay(SAMPLE_INTERVAL_MS);
  }

  const successfulSamples = samples.filter(
    (sample): sample is FtsoSample & { observedFeedAgeSeconds: number } =>
      sample.rpcSuccess && sample.observedFeedAgeSeconds !== null,
  );
  const ages = successfulSamples
    .map((sample) => sample.observedFeedAgeSeconds)
    .sort((left, right) => left - right);
  const successfulSpanSeconds =
    firstSuccessfulReadMs === undefined || lastSuccessfulReadMs === undefined
      ? 0
      : roundMilliseconds(lastSuccessfulReadMs - firstSuccessfulReadMs);
  const status =
    successfulReads >= MINIMUM_SUCCESSFUL_READS &&
    successfulSpanSeconds >= MINIMUM_SUCCESSFUL_SPAN_MS / 1_000
      ? "PASS"
      : "FAIL";

  const artifact = {
    schemaVersion: 1,
    phase: "3B",
    probe: "live-ftso-tolerance",
    status,
    startedAt: startedAt.toISOString(),
    completedAt: new Date().toISOString(),
    network: {
      name: coston2.name,
      rpcUrl: COSTON2_RPC_URL,
      expectedChainId: EXPECTED_CHAIN_ID,
      actualChainId,
      testnet: true,
    },
    registry: {
      address: FLARE_CONTRACT_REGISTRY_ADDRESS,
      ftsoV2Name: FTSO_V2_REGISTRY_NAME,
      ftsoV2Address,
    },
    feed: {
      name: "XRP/USD",
      feedId: XRP_USD_FEED_ID,
    },
    sampling: {
      minimumSuccessfulReads: MINIMUM_SUCCESSFUL_READS,
      minimumSuccessfulSpanSeconds: MINIMUM_SUCCESSFUL_SPAN_MS / 1_000,
      intervalMilliseconds: SAMPLE_INTERVAL_MS,
      maximumAttempts: MAXIMUM_ATTEMPTS,
      attemptedReads: samples.length,
      successfulReads,
      failedReadCount: samples.length - successfulReads,
      firstSuccessfulReadTime:
        firstSuccessfulReadMs === undefined
          ? null
          : new Date(firstSuccessfulReadMs).toISOString(),
      lastSuccessfulReadTime:
        lastSuccessfulReadMs === undefined
          ? null
          : new Date(lastSuccessfulReadMs).toISOString(),
      successfulSpanSeconds,
    },
    statistics: {
      minimumFeedAgeSeconds: ages.length === 0 ? null : ages[0],
      medianFeedAgeSeconds: median(ages),
      maximumFeedAgeSeconds: ages.length === 0 ? null : ages[ages.length - 1],
      failedReadCount: samples.length - successfulReads,
      nonzeroFeeCount: samples.filter(
        (sample) => sample.feeReturned !== null && BigInt(sample.feeReturned) !== 0n,
      ).length,
      observedDecimals: [
        ...new Set(
          samples
            .map((sample) => sample.decimals)
            .filter((decimals): decimals is number => decimals !== null),
        ),
      ].sort((left, right) => left - right),
    },
    policy: {
      plannedMaxPriceAgeSeconds: PLANNED_MAX_PRICE_AGE_SECONDS,
      recommendation: "PENDING_EVIDENCE_REVIEW",
    },
    transactionActivity: {
      walletUsed: false,
      transactionSent: false,
      faucetRequested: false,
    },
    samples,
    command: "npm run probe:ftso-tolerance",
  };

  await writeFile(ARTIFACT_PATH, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(
    `Completed ${successfulReads} successful reads across ${successfulSpanSeconds}s; artifact=${ARTIFACT_PATH}`,
  );
  if (status !== "PASS") process.exitCode = 1;
}

async function readSample(ftsoV2Address: Address, attempt: number): Promise<FtsoSample> {
  const requestStartedAt = new Date();
  const [feeResult, feedResult] = await Promise.allSettled([
    publicClient.readContract({
      address: ftsoV2Address,
      abi: ftsoV2Abi,
      functionName: "calculateFeeById",
      args: [XRP_USD_FEED_ID],
    }),
    publicClient.simulateContract({
      address: ftsoV2Address,
      abi: ftsoV2Abi,
      functionName: "getFeedById",
      args: [XRP_USD_FEED_ID],
      value: 0n,
    }),
  ]);
  const localReadTime = new Date();
  const feeReturned = feeResult.status === "fulfilled" ? feeResult.value : null;
  const feed = feedResult.status === "fulfilled" ? feedResult.value.result : null;
  const feedTimestamp = feed?.[2];
  const observedFeedAgeSeconds =
    feedTimestamp === undefined
      ? null
      : roundMilliseconds(localReadTime.getTime() - Number(feedTimestamp) * 1_000);
  const failures: string[] = [];
  if (feeResult.status === "rejected") {
    failures.push(`calculateFeeById: ${describeError(feeResult.reason)}`);
  }
  if (feedResult.status === "rejected") {
    failures.push(`getFeedById: ${describeError(feedResult.reason)}`);
  }

  return {
    attempt,
    requestStartedAt: requestStartedAt.toISOString(),
    localReadTime: localReadTime.toISOString(),
    rawValue: feed === null ? null : feed[0].toString(),
    decimals: feed === null ? null : feed[1],
    feedTimestamp: feedTimestamp === undefined ? null : feedTimestamp.toString(),
    feedTimestampIso:
      feedTimestamp === undefined
        ? null
        : new Date(Number(feedTimestamp) * 1_000).toISOString(),
    observedFeedAgeSeconds,
    feeReturned: feeReturned?.toString() ?? null,
    rpcSuccess: failures.length === 0,
    failure: failures.length === 0 ? null : failures.join("; "),
  };
}

function median(sortedValues: number[]): number | null {
  if (sortedValues.length === 0) return null;
  const midpoint = Math.floor(sortedValues.length / 2);
  if (sortedValues.length % 2 === 1) return sortedValues[midpoint] ?? null;
  const lower = sortedValues[midpoint - 1];
  const upper = sortedValues[midpoint];
  if (lower === undefined || upper === undefined) return null;
  return Math.round(((lower + upper) / 2) * 1_000) / 1_000;
}

function roundMilliseconds(milliseconds: number): number {
  return Math.round(milliseconds) / 1_000;
}

function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return (message.split("\n")[0] ?? "Unknown RPC error").slice(0, 300);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

await main();
