import { spawn } from "node:child_process";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";

import {
  createPublicClient,
  createWalletClient,
  decodeAbiParameters,
  decodeErrorResult,
  defineChain,
  encodeErrorResult,
  encodeFunctionData,
  formatEther,
  formatUnits,
  getAddress,
  http,
  keccak256,
  parseAbi,
  parseEventLogs,
  stringToHex,
  zeroAddress,
  type Address,
  type Hash,
  type Hex,
  type TransactionReceipt,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";

const CHAIN_ID = 114;
const RPC_URL = "https://coston2-api.flare.network/ext/C/rpc";
const EXPLORER_URL = "https://coston2-explorer.flare.network";
const CONTRACT = getAddress("0x53bE2D49f4bFCF2cc04A225Ccb7398Fb5E5EAA21");
const CLIENT = getAddress("0x3c47ddC46848A7a225d3491DA5c211e2E7A51F42");
const FREELANCER = getAddress("0xB9CC4f51Bb837DC56998474961250287f40FA680");
const XRP_USD_FEED_ID =
  "0x015852502f55534400000000000000000000000000" as const;
const MILESTONE_TITLE = "Deploy and verify ProofPayEscrow on Coston2";
const REQUESTED_USD_TARGET = 5_000_000n;
const FALLBACK_USD_TARGET = 3_000_000n;
const MAX_FUNDING_THRESHOLD = 8_000_000n;
const DELIVERY_WINDOW_SECONDS = 86_400n;
const QUOTE_WINDOW_SECONDS = 300n;
const GAS_SETUP_THRESHOLD = 500_000_000_000_000_000n;
const GAS_SETUP_AMOUNT = 1_000_000_000_000_000_000n;
const GAS_LIMIT_NUMERATOR = 120n;
const GAS_LIMIT_DENOMINATOR = 100n;
const DEPLOYMENT_COMMIT = "2aa2a2a75ca550de59c4e38920f4a59c1594acb1";
const REPOSITORY_ROOT = resolve(process.cwd());
const DEPLOYMENT_PATH = resolve(REPOSITORY_ROOT, "deployment/coston2.json");
const JOURNAL_PATH = resolve(REPOSITORY_ROOT, "artifacts/coston2-live-invoice.json");
const JOURNAL_TEMP_PATH = `${JOURNAL_PATH}.tmp`;
const SCOPE_PATH = resolve(REPOSITORY_ROOT, "artifacts/live-scope-manifest.json");
const EVIDENCE_PATH = resolve(REPOSITORY_ROOT, "artifacts/live-evidence-manifest.json");
const RECEIPT_PATH = resolve(REPOSITORY_ROOT, "artifacts/coston2-settlement-receipt.json");
const SECRET_DIRECTORY = resolve(homedir(), ".local/share/proofpay");
const SECRET_PATH = resolve(SECRET_DIRECTORY, "coston2-burner-wallets.json");

const proofPayAbi = parseAbi([
  "function fxrp() view returns (address)",
  "function ftsoV2() view returns (address)",
  "function xrpUsdFeedId() view returns (bytes21)",
  "function maximumPriceAge() view returns (uint64)",
  "function activeFxrpLiabilities() view returns (uint256)",
  "function invoices(uint256 invoiceId) view returns (address freelancer, address client, uint256 usdTarget, uint256 fxrpLocked, uint64 deliveryDeadline, bytes32 scopeHash, bytes32 evidenceHash, uint256 fundingPrice, int8 fundingPriceDecimals, uint64 fundingPriceTimestamp, uint256 releasePrice, int8 releasePriceDecimals, uint64 releasePriceTimestamp, uint8 status)",
  "function createInvoice(address client, uint256 usdTarget, uint64 deliveryDeadline, bytes32 scopeHash) returns (uint256 invoiceId)",
  "function quoteFunding(uint256 invoiceId) returns (uint256 requiredFxrp, uint256 price, int8 priceDecimals, uint64 priceTimestamp)",
  "function fundInvoice(uint256 invoiceId, uint256 maxFxrpAmount, uint64 quoteDeadline)",
  "function submitEvidence(uint256 invoiceId, bytes32 evidenceHash, string evidenceURI)",
  "function quoteRelease(uint256 invoiceId) returns (uint256 requiredPayoutFxrp, uint256 clientRefundFxrp, uint256 topUpFxrp, uint256 price, int8 priceDecimals, uint64 priceTimestamp)",
  "function topUp(uint256 invoiceId, uint256 maxTopUpFxrp, uint64 quoteDeadline)",
  "function release(uint256 invoiceId, uint256 maxPayoutFxrp, uint64 quoteDeadline)",
  "event InvoiceCreated(uint256 indexed invoiceId, address indexed freelancer, address indexed client, uint256 usdTarget, uint64 deliveryDeadline, bytes32 scopeHash)",
  "event InvoiceFunded(uint256 indexed invoiceId, uint256 fxrpLocked, uint256 price, int8 priceDecimals, uint64 priceTimestamp)",
  "event EvidenceSubmitted(uint256 indexed invoiceId, bytes32 indexed evidenceHash, string evidenceURI)",
  "event InvoiceToppedUp(uint256 indexed invoiceId, uint256 amount, uint256 newFxrpLocked, uint256 price, int8 priceDecimals, uint64 priceTimestamp)",
  "event InvoiceReleased(uint256 indexed invoiceId, uint256 freelancerPayout, uint256 clientRefund, uint256 price, int8 priceDecimals, uint64 priceTimestamp)",
  "error ExpiredQuote(uint64 quoteDeadline, uint256 currentTimestamp)",
  "error AmountAboveClientMaximum(uint256 requiredFxrp, uint256 maximumFxrp)",
  "error TopUpRequired(uint256 requiredFxrp, uint256 lockedFxrp, uint256 shortfallFxrp)",
]);
const erc20Abi = parseAbi([
  "function decimals() view returns (uint8)",
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);
const ftsoAbi = parseAbi([
  "function calculateFeeById(bytes21 feedId) view returns (uint256)",
  "function getFeedById(bytes21 feedId) payable returns (uint256 value, int8 decimals, uint64 timestamp)",
]);
const coston2 = defineChain({
  id: CHAIN_ID,
  name: "Flare Testnet Coston2",
  nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: "Coston2 Explorer", url: EXPLORER_URL } },
  testnet: true,
});
const rpcTransport = http(RPC_URL, { retryCount: 3, retryDelay: 1_000, timeout: 30_000 });
const publicClient = createPublicClient({ chain: coston2, transport: rpcTransport });

type ActionName =
  | "setupGas"
  | "create"
  | "approveFunding"
  | "fund"
  | "evidence"
  | "approveTopUp"
  | "topUp"
  | "release";

interface SecretFile {
  schemaVersion: 1;
  purpose: "proofpay-coston2-technical-probe";
  chainId: 114;
  senderPrivateKey: Hex;
  recipientPrivateKey: Hex;
}

interface DeploymentRecord {
  schemaVersion: 1;
  phase: "4A";
  status: "DEPLOYED_VERIFIED";
  network: { chainId: 114; name: string; rpc: { classification: string; embedsSecrets: false } };
  deployer: { address: Address };
  dependencies: {
    fxrpAddress: Address;
    fxrpDecimals: 6;
    ftsoV2Address: Address;
    xrpUsdFeedId: Hex;
    maximumPriceAgeSeconds: 30;
  };
  deployment: {
    contractAddress: Address;
    transactionHash: Hash;
    blockNumber: string;
  };
  bytecodeVerification: {
    status: "PASS";
    expectedRuntimeBytecodeHash: Hash;
    deployedRuntimeBytecodeHash: Hash;
  };
  explorer: { transaction: string; contract: string };
  sourceVerification: { status: string };
}

interface InvoiceRecord {
  freelancer: Address;
  client: Address;
  usdTarget: string;
  fxrpLocked: string;
  deliveryDeadline: string;
  scopeHash: Hash;
  evidenceHash: Hash;
  fundingPrice: string;
  fundingPriceDecimals: number;
  fundingPriceTimestamp: string;
  releasePrice: string;
  releasePriceDecimals: number;
  releasePriceTimestamp: string;
  status: number;
  statusName: string;
}

interface Snapshot {
  blockNumber: string;
  blockTimestamp: string;
  blockTimestampIso: string;
  clientC2flrWei: string;
  clientC2flr: string;
  freelancerC2flrWei: string;
  freelancerC2flr: string;
  clientFxrpAtomic: string;
  clientFxrp: string;
  freelancerFxrpAtomic: string;
  freelancerFxrp: string;
  contractFxrpAtomic: string;
  contractFxrp: string;
  activeFxrpLiabilitiesAtomic: string;
  invoice: InvoiceRecord | null;
}

interface StoredReceipt {
  status: "success" | "reverted";
  blockNumber: string;
  transactionIndex: number;
  gasUsed: string;
  effectiveGasPriceWei: string;
  totalFeeWei: string;
  totalFeeC2flr: string;
}

interface TransactionEntry {
  action: ActionName;
  description: string;
  status:
    | "INTENT_RECORDED"
    | "SIGNED_READY_TO_SUBMIT"
    | "BROADCAST_ATTEMPTED"
    | "TRANSACTION_SUBMITTED"
    | "RECEIPT_CONFIRMED"
    | "COMPLETE";
  intendedAt: string;
  from: Address;
  to: Address;
  valueWei: string;
  data: Hex;
  calldataHash: Hash;
  functionName: string;
  parameters: Record<string, string | number | boolean | null>;
  simulation: "PASS";
  nonce: number;
  gasEstimate: string;
  gasLimit: string;
  gasPriceWei: string;
  maximumGasFeeWei: string;
  plannedTransactionHash: Hash | null;
  broadcastAttemptedAt: string | null;
  transactionHash: Hash | null;
  submittedAt: string | null;
  receipt: StoredReceipt | null;
  before: Snapshot;
  after: Snapshot | null;
  observedEvent: Record<string, string | number | boolean | null> | null;
}

interface QuoteRecord {
  simulatedAt: string;
  blockNumber: string;
  price: string;
  priceDecimals: number;
  priceTimestamp: string;
  priceTimestampIso: string;
  feedAgeSeconds: number;
  requiredBaseFxrpAtomic: string;
  protectionFxrpAtomic: string;
  totalFundingRequirementAtomic: string;
  transactionToleranceBps: 200;
  clientMaximumFxrpAtomic: string;
  quoteDeadline: string;
  independentMathMatch: true;
}

interface ReleaseQuoteRecord {
  simulatedAt: string;
  blockNumber: string;
  price: string;
  priceDecimals: number;
  priceTimestamp: string;
  priceTimestampIso: string;
  feedAgeSeconds: number;
  requiredFreelancerPayoutAtomic: string;
  lockedFxrpAtomic: string;
  expectedClientRefundAtomic: string;
  topUpRequiredAtomic: string;
  releaseMaximumAtomic: string;
  quoteDeadline: string;
}

interface Journal {
  schemaVersion: 1;
  phase: "4B";
  chainId: 114;
  contractAddress: Address;
  client: Address;
  freelancer: Address;
  currentStep: string;
  invoiceId: string | null;
  intendedAction: string | null;
  completionStatus: "IN_PROGRESS" | "PASS" | "NEEDS_RECONCILIATION";
  executionGitCommit: string;
  createdAt: string;
  updatedAt: string;
  deploymentIdentity: {
    deploymentTransaction: Hash;
    deploymentBlock: string;
    runtimeBytecodeHash: Hash;
    fxrp: Address;
    ftsoV2: Address;
    feedId: Hex;
    maximumPriceAgeSeconds: 30;
  };
  preflight: {
    status: "PASS";
    checkedAt: string;
    chainId: 114;
    codeExists: true;
    runtimeBytecodeHashMatches: true;
    walletAddressesMatch: true;
    fxrpDecimals: 6;
    currentFtsoFeeWei: "0";
    feed: {
      value: string;
      decimals: number;
      timestamp: string;
      timestampIso: string;
      ageSeconds: number;
      validAndFresh: true;
    };
    invoiceCount: number;
    initialSnapshot: Snapshot;
    initialContractSurplusAtomic: string;
    setupGasRequired: boolean;
    targetSelection: {
      requestedUsdTargetAtomic: "5000000";
      selectedUsdTargetAtomic: string;
      requestedFundingRequirementAtomic: string;
      selectedFundingRequirementAtomic: string;
      adjustedToThreeUsd: boolean;
      reason: string | null;
    };
  };
  scopeManifest: {
    path: "artifacts/live-scope-manifest.json";
    encoding: "UTF-8";
    canonical: true;
    bytesLength: number;
    keccak256: Hash;
    usdTargetAtomic: string;
    deliveryDeadline: string;
  };
  evidenceManifest: null | {
    path: "artifacts/live-evidence-manifest.json";
    encoding: "UTF-8";
    canonical: true;
    bytesLength: number;
    keccak256: Hash;
    evidenceUri: string;
  };
  negativeQuoteProof: null | {
    status: "PASS";
    simulatedAt: string;
    blockNumber: string;
    invoiceId: string;
    expiredQuoteDeadline: string;
    maximumFxrpAtomic: string;
    expectedError: "ExpiredQuote(uint64,uint256)";
    expectedErrorData: Hex;
    actualError: { name: "ExpiredQuote"; quoteDeadline: string; currentTimestamp: string };
    actualErrorData: Hex;
    transactionSent: false;
    stateAndBalancesUnchanged: true;
    before: Snapshot;
    after: Snapshot;
  };
  fundingQuote: QuoteRecord | null;
  releaseQuote: ReleaseQuoteRecord | null;
  topUp: {
    required: boolean;
    amountAtomic: string;
    completed: boolean;
  } | null;
  transactions: Record<ActionName, TransactionEntry | null>;
  contractState: Snapshot;
  errors: Array<{ at: string; step: string; message: string }>;
}

interface Wallets {
  client: PrivateKeyAccount;
  freelancer: PrivateKeyAccount;
}

interface ManagedRequest {
  account: PrivateKeyAccount;
  action: ActionName;
  description: string;
  to: Address;
  data: Hex;
  value: bigint;
  functionName: string;
  parameters: Record<string, string | number | boolean | null>;
}

const STATUS_NAMES = ["CREATED", "FUNDED", "SUBMITTED", "RELEASED", "CANCELLED", "REFUNDED"];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPrivateKey(value: unknown): value is Hex {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);
}

function safeErrorMessage(error: unknown): string {
  let message = "unknown error";
  if (isObject(error) && typeof error.shortMessage === "string") message = error.shortMessage;
  else if (error instanceof Error) message = error.message.split("\n")[0] ?? message;
  if (isObject(error) && typeof error.details === "string" && !message.includes(error.details)) {
    message = `${message} (${error.details})`;
  }
  return message.replace(/0x[0-9a-fA-F]{64}/g, "[REDACTED_32_BYTES]");
}

function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  return numerator / denominator + (numerator % denominator === 0n ? 0n : 1n);
}

function asNumber(value: bigint): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error("A chain value exceeds safe integer range.");
  return number;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isObject(value)) return value;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) result[key] = canonicalize(value[key]);
  return result;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function manifestHash(bytes: string): Hash {
  return keccak256(stringToHex(bytes));
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (isObject(error) && error.code === "ENOENT") return false;
    throw error;
  }
}

async function writeJournal(journal: Journal): Promise<void> {
  journal.updatedAt = new Date().toISOString();
  await mkdir(resolve(REPOSITORY_ROOT, "artifacts"), { recursive: true });
  await writeFile(JOURNAL_TEMP_PATH, `${JSON.stringify(journal, null, 2)}\n`, "utf8");
  await rename(JOURNAL_TEMP_PATH, JOURNAL_PATH);
}

async function runCommand(executable: string, args: string[]): Promise<string> {
  return await new Promise((resolvePromise, reject) => {
    const child = spawn(executable, args, {
      cwd: REPOSITORY_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => (stdout += chunk));
    child.stderr.on("data", (chunk: string) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if ((code ?? 1) !== 0) reject(new Error(stderr.trim() || `${executable} failed`));
      else resolvePromise(stdout.trim());
    });
  });
}

async function enforceSecretPermissions(): Promise<void> {
  const [directoryStats, fileStats] = await Promise.all([
    stat(SECRET_DIRECTORY),
    stat(SECRET_PATH),
  ]);
  if ((directoryStats.mode & 0o077) !== 0 || (fileStats.mode & 0o077) !== 0) {
    throw new Error("The wallet secret location is not owner-only.");
  }
  if (process.getuid !== undefined) {
    const uid = process.getuid();
    if (directoryStats.uid !== uid || fileStats.uid !== uid) {
      throw new Error("The wallet secret location is not owned by the current user.");
    }
  }
}

async function readWallets(): Promise<Wallets> {
  await enforceSecretPermissions();
  const secret = await readJson<Partial<SecretFile>>(SECRET_PATH);
  if (
    secret.schemaVersion !== 1 ||
    secret.purpose !== "proofpay-coston2-technical-probe" ||
    secret.chainId !== CHAIN_ID ||
    !isPrivateKey(secret.senderPrivateKey) ||
    !isPrivateKey(secret.recipientPrivateKey)
  ) {
    throw new Error("The owner-only wallet file does not match the recorded schema.");
  }
  const client = privateKeyToAccount(secret.senderPrivateKey);
  const freelancer = privateKeyToAccount(secret.recipientPrivateKey);
  if (client.address !== CLIENT || freelancer.address !== FREELANCER) {
    throw new Error("The stored wallet public addresses differ from the Phase 1 identities.");
  }
  return { client, freelancer };
}

function invoiceFromTuple(tuple: readonly unknown[]): InvoiceRecord {
  const status = Number(tuple[13]);
  const statusName = STATUS_NAMES[status];
  if (statusName === undefined) throw new Error(`Unknown invoice status ${status}.`);
  return {
    freelancer: getAddress(String(tuple[0])),
    client: getAddress(String(tuple[1])),
    usdTarget: String(tuple[2]),
    fxrpLocked: String(tuple[3]),
    deliveryDeadline: String(tuple[4]),
    scopeHash: String(tuple[5]) as Hash,
    evidenceHash: String(tuple[6]) as Hash,
    fundingPrice: String(tuple[7]),
    fundingPriceDecimals: Number(tuple[8]),
    fundingPriceTimestamp: String(tuple[9]),
    releasePrice: String(tuple[10]),
    releasePriceDecimals: Number(tuple[11]),
    releasePriceTimestamp: String(tuple[12]),
    status,
    statusName,
  };
}

async function readSnapshot(invoiceId: bigint | null, blockNumber?: bigint): Promise<Snapshot> {
  const block = await publicClient.getBlock(
    blockNumber === undefined ? { blockTag: "latest" } : { blockNumber },
  );
  const at = block.number;
  const [clientC2flr, freelancerC2flr, clientFxrp, freelancerFxrp, contractFxrp, liabilities] =
    await Promise.all([
      publicClient.getBalance({ address: CLIENT, blockNumber: at }),
      publicClient.getBalance({ address: FREELANCER, blockNumber: at }),
      publicClient.readContract({
        address: (await readJson<DeploymentRecord>(DEPLOYMENT_PATH)).dependencies.fxrpAddress,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [CLIENT],
        blockNumber: at,
      }),
      publicClient.readContract({
        address: (await readJson<DeploymentRecord>(DEPLOYMENT_PATH)).dependencies.fxrpAddress,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [FREELANCER],
        blockNumber: at,
      }),
      publicClient.readContract({
        address: (await readJson<DeploymentRecord>(DEPLOYMENT_PATH)).dependencies.fxrpAddress,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [CONTRACT],
        blockNumber: at,
      }),
      publicClient.readContract({
        address: CONTRACT,
        abi: proofPayAbi,
        functionName: "activeFxrpLiabilities",
        blockNumber: at,
      }),
    ]);
  let invoice: InvoiceRecord | null = null;
  if (invoiceId !== null) {
    const tuple = await publicClient.readContract({
      address: CONTRACT,
      abi: proofPayAbi,
      functionName: "invoices",
      args: [invoiceId],
      blockNumber: at,
    });
    invoice = invoiceFromTuple(tuple);
  }
  return {
    blockNumber: at.toString(),
    blockTimestamp: block.timestamp.toString(),
    blockTimestampIso: new Date(asNumber(block.timestamp) * 1_000).toISOString(),
    clientC2flrWei: clientC2flr.toString(),
    clientC2flr: formatEther(clientC2flr),
    freelancerC2flrWei: freelancerC2flr.toString(),
    freelancerC2flr: formatEther(freelancerC2flr),
    clientFxrpAtomic: clientFxrp.toString(),
    clientFxrp: formatUnits(clientFxrp, 6),
    freelancerFxrpAtomic: freelancerFxrp.toString(),
    freelancerFxrp: formatUnits(freelancerFxrp, 6),
    contractFxrpAtomic: contractFxrp.toString(),
    contractFxrp: formatUnits(contractFxrp, 6),
    activeFxrpLiabilitiesAtomic: liabilities.toString(),
    invoice,
  };
}

async function collectIdentityCheck(deployment: DeploymentRecord): Promise<{
  feedValue: bigint;
  feedDecimals: number;
  feedTimestamp: bigint;
  feedAge: bigint;
  latestBlock: bigint;
  snapshot: Snapshot;
  invoiceCount: number;
}> {
  console.log("PREFLIGHT_STAGE chain-identity");
  const actualChainId = await publicClient.getChainId();
  if (actualChainId !== CHAIN_ID || deployment.network.chainId !== CHAIN_ID) {
    throw new Error(`Expected Coston2 chain 114, received ${actualChainId}.`);
  }
  if (
    deployment.status !== "DEPLOYED_VERIFIED" ||
    getAddress(deployment.deployment.contractAddress) !== CONTRACT ||
    getAddress(deployment.deployer.address) !== CLIENT ||
    deployment.bytecodeVerification.status !== "PASS" ||
    deployment.sourceVerification.status !== "VERIFIED"
  ) {
    throw new Error("The Phase 4A deployment record does not identify the required verified contract.");
  }
  const code = await publicClient.getCode({ address: CONTRACT });
  if (code === undefined || code === "0x") throw new Error("No deployed bytecode exists at ProofPay.");
  const runtimeHash = keccak256(code);
  if (
    runtimeHash !== deployment.bytecodeVerification.expectedRuntimeBytecodeHash ||
    runtimeHash !== deployment.bytecodeVerification.deployedRuntimeBytecodeHash
  ) {
    throw new Error("The live ProofPay runtime bytecode hash differs from Phase 4A evidence.");
  }
  console.log("PREFLIGHT_STAGE immutable-identity");
  const [fxrp, ftso, feedId, maxAge, fxrpDecimals] = await Promise.all([
    publicClient.readContract({ address: CONTRACT, abi: proofPayAbi, functionName: "fxrp" }),
    publicClient.readContract({ address: CONTRACT, abi: proofPayAbi, functionName: "ftsoV2" }),
    publicClient.readContract({ address: CONTRACT, abi: proofPayAbi, functionName: "xrpUsdFeedId" }),
    publicClient.readContract({ address: CONTRACT, abi: proofPayAbi, functionName: "maximumPriceAge" }),
    publicClient.readContract({
      address: deployment.dependencies.fxrpAddress,
      abi: erc20Abi,
      functionName: "decimals",
    }),
  ]);
  if (
    getAddress(fxrp) !== getAddress(deployment.dependencies.fxrpAddress) ||
    getAddress(ftso) !== getAddress(deployment.dependencies.ftsoV2Address) ||
    feedId.toLowerCase() !== XRP_USD_FEED_ID ||
    deployment.dependencies.xrpUsdFeedId.toLowerCase() !== XRP_USD_FEED_ID ||
    maxAge !== 30n ||
    fxrpDecimals !== 6
  ) {
    throw new Error("The deployed constructor identity differs from Phase 4A evidence.");
  }
  console.log("PREFLIGHT_STAGE latest-block");
  const latest = await publicClient.getBlock({ blockTag: "latest" });
  console.log("PREFLIGHT_STAGE fee-feed-logs-balances");
  const [fee, feedCall, firstInvoice, snapshot] = await Promise.all([
    publicClient.readContract({
      address: deployment.dependencies.ftsoV2Address,
      abi: ftsoAbi,
      functionName: "calculateFeeById",
      args: [XRP_USD_FEED_ID],
      blockNumber: latest.number,
    }),
    publicClient.call({
      to: deployment.dependencies.ftsoV2Address,
      data: encodeFunctionData({
        abi: ftsoAbi,
        functionName: "getFeedById",
        args: [XRP_USD_FEED_ID],
      }),
      value: 0n,
      blockNumber: latest.number,
    }),
    publicClient.readContract({
      address: CONTRACT,
      abi: proofPayAbi,
      functionName: "invoices",
      args: [1n],
      blockNumber: latest.number,
    }),
    readSnapshot(null, latest.number),
  ]);
  if (fee !== 0n) throw new Error(`FTSO calculateFeeById returned ${fee}.`);
  if (feedCall.data === undefined || feedCall.data === "0x") throw new Error("FTSO returned no data.");
  const [feedValue, feedDecimals, feedTimestamp] = decodeAbiParameters(
    [{ type: "uint256" }, { type: "int8" }, { type: "uint64" }],
    feedCall.data,
  );
  if (
    feedValue === 0n ||
    feedDecimals < 0 ||
    feedDecimals > 18 ||
    feedTimestamp === 0n ||
    feedTimestamp > latest.timestamp
  ) {
    throw new Error("The live XRP/USD observation is invalid.");
  }
  const feedAge = latest.timestamp - feedTimestamp;
  if (feedAge >= 30n) throw new Error(`The live XRP/USD observation is ${feedAge}s old.`);
  if (BigInt(snapshot.contractFxrpAtomic) < BigInt(snapshot.activeFxrpLiabilitiesAtomic)) {
    throw new Error("The deployed contract is insolvent before the live flow.");
  }
  return {
    feedValue,
    feedDecimals,
    feedTimestamp,
    feedAge,
    latestBlock: latest.number,
    snapshot,
    invoiceCount: getAddress(firstInvoice[0]) === zeroAddress ? 0 : 1,
  };
}

function fundingRequirement(usdTarget: bigint, price: bigint, decimals: number): {
  base: bigint;
  protectedAmount: bigint;
} {
  const base = ceilDiv(usdTarget * 10n ** BigInt(decimals), price);
  return { base, protectedAmount: ceilDiv(base * 11_000n, 10_000n) };
}

function emptyTransactions(): Record<ActionName, TransactionEntry | null> {
  return {
    setupGas: null,
    create: null,
    approveFunding: null,
    fund: null,
    evidence: null,
    approveTopUp: null,
    topUp: null,
    release: null,
  };
}

async function prepare(): Promise<Journal> {
  if (await fileExists(JOURNAL_PATH)) {
    throw new Error("The live journal already exists; reconcile it with --run.");
  }
  console.log("PREFLIGHT_STAGE local-identity");
  const [wallets, deployment, gitCommit] = await Promise.all([
    readWallets(),
    readJson<DeploymentRecord>(DEPLOYMENT_PATH),
    runCommand("git", ["rev-parse", "HEAD"]),
  ]);
  if (gitCommit !== DEPLOYMENT_COMMIT) {
    throw new Error(`Phase 4B must begin from ${DEPLOYMENT_COMMIT}; found ${gitCommit}.`);
  }
  if (wallets.client.address !== CLIENT || wallets.freelancer.address !== FREELANCER) {
    throw new Error("Wallet identity preflight failed.");
  }
  const live = await collectIdentityCheck(deployment);
  if (live.invoiceCount !== 0) {
    throw new Error(`Expected zero invoices before Phase 4B, observed ${live.invoiceCount}.`);
  }
  if (
    live.snapshot.activeFxrpLiabilitiesAtomic !== "0" ||
    BigInt(live.snapshot.contractFxrpAtomic) < BigInt(live.snapshot.activeFxrpLiabilitiesAtomic)
  ) {
    throw new Error("The Phase 4A escrow does not begin the flow with zero liabilities.");
  }
  const requested = fundingRequirement(REQUESTED_USD_TARGET, live.feedValue, live.feedDecimals);
  const adjusted = requested.protectedAmount > MAX_FUNDING_THRESHOLD;
  const selectedTarget = adjusted ? FALLBACK_USD_TARGET : REQUESTED_USD_TARGET;
  const selected = fundingRequirement(selectedTarget, live.feedValue, live.feedDecimals);
  if (selected.protectedAmount > BigInt(live.snapshot.clientFxrpAtomic)) {
    throw new Error("The client lacks enough FXRP for the selected live milestone.");
  }
  const setupGasRequired = BigInt(live.snapshot.freelancerC2flrWei) < GAS_SETUP_THRESHOLD;
  if (setupGasRequired && BigInt(live.snapshot.clientC2flrWei) <= GAS_SETUP_AMOUNT) {
    throw new Error("The client cannot safely provide the required 1 C2FLR setup transfer.");
  }
  const latestBlock = await publicClient.getBlock({ blockNumber: live.latestBlock });
  const deliveryDeadline = latestBlock.timestamp + DELIVERY_WINDOW_SECONDS;
  const targetDisplay = selectedTarget === REQUESTED_USD_TARGET ? "5.00" : "3.00";
  const scopeManifest = {
    chainId: CHAIN_ID,
    client: CLIENT,
    contractAddress: CONTRACT,
    deliveryDeadline: deliveryDeadline.toString(),
    deliveryWindowSeconds: DELIVERY_WINDOW_SECONDS.toString(),
    freelancer: FREELANCER,
    milestoneTitle: MILESTONE_TITLE,
    schemaVersion: 1,
    scope: [
      "deploy ProofPayEscrow on Coston2",
      "verify its deployed runtime bytecode",
      "verify constructor dependencies",
      "provide the deployment transaction and public explorer evidence",
    ],
    targetSelection: {
      adjustedFromFiveUsd: adjusted,
      reason: adjusted
        ? "The live protected $5 funding requirement exceeded 8 FXRP; the bounded demonstration uses $3."
        : null,
    },
    usdTargetAtomic: selectedTarget.toString(),
    usdTargetDisplay: targetDisplay,
  };
  const scopeBytes = canonicalJson(scopeManifest);
  const scopeHash = manifestHash(scopeBytes);
  await mkdir(resolve(REPOSITORY_ROOT, "artifacts"), { recursive: true });
  await writeFile(SCOPE_PATH, scopeBytes, "utf8");
  const now = new Date().toISOString();
  const initialSurplus =
    BigInt(live.snapshot.contractFxrpAtomic) - BigInt(live.snapshot.activeFxrpLiabilitiesAtomic);
  const journal: Journal = {
    schemaVersion: 1,
    phase: "4B",
    chainId: CHAIN_ID,
    contractAddress: CONTRACT,
    client: CLIENT,
    freelancer: FREELANCER,
    currentStep: "PREFLIGHT_COMPLETE",
    invoiceId: null,
    intendedAction: null,
    completionStatus: "IN_PROGRESS",
    executionGitCommit: gitCommit,
    createdAt: now,
    updatedAt: now,
    deploymentIdentity: {
      deploymentTransaction: deployment.deployment.transactionHash,
      deploymentBlock: deployment.deployment.blockNumber,
      runtimeBytecodeHash: deployment.bytecodeVerification.deployedRuntimeBytecodeHash,
      fxrp: getAddress(deployment.dependencies.fxrpAddress),
      ftsoV2: getAddress(deployment.dependencies.ftsoV2Address),
      feedId: deployment.dependencies.xrpUsdFeedId,
      maximumPriceAgeSeconds: 30,
    },
    preflight: {
      status: "PASS",
      checkedAt: now,
      chainId: CHAIN_ID,
      codeExists: true,
      runtimeBytecodeHashMatches: true,
      walletAddressesMatch: true,
      fxrpDecimals: 6,
      currentFtsoFeeWei: "0",
      feed: {
        value: live.feedValue.toString(),
        decimals: live.feedDecimals,
        timestamp: live.feedTimestamp.toString(),
        timestampIso: new Date(asNumber(live.feedTimestamp) * 1_000).toISOString(),
        ageSeconds: asNumber(live.feedAge),
        validAndFresh: true,
      },
      invoiceCount: live.invoiceCount,
      initialSnapshot: live.snapshot,
      initialContractSurplusAtomic: initialSurplus.toString(),
      setupGasRequired,
      targetSelection: {
        requestedUsdTargetAtomic: "5000000",
        selectedUsdTargetAtomic: selectedTarget.toString(),
        requestedFundingRequirementAtomic: requested.protectedAmount.toString(),
        selectedFundingRequirementAtomic: selected.protectedAmount.toString(),
        adjustedToThreeUsd: adjusted,
        reason: scopeManifest.targetSelection.reason,
      },
    },
    scopeManifest: {
      path: "artifacts/live-scope-manifest.json",
      encoding: "UTF-8",
      canonical: true,
      bytesLength: Buffer.byteLength(scopeBytes, "utf8"),
      keccak256: scopeHash,
      usdTargetAtomic: selectedTarget.toString(),
      deliveryDeadline: deliveryDeadline.toString(),
    },
    evidenceManifest: null,
    negativeQuoteProof: null,
    fundingQuote: null,
    releaseQuote: null,
    topUp: null,
    transactions: emptyTransactions(),
    contractState: live.snapshot,
    errors: [],
  };
  await writeJournal(journal);
  console.log(
    `PREFLIGHT PASS targetUSD=${targetDisplay} scopeHash=${scopeHash} setupGas=${setupGasRequired}`,
  );
  return journal;
}

function accountFor(entry: TransactionEntry, wallets: Wallets): PrivateKeyAccount {
  if (entry.from === wallets.client.address) return wallets.client;
  if (entry.from === wallets.freelancer.address) return wallets.freelancer;
  throw new Error(`No approved account matches ${entry.from}.`);
}

function storedReceipt(receipt: TransactionReceipt): StoredReceipt {
  const fee = receipt.gasUsed * receipt.effectiveGasPrice;
  return {
    status: receipt.status,
    blockNumber: receipt.blockNumber.toString(),
    transactionIndex: receipt.transactionIndex,
    gasUsed: receipt.gasUsed.toString(),
    effectiveGasPriceWei: receipt.effectiveGasPrice.toString(),
    totalFeeWei: fee.toString(),
    totalFeeC2flr: formatEther(fee),
  };
}

async function signEntry(entry: TransactionEntry, account: PrivateKeyAccount): Promise<Hex> {
  return await account.signTransaction({
    chainId: CHAIN_ID,
    to: entry.to,
    data: entry.data,
    value: BigInt(entry.valueWei),
    gas: BigInt(entry.gasLimit),
    gasPrice: BigInt(entry.gasPriceWei),
    nonce: entry.nonce,
    type: "legacy",
  });
}

async function reconcileOrSend(
  journal: Journal,
  wallets: Wallets,
  request: ManagedRequest,
): Promise<TransactionReceipt> {
  let entry = journal.transactions[request.action];
  if (entry === null) {
    const before = await readSnapshot(
      journal.invoiceId === null ? null : BigInt(journal.invoiceId),
    );
    const [gasEstimate, gasPrice, nonce, nativeBalance] = await Promise.all([
      publicClient.estimateGas({
        account: request.account.address,
        to: request.to,
        data: request.data,
        value: request.value,
      }),
      publicClient.getGasPrice(),
      publicClient.getTransactionCount({ address: request.account.address, blockTag: "pending" }),
      publicClient.getBalance({ address: request.account.address }),
    ]);
    const gasLimit = ceilDiv(gasEstimate * GAS_LIMIT_NUMERATOR, GAS_LIMIT_DENOMINATOR);
    const maximumGasFee = gasLimit * gasPrice;
    if (nativeBalance < maximumGasFee + request.value) {
      throw new Error(`${request.action} sender lacks enough C2FLR for value plus maximum gas.`);
    }
    entry = {
      action: request.action,
      description: request.description,
      status: "INTENT_RECORDED",
      intendedAt: new Date().toISOString(),
      from: request.account.address,
      to: request.to,
      valueWei: request.value.toString(),
      data: request.data,
      calldataHash: keccak256(request.data),
      functionName: request.functionName,
      parameters: request.parameters,
      simulation: "PASS",
      nonce,
      gasEstimate: gasEstimate.toString(),
      gasLimit: gasLimit.toString(),
      gasPriceWei: gasPrice.toString(),
      maximumGasFeeWei: maximumGasFee.toString(),
      plannedTransactionHash: null,
      broadcastAttemptedAt: null,
      transactionHash: null,
      submittedAt: null,
      receipt: null,
      before,
      after: null,
      observedEvent: null,
    };
    journal.transactions[request.action] = entry;
    journal.intendedAction = request.description;
    journal.currentStep = `${request.action.toUpperCase()}_INTENT_RECORDED`;
    await writeJournal(journal);
  } else if (
    entry.from !== request.account.address ||
    entry.to !== request.to ||
    entry.data !== request.data ||
    entry.valueWei !== request.value.toString()
  ) {
    throw new Error(`Stored ${request.action} intent differs from the reconstructed action.`);
  }

  const account = accountFor(entry, wallets);
  let serialized: Hex | null = null;
  if (entry.plannedTransactionHash === null) {
    const currentNonce = await publicClient.getTransactionCount({
      address: entry.from,
      blockTag: "pending",
    });
    if (currentNonce !== entry.nonce) {
      throw new Error(`${entry.action} nonce changed before signing.`);
    }
    serialized = await signEntry(entry, account);
    entry.plannedTransactionHash = keccak256(serialized);
    entry.status = "SIGNED_READY_TO_SUBMIT";
    await writeJournal(journal);
  }

  const hash = entry.transactionHash ?? entry.plannedTransactionHash;
  if (hash === null) throw new Error(`${entry.action} lacks a planned transaction hash.`);
  let receipt = await publicClient.getTransactionReceipt({ hash }).catch(() => null);
  if (receipt === null && entry.broadcastAttemptedAt === null) {
    if (serialized === null) serialized = await signEntry(entry, account);
    if (keccak256(serialized) !== hash) {
      throw new Error(`${entry.action} reconstructed signed hash differs from its checkpoint.`);
    }
    entry.status = "BROADCAST_ATTEMPTED";
    entry.broadcastAttemptedAt = new Date().toISOString();
    await writeJournal(journal);
    const walletClient = createWalletClient({ account, chain: coston2, transport: rpcTransport });
    const submittedHash = await walletClient.sendRawTransaction({ serializedTransaction: serialized });
    if (submittedHash !== hash) throw new Error(`${entry.action} RPC hash differs from signed hash.`);
    entry.status = "TRANSACTION_SUBMITTED";
    entry.transactionHash = submittedHash;
    entry.submittedAt = new Date().toISOString();
    await writeJournal(journal);
    console.log(`TRANSACTION_SUBMITTED action=${entry.action} hash=${submittedHash}`);
  } else if (receipt === null && entry.broadcastAttemptedAt !== null) {
    const visible = await publicClient.getTransaction({ hash }).catch(() => null);
    if (visible === null) {
      throw new Error(
        `${entry.action} broadcast was attempted but ${hash} is not visible; refusing to rebroadcast.`,
      );
    }
  }
  entry.transactionHash = hash;
  if (receipt === null) {
    receipt = await publicClient.waitForTransactionReceipt({
      hash,
      confirmations: 1,
      timeout: 180_000,
      pollingInterval: 2_000,
    });
  }
  entry.receipt = storedReceipt(receipt);
  entry.status = "RECEIPT_CONFIRMED";
  await writeJournal(journal);
  if (receipt.status !== "success") throw new Error(`${entry.action} transaction reverted.`);
  return receipt;
}

async function simulateExact(account: Address, to: Address, data: Hex, value = 0n): Promise<Hex> {
  const result = await publicClient.call({ account, to, data, value });
  return result.data ?? "0x";
}

function eventArgs(
  receipt: TransactionReceipt,
  eventName: "InvoiceCreated" | "InvoiceFunded" | "EvidenceSubmitted" | "InvoiceToppedUp" | "InvoiceReleased",
): Record<string, unknown> {
  const decoded = parseEventLogs({ abi: proofPayAbi, logs: receipt.logs, strict: true });
  const match = decoded.find((log) => log.eventName === eventName);
  if (match === undefined) throw new Error(`${eventName} was not emitted by the confirmed transaction.`);
  return match.args as Record<string, unknown>;
}

function approvalArgs(receipt: TransactionReceipt): Record<string, unknown> {
  const decoded = parseEventLogs({ abi: erc20Abi, logs: receipt.logs, strict: true });
  const match = decoded.find((log) => log.eventName === "Approval");
  if (match === undefined) throw new Error("Approval was not emitted by the confirmed transaction.");
  return match.args as Record<string, unknown>;
}

async function completeEntry(
  journal: Journal,
  action: ActionName,
  receipt: TransactionReceipt,
  event: Record<string, string | number | boolean | null>,
): Promise<void> {
  const entry = journal.transactions[action];
  if (entry === null) throw new Error(`${action} journal entry disappeared.`);
  const invoiceId = journal.invoiceId === null ? null : BigInt(journal.invoiceId);
  const before = await readSnapshot(invoiceId, receipt.blockNumber - 1n);
  const after = await readSnapshot(invoiceId, receipt.blockNumber);
  entry.before = before;
  entry.after = after;
  entry.observedEvent = event;
  entry.status = "COMPLETE";
  journal.contractState = after;
  journal.intendedAction = null;
  journal.currentStep = `${action.toUpperCase()}_COMPLETE`;
  await writeJournal(journal);
  console.log(`ACTION_COMPLETE action=${action} hash=${receipt.transactionHash}`);
}

async function ensureSetupGas(journal: Journal, wallets: Wallets): Promise<void> {
  if (!journal.preflight.setupGasRequired) {
    journal.currentStep = "GAS_READY";
    journal.contractState = await readSnapshot(journal.invoiceId === null ? null : BigInt(journal.invoiceId));
    await writeJournal(journal);
    return;
  }
  const existing = journal.transactions.setupGas;
  if (existing?.status === "COMPLETE") return;
  if (existing === null) await simulateExact(CLIENT, FREELANCER, "0x", GAS_SETUP_AMOUNT);
  const receipt = await reconcileOrSend(journal, wallets, {
    account: wallets.client,
    action: "setupGas",
    description: "Transfer exactly 1 C2FLR from client to freelancer for Phase 4B gas",
    to: FREELANCER,
    data: "0x",
    value: GAS_SETUP_AMOUNT,
    functionName: "nativeTransfer",
    parameters: { amountWei: GAS_SETUP_AMOUNT.toString(), amountC2flr: "1" },
  });
  if (journal.transactions.setupGas?.status !== "COMPLETE") {
    const transaction = await publicClient.getTransaction({ hash: receipt.transactionHash });
    if (
      getAddress(transaction.from) !== CLIENT ||
      transaction.to === null ||
      getAddress(transaction.to) !== FREELANCER ||
      transaction.value !== GAS_SETUP_AMOUNT
    ) {
      throw new Error("The confirmed setup transfer differs from the 1 C2FLR intent.");
    }
    const before = await readSnapshot(null, receipt.blockNumber - 1n);
    const after = await readSnapshot(null, receipt.blockNumber);
    const fee = receipt.gasUsed * receipt.effectiveGasPrice;
    if (
      BigInt(after.freelancerC2flrWei) - BigInt(before.freelancerC2flrWei) !== GAS_SETUP_AMOUNT ||
      BigInt(before.clientC2flrWei) - BigInt(after.clientC2flrWei) !== GAS_SETUP_AMOUNT + fee
    ) {
      throw new Error("The setup C2FLR balance deltas do not reconcile with value plus gas.");
    }
    await completeEntry(journal, "setupGas", receipt, {
      amountWei: GAS_SETUP_AMOUNT.toString(),
      amountC2flr: "1",
      recipientIncreaseWei: GAS_SETUP_AMOUNT.toString(),
      senderDecreaseWei: (GAS_SETUP_AMOUNT + fee).toString(),
    });
  }
}

async function ensureCreate(journal: Journal, wallets: Wallets): Promise<void> {
  const existing = journal.transactions.create;
  if (existing?.status === "COMPLETE") {
    if (journal.invoiceId === null) throw new Error("Completed creation lacks an invoice ID.");
    return;
  }
  const deadline = BigInt(journal.scopeManifest.deliveryDeadline);
  const usdTarget = BigInt(journal.scopeManifest.usdTargetAtomic);
  const data = encodeFunctionData({
    abi: proofPayAbi,
    functionName: "createInvoice",
    args: [CLIENT, usdTarget, deadline, journal.scopeManifest.keccak256],
  });
  if (existing === null) {
    const returned = await simulateExact(FREELANCER, CONTRACT, data);
    const [simulatedInvoiceId] = decodeAbiParameters([{ type: "uint256" }], returned);
    if (simulatedInvoiceId !== 1n) {
      throw new Error(`Fresh Phase 4B creation simulated invoice ${simulatedInvoiceId}, not 1.`);
    }
  }
  const receipt = await reconcileOrSend(journal, wallets, {
    account: wallets.freelancer,
    action: "create",
    description: "Create the single Phase 4B ProofPay invoice",
    to: CONTRACT,
    data,
    value: 0n,
    functionName: "createInvoice",
    parameters: {
      client: CLIENT,
      usdTargetAtomic: usdTarget.toString(),
      deliveryDeadline: deadline.toString(),
      scopeHash: journal.scopeManifest.keccak256,
    },
  });
  if (journal.transactions.create?.status !== "COMPLETE") {
    const args = eventArgs(receipt, "InvoiceCreated");
    const invoiceId = BigInt(String(args.invoiceId));
    if (
      invoiceId !== 1n ||
      getAddress(String(args.freelancer)) !== FREELANCER ||
      getAddress(String(args.client)) !== CLIENT ||
      BigInt(String(args.usdTarget)) !== usdTarget ||
      BigInt(String(args.deliveryDeadline)) !== deadline ||
      String(args.scopeHash).toLowerCase() !== journal.scopeManifest.keccak256
    ) {
      throw new Error("InvoiceCreated values differ from the checkpointed scope intent.");
    }
    journal.invoiceId = invoiceId.toString();
    await completeEntry(journal, "create", receipt, {
      invoiceId: invoiceId.toString(),
      freelancer: FREELANCER,
      client: CLIENT,
      usdTargetAtomic: usdTarget.toString(),
      deliveryDeadline: deadline.toString(),
      scopeHash: journal.scopeManifest.keccak256,
    });
    const state = journal.contractState.invoice;
    if (
      state === null ||
      state.statusName !== "CREATED" ||
      state.fxrpLocked !== "0" ||
      journal.contractState.activeFxrpLiabilitiesAtomic !== "0"
    ) {
      throw new Error("The created invoice or liabilities do not match the CREATED checkpoint.");
    }
  }
}

function extractRpcErrorData(error: unknown): Hex | undefined {
  const visited = new Set<unknown>();
  function visit(value: unknown): Hex | undefined {
    if (visited.has(value)) return undefined;
    if (typeof value === "string" && /^0x[0-9a-fA-F]+$/.test(value)) return value as Hex;
    if (!isObject(value)) return undefined;
    visited.add(value);
    for (const key of ["data", "cause", "error", "details"]) {
      const found = visit(value[key]);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  return visit(error);
}

async function ensureNegativeQuote(journal: Journal): Promise<void> {
  if (journal.negativeQuoteProof !== null) return;
  if (journal.invoiceId === null) throw new Error("Negative quote proof requires an invoice ID.");
  const block = await publicClient.getBlock({ blockTag: "latest" });
  const expired = block.timestamp - 1n;
  const data = encodeFunctionData({
    abi: proofPayAbi,
    functionName: "fundInvoice",
    args: [BigInt(journal.invoiceId), 1n, expired],
  });
  const before = await readSnapshot(BigInt(journal.invoiceId), block.number);
  let actualData: Hex | undefined;
  try {
    await publicClient.call({ account: CLIENT, to: CONTRACT, data, blockNumber: block.number });
  } catch (error) {
    actualData = extractRpcErrorData(error);
  }
  if (actualData === undefined) throw new Error("Expired fundInvoice simulation did not revert.");
  const decoded = decodeErrorResult({ abi: proofPayAbi, data: actualData });
  if (decoded.errorName !== "ExpiredQuote") {
    throw new Error(`Expired fundInvoice returned ${decoded.errorName}, not ExpiredQuote.`);
  }
  const decodedArgs = decoded.args;
  if (decodedArgs === undefined || BigInt(String(decodedArgs[0])) !== expired) {
    throw new Error("ExpiredQuote decoded arguments differ from the simulation input.");
  }
  const expected = encodeErrorResult({
    abi: proofPayAbi,
    errorName: "ExpiredQuote",
    args: [expired, block.timestamp],
  });
  if (actualData !== expected) throw new Error("ExpiredQuote error data differs from expected data.");
  const after = await readSnapshot(BigInt(journal.invoiceId), block.number);
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    throw new Error("Read-only negative quote simulation changed observed state.");
  }
  journal.negativeQuoteProof = {
    status: "PASS",
    simulatedAt: new Date().toISOString(),
    blockNumber: block.number.toString(),
    invoiceId: journal.invoiceId,
    expiredQuoteDeadline: expired.toString(),
    maximumFxrpAtomic: "1",
    expectedError: "ExpiredQuote(uint64,uint256)",
    expectedErrorData: expected,
    actualError: {
      name: "ExpiredQuote",
      quoteDeadline: String(decodedArgs[0]),
      currentTimestamp: String(decodedArgs[1]),
    },
    actualErrorData: actualData,
    transactionSent: false,
    stateAndBalancesUnchanged: true,
    before,
    after,
  };
  journal.currentStep = "NEGATIVE_QUOTE_PROOF_COMPLETE";
  await writeJournal(journal);
}

async function collectFundingQuote(journal: Journal): Promise<QuoteRecord> {
  if (journal.invoiceId === null) throw new Error("Funding quote requires an invoice ID.");
  const block = await publicClient.getBlock({ blockTag: "latest" });
  const data = encodeFunctionData({
    abi: proofPayAbi,
    functionName: "quoteFunding",
    args: [BigInt(journal.invoiceId)],
  });
  const result = await publicClient.call({ account: CLIENT, to: CONTRACT, data, blockNumber: block.number });
  if (result.data === undefined || result.data === "0x") throw new Error("quoteFunding returned no data.");
  const [required, price, decimals, timestamp] = decodeAbiParameters(
    [{ type: "uint256" }, { type: "uint256" }, { type: "int8" }, { type: "uint64" }],
    result.data,
  );
  const math = fundingRequirement(BigInt(journal.scopeManifest.usdTargetAtomic), price, decimals);
  if (required !== math.protectedAmount) throw new Error("quoteFunding differs from independent math.");
  if (required > MAX_FUNDING_THRESHOLD) {
    throw new Error("The final protected funding quote exceeds the bounded 8 FXRP demonstration limit.");
  }
  const maximum = ceilDiv(required * 102n, 100n);
  const age = block.timestamp - timestamp;
  if (age < 0n || age >= 30n) throw new Error("quoteFunding returned a stale observation.");
  return {
    simulatedAt: new Date().toISOString(),
    blockNumber: block.number.toString(),
    price: price.toString(),
    priceDecimals: decimals,
    priceTimestamp: timestamp.toString(),
    priceTimestampIso: new Date(asNumber(timestamp) * 1_000).toISOString(),
    feedAgeSeconds: asNumber(age),
    requiredBaseFxrpAtomic: math.base.toString(),
    protectionFxrpAtomic: (required - math.base).toString(),
    totalFundingRequirementAtomic: required.toString(),
    transactionToleranceBps: 200,
    clientMaximumFxrpAtomic: maximum.toString(),
    quoteDeadline: (block.timestamp + QUOTE_WINDOW_SECONDS).toString(),
    independentMathMatch: true,
  };
}

async function ensureFundingApproval(journal: Journal, wallets: Wallets): Promise<void> {
  if (journal.fundingQuote === null) {
    journal.fundingQuote = await collectFundingQuote(journal);
    journal.currentStep = "FUNDING_QUOTE_COMPLETE";
    await writeJournal(journal);
  }
  const maximum = BigInt(journal.fundingQuote.clientMaximumFxrpAtomic);
  const existing = journal.transactions.approveFunding;
  if (existing?.status === "COMPLETE") return;
  const allowance = await publicClient.readContract({
    address: journal.deploymentIdentity.fxrp,
    abi: erc20Abi,
    functionName: "allowance",
    args: [CLIENT, CONTRACT],
  });
  if (allowance === maximum && existing === null) {
    throw new Error("A pre-existing exact allowance would omit the required Phase 4B approval receipt.");
  }
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: "approve",
    args: [CONTRACT, maximum],
  });
  if (existing === null) await simulateExact(CLIENT, journal.deploymentIdentity.fxrp, data);
  const receipt = await reconcileOrSend(journal, wallets, {
    account: wallets.client,
    action: "approveFunding",
    description: "Approve the exact 2%-tolerant maximum for valid invoice funding",
    to: journal.deploymentIdentity.fxrp,
    data,
    value: 0n,
    functionName: "approve",
    parameters: { spender: CONTRACT, amountAtomic: maximum.toString() },
  });
  if (journal.transactions.approveFunding?.status !== "COMPLETE") {
    const args = approvalArgs(receipt);
    if (
      getAddress(String(args.owner)) !== CLIENT ||
      getAddress(String(args.spender)) !== CONTRACT ||
      BigInt(String(args.value)) !== maximum
    ) {
      throw new Error("Funding Approval event differs from the intended exact maximum.");
    }
    const confirmedAllowance = await publicClient.readContract({
      address: journal.deploymentIdentity.fxrp,
      abi: erc20Abi,
      functionName: "allowance",
      args: [CLIENT, CONTRACT],
      blockNumber: receipt.blockNumber,
    });
    if (confirmedAllowance !== maximum) throw new Error("Confirmed funding allowance is not exact.");
    await completeEntry(journal, "approveFunding", receipt, {
      owner: CLIENT,
      spender: CONTRACT,
      valueAtomic: maximum.toString(),
      confirmedAllowanceAtomic: confirmedAllowance.toString(),
    });
  }
}

async function ensureFunding(journal: Journal, wallets: Wallets): Promise<void> {
  if (journal.invoiceId === null || journal.fundingQuote === null) {
    throw new Error("Funding requires an invoice and a persisted quote.");
  }
  const existing = journal.transactions.fund;
  if (existing?.status === "COMPLETE") return;
  const maximum = BigInt(journal.fundingQuote.clientMaximumFxrpAtomic);
  const deadline =
    existing === null
      ? (await publicClient.getBlock({ blockTag: "latest" })).timestamp + QUOTE_WINDOW_SECONDS
      : BigInt(String(existing.parameters.quoteDeadline));
  const data =
    existing?.data ??
    encodeFunctionData({
      abi: proofPayAbi,
      functionName: "fundInvoice",
      args: [BigInt(journal.invoiceId), maximum, deadline],
    });
  if (existing === null) await simulateExact(CLIENT, CONTRACT, data);
  const receipt = await reconcileOrSend(journal, wallets, {
    account: wallets.client,
    action: "fund",
    description: "Fund the single Phase 4B invoice with real test FXRP",
    to: CONTRACT,
    data,
    value: 0n,
    functionName: "fundInvoice",
    parameters: {
      invoiceId: journal.invoiceId,
      maximumFxrpAtomic: maximum.toString(),
      quoteDeadline: deadline.toString(),
    },
  });
  if (journal.transactions.fund?.status !== "COMPLETE") {
    const args = eventArgs(receipt, "InvoiceFunded");
    const locked = BigInt(String(args.fxrpLocked));
    if (BigInt(String(args.invoiceId)) !== BigInt(journal.invoiceId)) {
      throw new Error("InvoiceFunded identifies the wrong invoice.");
    }
    const before = await readSnapshot(BigInt(journal.invoiceId), receipt.blockNumber - 1n);
    const after = await readSnapshot(BigInt(journal.invoiceId), receipt.blockNumber);
    if (
      BigInt(before.clientFxrpAtomic) - BigInt(after.clientFxrpAtomic) !== locked ||
      BigInt(after.contractFxrpAtomic) - BigInt(before.contractFxrpAtomic) !== locked ||
      after.invoice?.statusName !== "FUNDED" ||
      after.invoice.fxrpLocked !== locked.toString() ||
      BigInt(after.activeFxrpLiabilitiesAtomic) - BigInt(before.activeFxrpLiabilitiesAtomic) !== locked
    ) {
      throw new Error("Funding balance, lock, liability, or state deltas do not reconcile.");
    }
    await completeEntry(journal, "fund", receipt, {
      invoiceId: journal.invoiceId,
      exactFxrpPulledAtomic: locked.toString(),
      fundingPrice: String(args.price),
      fundingPriceDecimals: Number(args.priceDecimals),
      fundingPriceTimestamp: String(args.priceTimestamp),
      contractFxrpAfterAtomic: after.contractFxrpAtomic,
      activeLiabilitiesAfterAtomic: after.activeFxrpLiabilitiesAtomic,
      state: "FUNDED",
    });
  }
}

async function ensureEvidenceManifest(journal: Journal, deployment: DeploymentRecord): Promise<void> {
  if (journal.evidenceManifest !== null) return;
  const evidenceManifest = {
    completionNote:
      "ProofPayEscrow was deployed, runtime-bytecode matched, constructor dependencies matched, and public explorer evidence was preserved on Coston2.",
    constructorDependencies: {
      ftsoV2: journal.deploymentIdentity.ftsoV2,
      fxrp: journal.deploymentIdentity.fxrp,
      maximumPriceAgeSeconds: journal.deploymentIdentity.maximumPriceAgeSeconds,
      xrpUsdFeedId: journal.deploymentIdentity.feedId,
    },
    deployedContractAddress: CONTRACT,
    deploymentBlock: journal.deploymentIdentity.deploymentBlock,
    deploymentCommit: DEPLOYMENT_COMMIT,
    deploymentTransaction: journal.deploymentIdentity.deploymentTransaction,
    milestoneTitle: MILESTONE_TITLE,
    runtimeBytecodeHash: journal.deploymentIdentity.runtimeBytecodeHash,
    schemaVersion: 1,
    verifiedExplorerUrl: deployment.explorer.contract,
  };
  const bytes = canonicalJson(evidenceManifest);
  const hash = manifestHash(bytes);
  await writeFile(EVIDENCE_PATH, bytes, "utf8");
  journal.evidenceManifest = {
    path: "artifacts/live-evidence-manifest.json",
    encoding: "UTF-8",
    canonical: true,
    bytesLength: Buffer.byteLength(bytes, "utf8"),
    keccak256: hash,
    evidenceUri: deployment.explorer.contract,
  };
  journal.currentStep = "EVIDENCE_MANIFEST_COMPLETE";
  await writeJournal(journal);
}

async function ensureEvidence(journal: Journal, wallets: Wallets): Promise<void> {
  if (journal.invoiceId === null || journal.evidenceManifest === null) {
    throw new Error("Evidence submission requires invoice and manifest checkpoints.");
  }
  const existing = journal.transactions.evidence;
  if (existing?.status === "COMPLETE") return;
  const data = encodeFunctionData({
    abi: proofPayAbi,
    functionName: "submitEvidence",
    args: [
      BigInt(journal.invoiceId),
      journal.evidenceManifest.keccak256,
      journal.evidenceManifest.evidenceUri,
    ],
  });
  if (existing === null) await simulateExact(FREELANCER, CONTRACT, data);
  const receipt = await reconcileOrSend(journal, wallets, {
    account: wallets.freelancer,
    action: "evidence",
    description: "Submit deterministic Phase 4B deployment evidence",
    to: CONTRACT,
    data,
    value: 0n,
    functionName: "submitEvidence",
    parameters: {
      invoiceId: journal.invoiceId,
      evidenceHash: journal.evidenceManifest.keccak256,
      evidenceUri: journal.evidenceManifest.evidenceUri,
    },
  });
  if (journal.transactions.evidence?.status !== "COMPLETE") {
    const args = eventArgs(receipt, "EvidenceSubmitted");
    const before = await readSnapshot(BigInt(journal.invoiceId), receipt.blockNumber - 1n);
    const after = await readSnapshot(BigInt(journal.invoiceId), receipt.blockNumber);
    if (
      BigInt(String(args.invoiceId)) !== BigInt(journal.invoiceId) ||
      String(args.evidenceHash).toLowerCase() !== journal.evidenceManifest.keccak256 ||
      String(args.evidenceURI) !== journal.evidenceManifest.evidenceUri ||
      after.invoice?.statusName !== "SUBMITTED" ||
      after.invoice.evidenceHash.toLowerCase() !== journal.evidenceManifest.keccak256 ||
      after.invoice.fxrpLocked !== before.invoice?.fxrpLocked ||
      after.activeFxrpLiabilitiesAtomic !== before.activeFxrpLiabilitiesAtomic
    ) {
      throw new Error("Evidence event, stored hash, state, lock, or liabilities do not reconcile.");
    }
    await completeEntry(journal, "evidence", receipt, {
      invoiceId: journal.invoiceId,
      evidenceHash: journal.evidenceManifest.keccak256,
      evidenceUri: journal.evidenceManifest.evidenceUri,
      state: "SUBMITTED",
      lockedFxrpUnchanged: true,
      liabilitiesUnchanged: true,
    });
  }
}

async function collectReleaseQuote(journal: Journal): Promise<ReleaseQuoteRecord> {
  if (journal.invoiceId === null) throw new Error("Release quote requires an invoice ID.");
  const block = await publicClient.getBlock({ blockTag: "latest" });
  const data = encodeFunctionData({
    abi: proofPayAbi,
    functionName: "quoteRelease",
    args: [BigInt(journal.invoiceId)],
  });
  const result = await publicClient.call({ account: CLIENT, to: CONTRACT, data, blockNumber: block.number });
  if (result.data === undefined || result.data === "0x") throw new Error("quoteRelease returned no data.");
  const [payout, refund, topUp, price, decimals, timestamp] = decodeAbiParameters(
    [
      { type: "uint256" },
      { type: "uint256" },
      { type: "uint256" },
      { type: "uint256" },
      { type: "int8" },
      { type: "uint64" },
    ],
    result.data,
  );
  const snapshot = await readSnapshot(BigInt(journal.invoiceId), block.number);
  if (snapshot.invoice === null) throw new Error("Release quote invoice state is missing.");
  const locked = BigInt(snapshot.invoice.fxrpLocked);
  if (topUp === 0n ? payout + refund !== locked : refund !== 0n || payout - locked !== topUp) {
    throw new Error("quoteRelease values do not reconcile with the stored lock.");
  }
  const age = block.timestamp - timestamp;
  if (age < 0n || age >= 30n) throw new Error("quoteRelease returned a stale observation.");
  const guardedMaximum = ceilDiv(payout * 102n, 100n);
  const releaseMaximum = guardedMaximum < locked ? guardedMaximum : locked;
  return {
    simulatedAt: new Date().toISOString(),
    blockNumber: block.number.toString(),
    price: price.toString(),
    priceDecimals: decimals,
    priceTimestamp: timestamp.toString(),
    priceTimestampIso: new Date(asNumber(timestamp) * 1_000).toISOString(),
    feedAgeSeconds: asNumber(age),
    requiredFreelancerPayoutAtomic: payout.toString(),
    lockedFxrpAtomic: locked.toString(),
    expectedClientRefundAtomic: refund.toString(),
    topUpRequiredAtomic: topUp.toString(),
    releaseMaximumAtomic: releaseMaximum.toString(),
    quoteDeadline: (block.timestamp + QUOTE_WINDOW_SECONDS).toString(),
  };
}

async function ensureTopUp(journal: Journal, wallets: Wallets): Promise<void> {
  // A release intent can only be created after this branch completed. On restart,
  // do not call quoteRelease against an already-released invoice before reconciling it.
  if (journal.transactions.release !== null) return;
  const resumingTopUp =
    journal.transactions.approveTopUp !== null || journal.transactions.topUp !== null;
  if (!resumingTopUp) {
    journal.releaseQuote = await collectReleaseQuote(journal);
    const quotedTopUp = BigInt(journal.releaseQuote.topUpRequiredAtomic);
    journal.topUp = {
      required: quotedTopUp > 0n,
      amountAtomic: quotedTopUp.toString(),
      completed: false,
    };
    journal.currentStep = "RELEASE_QUOTE_COMPLETE";
    await writeJournal(journal);
  }
  if (journal.topUp === null) throw new Error("Top-up branch checkpoint is missing.");
  const topUpAmount = BigInt(journal.topUp.amountAtomic);
  if (topUpAmount === 0n) {
    journal.topUp.completed = true;
    journal.currentStep = "TOP_UP_NOT_REQUIRED";
    await writeJournal(journal);
    return;
  }
  if (journal.invoiceId === null) throw new Error("Top-up requires an invoice ID.");
  const clientBalance = await publicClient.readContract({
    address: journal.deploymentIdentity.fxrp,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [CLIENT],
  });
  if (clientBalance < topUpAmount) throw new Error("Client lacks the exact required FXRP top-up.");

  const approveData = encodeFunctionData({
    abi: erc20Abi,
    functionName: "approve",
    args: [CONTRACT, topUpAmount],
  });
  if (journal.transactions.approveTopUp === null) {
    await simulateExact(CLIENT, journal.deploymentIdentity.fxrp, approveData);
  }
  const approveReceipt = await reconcileOrSend(journal, wallets, {
    account: wallets.client,
    action: "approveTopUp",
    description: "Approve only the exact required release top-up",
    to: journal.deploymentIdentity.fxrp,
    data: approveData,
    value: 0n,
    functionName: "approve",
    parameters: { spender: CONTRACT, amountAtomic: topUpAmount.toString() },
  });
  if (journal.transactions.approveTopUp?.status !== "COMPLETE") {
    const args = approvalArgs(approveReceipt);
    if (BigInt(String(args.value)) !== topUpAmount) throw new Error("Top-up approval is not exact.");
    await completeEntry(journal, "approveTopUp", approveReceipt, {
      owner: CLIENT,
      spender: CONTRACT,
      valueAtomic: topUpAmount.toString(),
    });
  }

  const existingTopUp = journal.transactions.topUp;
  const deadline =
    existingTopUp === null
      ? (await publicClient.getBlock({ blockTag: "latest" })).timestamp + QUOTE_WINDOW_SECONDS
      : BigInt(String(existingTopUp.parameters.quoteDeadline));
  const topUpData =
    existingTopUp?.data ??
    encodeFunctionData({
      abi: proofPayAbi,
      functionName: "topUp",
      args: [BigInt(journal.invoiceId), topUpAmount, deadline],
    });
  if (journal.transactions.topUp === null) await simulateExact(CLIENT, CONTRACT, topUpData);
  const topUpReceipt = await reconcileOrSend(journal, wallets, {
    account: wallets.client,
    action: "topUp",
    description: "Top up only the exact current release shortfall",
    to: CONTRACT,
    data: topUpData,
    value: 0n,
    functionName: "topUp",
    parameters: {
      invoiceId: journal.invoiceId,
      maximumTopUpAtomic: topUpAmount.toString(),
      quoteDeadline: deadline.toString(),
    },
  });
  if (journal.transactions.topUp?.status !== "COMPLETE") {
    const args = eventArgs(topUpReceipt, "InvoiceToppedUp");
    if (BigInt(String(args.amount)) !== topUpAmount) throw new Error("Actual top-up differs from quote.");
    await completeEntry(journal, "topUp", topUpReceipt, {
      invoiceId: journal.invoiceId,
      amountAtomic: String(args.amount),
      newFxrpLockedAtomic: String(args.newFxrpLocked),
      price: String(args.price),
      priceDecimals: Number(args.priceDecimals),
      priceTimestamp: String(args.priceTimestamp),
    });
  }
  journal.topUp.completed = true;
  journal.releaseQuote = await collectReleaseQuote(journal);
  if (journal.releaseQuote.topUpRequiredAtomic !== "0") {
    throw new Error("A further top-up is required after the single exact top-up; reconciliation needed.");
  }
  await writeJournal(journal);
}

async function ensureRelease(journal: Journal, wallets: Wallets): Promise<void> {
  if (journal.invoiceId === null || journal.releaseQuote === null || journal.topUp === null) {
    throw new Error("Release requires persisted quote and top-up branch evidence.");
  }
  const existing = journal.transactions.release;
  if (existing?.status === "COMPLETE") return;
  if (!journal.topUp.completed || journal.releaseQuote.topUpRequiredAtomic !== "0") {
    throw new Error("Release is blocked until the current quote needs no top-up.");
  }
  if (existing === null) {
    const freshQuote = await collectReleaseQuote(journal);
    if (freshQuote.topUpRequiredAtomic !== "0") {
      throw new Error("Price movement introduced a new top-up requirement before release.");
    }
    journal.releaseQuote = freshQuote;
    await writeJournal(journal);
  }
  const maximum =
    existing === null
      ? BigInt(journal.releaseQuote.releaseMaximumAtomic)
      : BigInt(String(existing.parameters.maximumPayoutFxrpAtomic));
  const deadline =
    existing === null
      ? BigInt(journal.releaseQuote.quoteDeadline)
      : BigInt(String(existing.parameters.quoteDeadline));
  const data =
    existing?.data ??
    encodeFunctionData({
      abi: proofPayAbi,
      functionName: "release",
      args: [BigInt(journal.invoiceId), maximum, deadline],
    });
  if (existing === null) await simulateExact(CLIENT, CONTRACT, data);
  const receipt = await reconcileOrSend(journal, wallets, {
    account: wallets.client,
    action: "release",
    description: "Release the single submitted Phase 4B invoice",
    to: CONTRACT,
    data,
    value: 0n,
    functionName: "release",
    parameters: {
      invoiceId: journal.invoiceId,
      maximumPayoutFxrpAtomic: maximum.toString(),
      quoteDeadline: deadline.toString(),
    },
  });
  if (journal.transactions.release?.status !== "COMPLETE") {
    const args = eventArgs(receipt, "InvoiceReleased");
    const payout = BigInt(String(args.freelancerPayout));
    const refund = BigInt(String(args.clientRefund));
    const before = await readSnapshot(BigInt(journal.invoiceId), receipt.blockNumber - 1n);
    const after = await readSnapshot(BigInt(journal.invoiceId), receipt.blockNumber);
    const locked = BigInt(before.invoice?.fxrpLocked ?? "0");
    const initialSurplus = BigInt(journal.preflight.initialContractSurplusAtomic);
    if (
      payout + refund !== locked ||
      BigInt(after.freelancerFxrpAtomic) - BigInt(before.freelancerFxrpAtomic) !== payout ||
      BigInt(after.clientFxrpAtomic) - BigInt(before.clientFxrpAtomic) !== refund ||
      BigInt(before.contractFxrpAtomic) - BigInt(after.contractFxrpAtomic) !== locked ||
      after.invoice?.statusName !== "RELEASED" ||
      after.activeFxrpLiabilitiesAtomic !== "0" ||
      BigInt(after.contractFxrpAtomic) !== initialSurplus
    ) {
      throw new Error("Release payout, refund, balances, state, surplus, or liabilities do not reconcile.");
    }
    await completeEntry(journal, "release", receipt, {
      invoiceId: journal.invoiceId,
      freelancerPayoutAtomic: payout.toString(),
      clientRefundAtomic: refund.toString(),
      releasePrice: String(args.price),
      releasePriceDecimals: Number(args.priceDecimals),
      releasePriceTimestamp: String(args.priceTimestamp),
      priorLockedFxrpAtomic: locked.toString(),
      payoutPlusRefundEqualsPriorLock: true,
      state: "RELEASED",
      finalLiabilitiesAtomic: "0",
      finalContractSurplusAtomic: after.contractFxrpAtomic,
    });
  }
}

function confirmedHash(journal: Journal, action: ActionName): Hash | null {
  return journal.transactions[action]?.transactionHash ?? null;
}

async function writeSettlementReceipt(journal: Journal): Promise<void> {
  if (
    journal.invoiceId === null ||
    journal.evidenceManifest === null ||
    journal.fundingQuote === null ||
    journal.releaseQuote === null
  ) {
    throw new Error("Cannot write settlement receipt from incomplete journal evidence.");
  }
  const invoice = journal.contractState.invoice;
  const funded = journal.transactions.fund?.observedEvent ?? null;
  const released = journal.transactions.release?.observedEvent ?? null;
  if (invoice === null || funded === null || released === null) {
    throw new Error("Receipt requires confirmed funding and release observations.");
  }
  const txLink = (hash: Hash | null): string | null =>
    hash === null ? null : `${EXPLORER_URL}/tx/${hash}`;
  const creationTimestamp = journal.transactions.create?.after?.blockTimestamp;
  if (creationTimestamp === undefined) throw new Error("Receipt requires a creation block timestamp.");
  const receipt = {
    schemaVersion: 1,
    phase: "4B",
    network: { name: "Flare Testnet Coston2", chainId: CHAIN_ID, testnet: true },
    invoice: {
      invoiceId: journal.invoiceId,
      milestoneTitle: MILESTONE_TITLE,
      usdTargetAtomic: journal.scopeManifest.usdTargetAtomic,
      usdTargetDisplay:
        journal.scopeManifest.usdTargetAtomic === "5000000"
          ? "5.00"
          : journal.scopeManifest.usdTargetAtomic === "3000000"
            ? "3.00"
            : formatUnits(BigInt(journal.scopeManifest.usdTargetAtomic), 6),
      freelancer: FREELANCER,
      client: CLIENT,
      creationBlockTimestamp: creationTimestamp,
      deliveryDeadline: journal.scopeManifest.deliveryDeadline,
      requestedDeliveryWindowSeconds: DELIVERY_WINDOW_SECONDS.toString(),
      observedSecondsFromCreationToDeadline: (
        BigInt(journal.scopeManifest.deliveryDeadline) - BigInt(creationTimestamp)
      ).toString(),
      scopeHash: journal.scopeManifest.keccak256,
      evidenceHash: journal.evidenceManifest.keccak256,
      evidenceUri: journal.evidenceManifest.evidenceUri,
    },
    settlement: {
      fundingPrice: String(funded.fundingPrice),
      fundingPriceDecimals: Number(funded.fundingPriceDecimals),
      fundingPriceTimestamp: String(funded.fundingPriceTimestamp),
      releasePrice: String(released.releasePrice),
      releasePriceDecimals: Number(released.releasePriceDecimals),
      releasePriceTimestamp: String(released.releasePriceTimestamp),
      fxrpLockedAtomic: String(released.priorLockedFxrpAtomic),
      fxrpPaidAtomic: String(released.freelancerPayoutAtomic),
      fxrpRefundedAtomic: String(released.clientRefundAtomic),
      topUpAtomic: journal.topUp?.amountAtomic ?? "0",
      payoutPlusRefundEqualsPriorLock: true,
    },
    contract: {
      address: CONTRACT,
      deploymentTransaction: journal.deploymentIdentity.deploymentTransaction,
      runtimeBytecodeHash: journal.deploymentIdentity.runtimeBytecodeHash,
      fxrp: journal.deploymentIdentity.fxrp,
      ftsoV2: journal.deploymentIdentity.ftsoV2,
      feedId: journal.deploymentIdentity.feedId,
    },
    transactions: {
      setupGas: confirmedHash(journal, "setupGas"),
      create: confirmedHash(journal, "create"),
      approval: confirmedHash(journal, "approveFunding"),
      funding: confirmedHash(journal, "fund"),
      evidence: confirmedHash(journal, "evidence"),
      topUpApproval: confirmedHash(journal, "approveTopUp"),
      topUp: confirmedHash(journal, "topUp"),
      release: confirmedHash(journal, "release"),
    },
    transactionReceipts: Object.fromEntries(
      Object.entries(journal.transactions).map(([action, entry]) => [
        action,
        entry === null
          ? null
          : {
              hash: entry.transactionHash,
              receipt: entry.receipt,
              event: entry.observedEvent,
            },
      ]),
    ),
    explorerLinks: {
      contract: `${EXPLORER_URL}/address/${CONTRACT}`,
      create: txLink(confirmedHash(journal, "create")),
      approval: txLink(confirmedHash(journal, "approveFunding")),
      funding: txLink(confirmedHash(journal, "fund")),
      evidence: txLink(confirmedHash(journal, "evidence")),
      topUp: txLink(confirmedHash(journal, "topUp")),
      release: txLink(confirmedHash(journal, "release")),
    },
    balances: {
      initial: journal.preflight.initialSnapshot,
      beforeFunding: journal.transactions.fund?.before ?? null,
      afterFunding: journal.transactions.fund?.after ?? null,
      beforeRelease: journal.transactions.release?.before ?? null,
      final: journal.contractState,
      initialContractSurplusAtomic: journal.preflight.initialContractSurplusAtomic,
    },
    final: {
      invoiceState: invoice.statusName,
      activeFxrpLiabilitiesAtomic: journal.contractState.activeFxrpLiabilitiesAtomic,
      contractFxrpBalanceAtomic: journal.contractState.contractFxrpAtomic,
    },
    manifests: {
      scope: journal.scopeManifest,
      evidence: journal.evidenceManifest,
    },
    currentGitCommit: journal.executionGitCommit,
    executionGitCommit: journal.executionGitCommit,
    classifications: {
      observedOnchain: [
        "successful transaction receipts and emitted lifecycle events",
        "stored invoice terms, price observations, evidence hash, and RELEASED state",
        "FXRP balance deltas and zero final active liabilities",
      ],
      inferred: [
        "the canonical scope and evidence files correspond to their onchain keccak256 commitments",
        "the public explorer URI is useful delivery evidence because the client explicitly approved release",
      ],
      mvpLimitations: [
        "Coston2 testnet only; test FXRP and C2FLR have no represented fiat value",
        "not audited or production-ready and not legal escrow",
        "no arbitration, automatic release, fiat settlement, or guaranteed USD stability",
      ],
    },
  };
  await writeFile(RECEIPT_PATH, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
}

async function assertResumeIdentity(journal: Journal, deployment: DeploymentRecord): Promise<void> {
  if (
    journal.chainId !== CHAIN_ID ||
    journal.contractAddress !== CONTRACT ||
    journal.client !== CLIENT ||
    journal.freelancer !== FREELANCER ||
    journal.deploymentIdentity.runtimeBytecodeHash !==
      deployment.bytecodeVerification.deployedRuntimeBytecodeHash
  ) {
    throw new Error("The durable journal identity differs from Phase 4A deployment evidence.");
  }
  const scopeBytes = await readFile(SCOPE_PATH, "utf8");
  if (
    manifestHash(scopeBytes) !== journal.scopeManifest.keccak256 ||
    scopeBytes !== canonicalJson(JSON.parse(scopeBytes))
  ) {
    throw new Error("The canonical scope manifest no longer matches its journaled commitment.");
  }
  await collectIdentityCheck(deployment);
}

async function run(): Promise<void> {
  let journal = (await fileExists(JOURNAL_PATH)) ? await readJson<Journal>(JOURNAL_PATH) : await prepare();
  const [wallets, deployment] = await Promise.all([
    readWallets(),
    readJson<DeploymentRecord>(DEPLOYMENT_PATH),
  ]);
  try {
    await assertResumeIdentity(journal, deployment);
    await ensureSetupGas(journal, wallets);
    await ensureCreate(journal, wallets);
    await ensureNegativeQuote(journal);
    await ensureFundingApproval(journal, wallets);
    await ensureFunding(journal, wallets);
    await ensureEvidenceManifest(journal, deployment);
    await ensureEvidence(journal, wallets);
    await ensureTopUp(journal, wallets);
    await ensureRelease(journal, wallets);
    journal.contractState = await readSnapshot(BigInt(journal.invoiceId ?? "0"));
    if (
      journal.contractState.invoice?.statusName !== "RELEASED" ||
      journal.contractState.activeFxrpLiabilitiesAtomic !== "0"
    ) {
      throw new Error("Final chain state is not RELEASED with zero active liabilities.");
    }
    journal.currentStep = "COMPLETE";
    journal.intendedAction = null;
    journal.completionStatus = "PASS";
    await writeJournal(journal);
    await writeSettlementReceipt(journal);
    console.log(
      `PHASE_4B_ORCHESTRATION PASS invoice=${journal.invoiceId} release=${confirmedHash(journal, "release")}`,
    );
  } catch (error) {
    journal = await readJson<Journal>(JOURNAL_PATH);
    const message = safeErrorMessage(error);
    journal.errors.push({ at: new Date().toISOString(), step: journal.currentStep, message });
    journal.completionStatus = "NEEDS_RECONCILIATION";
    await writeJournal(journal);
    throw error;
  }
}

async function main(): Promise<void> {
  const mode = process.argv[2];
  if (mode === "--prepare") await prepare();
  else if (mode === "--run") await run();
  else throw new Error("Usage: npm run live:coston2 -- --prepare|--run");
}

main().catch((error: unknown) => {
  console.error(`Phase 4B live-flow command failed: ${safeErrorMessage(error)}`);
  process.exitCode = 1;
});
