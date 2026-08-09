import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";

import type { Page } from "@playwright/test";
import {
  createPublicClient,
  createWalletClient,
  decodeAbiParameters,
  defineChain,
  encodeFunctionData,
  formatEther,
  formatUnits,
  getAddress,
  http,
  keccak256,
  parseAbi,
  parseEventLogs,
  type Address,
  type Hash,
  type Hex,
  type TransactionReceipt,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";

export const CHAIN_ID = 114;
export const RPC_URL = "https://coston2-api.flare.network/ext/C/rpc";
export const EXPLORER_URL = "https://coston2-explorer.flare.network";
export const CONTRACT = getAddress("0x53bE2D49f4bFCF2cc04A225Ccb7398Fb5E5EAA21");
export const FXRP = getAddress("0x0b6A3645c240605887a5532109323A3E12273dc7");
export const CLIENT = getAddress("0x3c47ddC46848A7a225d3491DA5c211e2E7A51F42");
export const FREELANCER = getAddress("0xB9CC4f51Bb837DC56998474961250287f40FA680");
export const WALLET_ACTIONS_COMMIT = "b61c6bc920015cc52f09b265620cebae44a1e5b0";
export const JOURNAL_PATH = resolve(process.cwd(), "artifacts/coston2-browser-invoice.json");
export const SCOPE_PATH = resolve(process.cwd(), "artifacts/browser-scope-manifest.json");
export const EVIDENCE_PATH = resolve(process.cwd(), "artifacts/browser-evidence-manifest.json");
export const RECEIPT_PATH = resolve(process.cwd(), "artifacts/coston2-browser-settlement-receipt.json");
export const SCREENSHOT_DIRECTORY = resolve(process.cwd(), "artifacts/browser-settlement");
const JOURNAL_TEMP_PATH = `${JOURNAL_PATH}.tmp`;
const DEPLOYMENT_PATH = resolve(process.cwd(), "deployment/coston2.json");
const SECRET_DIRECTORY = resolve(homedir(), ".local/share/proofpay");
const SECRET_PATH = resolve(SECRET_DIRECTORY, "coston2-burner-wallets.json");
const FEED_ID = "0x015852502f55534400000000000000000000000000" as Hex;
const EXPECTED_RUNTIME_HASH = "0xd455d0ee1c99f901d571e25c4cf25902249097d8212d485417e7032ee3ff5338" as Hash;

export const proofPayAbi = parseAbi([
  "function fxrp() view returns (address)",
  "function ftsoV2() view returns (address)",
  "function xrpUsdFeedId() view returns (bytes21)",
  "function maximumPriceAge() view returns (uint64)",
  "function activeFxrpLiabilities() view returns (uint256)",
  "function invoices(uint256 invoiceId) view returns (address freelancer, address client, uint256 usdTarget, uint256 fxrpLocked, uint64 deliveryDeadline, bytes32 scopeHash, bytes32 evidenceHash, uint256 fundingPrice, int8 fundingPriceDecimals, uint64 fundingPriceTimestamp, uint256 releasePrice, int8 releasePriceDecimals, uint64 releasePriceTimestamp, uint8 status)",
  "function quoteFunding(uint256 invoiceId) returns (uint256 requiredFxrp, uint256 price, int8 priceDecimals, uint64 priceTimestamp)",
  "function quoteRelease(uint256 invoiceId) returns (uint256 requiredPayoutFxrp, uint256 clientRefundFxrp, uint256 topUpFxrp, uint256 price, int8 priceDecimals, uint64 priceTimestamp)",
  "event InvoiceCreated(uint256 indexed invoiceId, address indexed freelancer, address indexed client, uint256 usdTarget, uint64 deliveryDeadline, bytes32 scopeHash)",
  "event InvoiceFunded(uint256 indexed invoiceId, uint256 fxrpLocked, uint256 price, int8 priceDecimals, uint64 priceTimestamp)",
  "event EvidenceSubmitted(uint256 indexed invoiceId, bytes32 indexed evidenceHash, string evidenceURI)",
  "event InvoiceToppedUp(uint256 indexed invoiceId, uint256 amount, uint256 newFxrpLocked, uint256 price, int8 priceDecimals, uint64 priceTimestamp)",
  "event InvoiceReleased(uint256 indexed invoiceId, uint256 freelancerPayout, uint256 clientRefund, uint256 price, int8 priceDecimals, uint64 priceTimestamp)",
]);
export const erc20Abi = parseAbi([
  "function decimals() view returns (uint8)",
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
]);
const ftsoAbi = parseAbi([
  "function calculateFeeById(bytes21 feedId) view returns (uint256)",
  "function getFeedById(bytes21 feedId) payable returns (uint256 value, int8 decimals, uint64 timestamp)",
]);

export const coston2 = defineChain({
  id: CHAIN_ID,
  name: "Flare Testnet Coston2",
  nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: "Coston2 Explorer", url: EXPLORER_URL } },
  testnet: true,
});
export const publicClient = createPublicClient({
  chain: coston2,
  transport: http(RPC_URL, { retryCount: 3, retryDelay: 1_000, timeout: 30_000 }),
});

type ActionName = "create" | "approveFunding" | "fund" | "evidence" | "approveTopUp" | "topUp" | "release";

interface SecretFile {
  schemaVersion: 1;
  purpose: "proofpay-coston2-technical-probe";
  chainId: 114;
  senderPrivateKey: Hex;
  recipientPrivateKey: Hex;
}

export interface InvoiceState {
  freelancer: Address;
  client: Address;
  usdTargetAtomic: string;
  fxrpLockedAtomic: string;
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

export interface ChainSnapshot {
  blockNumber: string;
  blockTimestamp: string;
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
  invoice: InvoiceState | null;
}

interface JournalTransaction {
  action: ActionName;
  status: "INTENT_RECORDED" | "TRANSACTION_SUBMITTED" | "COMPLETE";
  browserRoute: string;
  activeAccount: Address;
  browserVisibleIntent: string;
  intendedAt: string;
  transactionHash: Hash | null;
  submittedAt: string | null;
  receipt: null | {
    status: "success" | "reverted";
    blockNumber: string;
    gasUsed: string;
    effectiveGasPriceWei: string;
  };
  before: ChainSnapshot;
  after: ChainSnapshot | null;
  browserVisibleResult: string | null;
  broadcastCount: number;
}

export interface BrowserJournal {
  schemaVersion: 1;
  phase: "5B2";
  chainId: 114;
  contractAddress: Address;
  browserRoute: string;
  activeAccount: Address;
  invoiceId: string | null;
  currentStep: string;
  transactionIntent: JournalTransaction | null;
  completionStatus: "IN_PROGRESS" | "PASS" | "NEEDS_RECONCILIATION";
  executionGitCommit: string;
  createdAt: string;
  updatedAt: string;
  protectedInputs: {
    deploymentFileSha256: string;
    secretFileSha256: string;
    runtimeBytecodeHash: Hash;
  };
  preflight: {
    checkedAt: string;
    chainId: 114;
    invoiceCount: number;
    nextInvoiceId: string;
    liabilitiesAtomic: string;
    ftsoFeeWei: "0";
    feedValue: string;
    feedDecimals: number;
    feedTimestamp: string;
    feedAgeSeconds: number;
    setupGasRequired: boolean;
    initialSnapshot: ChainSnapshot;
  };
  scopeManifest: null | { path: string; keccak256: Hash; canonicalJson: string };
  evidenceManifest: null | { path: string; keccak256: Hash; canonicalJson: string; evidenceUri: string };
  transactions: Record<ActionName, JournalTransaction | null>;
  approvalHistory: JournalTransaction[];
  friction: {
    networkSwitches: number;
    quoteRefreshes: number;
    walletPrompts: number;
    approvalPrompts: number;
    rejectedActions: number;
    repeatedActions: number;
    reloadRecoveries: number;
    actionStateDelaysMs: number[];
    confusingCopy: string[];
    mobileLayoutProblems: string[];
    observedIssues: string[];
  };
  finalSnapshot: ChainSnapshot | null;
  errors: string[];
}

interface Wallets {
  client: PrivateKeyAccount;
  freelancer: PrivateKeyAccount;
  secretFileSha256: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHexKey(value: unknown): value is Hex {
  return typeof value === "string" && /^0x[0-9a-f]{64}$/iu.test(value);
}

function sha256(bytes: string | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function readWallets(): Promise<Wallets> {
  const [directory, file, bytes] = await Promise.all([
    stat(SECRET_DIRECTORY),
    stat(SECRET_PATH),
    readFile(SECRET_PATH),
  ]);
  if ((directory.mode & 0o077) !== 0 || (file.mode & 0o077) !== 0) {
    throw new Error("The burner-wallet secret location is not owner-only.");
  }
  if (process.getuid && (directory.uid !== process.getuid() || file.uid !== process.getuid())) {
    throw new Error("The burner-wallet secret location is not owned by the current user.");
  }
  const parsed = JSON.parse(bytes.toString("utf8")) as Partial<SecretFile>;
  if (
    parsed.schemaVersion !== 1
    || parsed.purpose !== "proofpay-coston2-technical-probe"
    || parsed.chainId !== CHAIN_ID
    || !isHexKey(parsed.senderPrivateKey)
    || !isHexKey(parsed.recipientPrivateKey)
  ) throw new Error("The burner-wallet file does not match the expected owner-only schema.");
  const client = privateKeyToAccount(parsed.senderPrivateKey);
  const freelancer = privateKeyToAccount(parsed.recipientPrivateKey);
  if (client.address !== CLIENT || freelancer.address !== FREELANCER) {
    throw new Error("The burner-wallet public addresses do not match the preserved identities.");
  }
  return { client, freelancer, secretFileSha256: sha256(bytes) };
}

async function atomicWriteJournal(journal: BrowserJournal): Promise<void> {
  journal.updatedAt = new Date().toISOString();
  await mkdir(resolve(process.cwd(), "artifacts"), { recursive: true });
  await writeFile(JOURNAL_TEMP_PATH, `${JSON.stringify(journal, null, 2)}\n`, "utf8");
  await rename(JOURNAL_TEMP_PATH, JOURNAL_PATH);
}

export async function writeCanonicalArtifact(path: string, canonicalJson: string): Promise<void> {
  JSON.parse(canonicalJson);
  await writeFile(path, canonicalJson, "utf8");
}

export function hashCanonical(canonicalJson: string): Hash {
  return keccak256(`0x${Buffer.from(canonicalJson, "utf8").toString("hex")}` as Hex);
}

const statusNames = ["CREATED", "FUNDED", "SUBMITTED", "RELEASED", "CANCELLED", "REFUNDED"] as const;

function invoiceFromTuple(tuple: readonly unknown[]): InvoiceState | null {
  const freelancer = getAddress(String(tuple[0]));
  if (freelancer === "0x0000000000000000000000000000000000000000") return null;
  const status = Number(tuple[13]);
  const statusName = statusNames[status];
  if (statusName === undefined) throw new Error(`Unknown invoice status ${status}.`);
  return {
    freelancer,
    client: getAddress(String(tuple[1])),
    usdTargetAtomic: String(tuple[2]),
    fxrpLockedAtomic: String(tuple[3]),
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

export async function readSnapshot(invoiceId: bigint | null, blockNumber?: bigint): Promise<ChainSnapshot> {
  const block = await publicClient.getBlock(blockNumber === undefined ? { blockTag: "latest" } : { blockNumber });
  const at = block.number;
  const [clientC2flr, freelancerC2flr, clientFxrp, freelancerFxrp, contractFxrp, liabilities] = await Promise.all([
    publicClient.getBalance({ address: CLIENT, blockNumber: at }),
    publicClient.getBalance({ address: FREELANCER, blockNumber: at }),
    publicClient.readContract({ address: FXRP, abi: erc20Abi, functionName: "balanceOf", args: [CLIENT], blockNumber: at }),
    publicClient.readContract({ address: FXRP, abi: erc20Abi, functionName: "balanceOf", args: [FREELANCER], blockNumber: at }),
    publicClient.readContract({ address: FXRP, abi: erc20Abi, functionName: "balanceOf", args: [CONTRACT], blockNumber: at }),
    publicClient.readContract({ address: CONTRACT, abi: proofPayAbi, functionName: "activeFxrpLiabilities", blockNumber: at }),
  ]);
  let invoice: InvoiceState | null = null;
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

async function findNextInvoiceId(blockNumber: bigint): Promise<bigint> {
  for (let id = 1n; id <= 100n; id += 1n) {
    const tuple = await publicClient.readContract({
      address: CONTRACT,
      abi: proofPayAbi,
      functionName: "invoices",
      args: [id],
      blockNumber,
    });
    if (invoiceFromTuple(tuple) === null) return id;
  }
  throw new Error("Invoice enumeration exceeded the bounded 100-invoice preflight.");
}

export async function preflight(): Promise<{ journal: BrowserJournal; wallets: Wallets }> {
  const wallets = await readWallets();
  let existing: BrowserJournal | null = null;
  try {
    existing = JSON.parse(await readFile(JOURNAL_PATH, "utf8")) as BrowserJournal;
  } catch (error) {
    if (!isObject(error) || error.code !== "ENOENT") throw error;
  }
  if (existing?.completionStatus === "PASS") return { journal: existing, wallets };
  if (existing && !Array.isArray(existing.approvalHistory)) existing.approvalHistory = [];
  if (existing && !Array.isArray(existing.friction.observedIssues)) existing.friction.observedIssues = [];

  const [chainId, code, deploymentBytes, latest] = await Promise.all([
    publicClient.getChainId(),
    publicClient.getCode({ address: CONTRACT }),
    readFile(DEPLOYMENT_PATH),
    publicClient.getBlock({ blockTag: "latest" }),
  ]);
  if (chainId !== CHAIN_ID || code === undefined || code === "0x" || keccak256(code) !== EXPECTED_RUNTIME_HASH) {
    throw new Error("Coston2 chain or deployed runtime identity differs from deployment/coston2.json.");
  }
  const deployment = JSON.parse(deploymentBytes.toString("utf8")) as {
    dependencies: { ftsoV2Address: Address; fxrpAddress: Address };
    bytecodeVerification: { deployedRuntimeBytecodeHash: Hash };
  };
  if (
    getAddress(deployment.dependencies.fxrpAddress) !== FXRP
    || deployment.bytecodeVerification.deployedRuntimeBytecodeHash !== EXPECTED_RUNTIME_HASH
  ) throw new Error("Deployment dependency or runtime hash differs.");

  const nextInvoiceId = await findNextInvoiceId(latest.number);
  const [fee, feedCall, initialSnapshot] = await Promise.all([
    publicClient.readContract({
      address: getAddress(deployment.dependencies.ftsoV2Address),
      abi: ftsoAbi,
      functionName: "calculateFeeById",
      args: [FEED_ID],
      blockNumber: latest.number,
    }),
    publicClient.call({
      to: getAddress(deployment.dependencies.ftsoV2Address),
      data: encodeFunctionData({ abi: ftsoAbi, functionName: "getFeedById", args: [FEED_ID] }),
      value: 0n,
      blockNumber: latest.number,
    }),
    readSnapshot(null, latest.number),
  ]);
  if (fee !== 0n || feedCall.data === undefined || feedCall.data === "0x") {
    throw new Error("The FTSO fee is nonzero or the XRP/USD feed returned no data.");
  }
  const [feedValue, feedDecimals, feedTimestamp] = decodeAbiParameters(
    [{ type: "uint256" }, { type: "int8" }, { type: "uint64" }],
    feedCall.data,
  );
  const feedAge = latest.timestamp - feedTimestamp;
  if (feedValue <= 0n || feedAge < 0n || feedAge >= 30n) throw new Error("The XRP/USD feed is not fresh.");
  if (BigInt(initialSnapshot.contractFxrpAtomic) !== BigInt(initialSnapshot.activeFxrpLiabilitiesAtomic)) {
    throw new Error("The contract balance and active liabilities differ before Phase 5B2.");
  }
  if (BigInt(initialSnapshot.clientFxrpAtomic) < 3_000_000n) throw new Error("The client has insufficient test FXRP.");
  const setupGasRequired = BigInt(initialSnapshot.freelancerC2flrWei) < 400_000_000_000_000_000n;
  if (setupGasRequired) {
    throw new Error("The freelancer needs the separately authorized 1 C2FLR test setup transfer before browser settlement.");
  }

  if (existing) {
    if (
      existing.chainId !== CHAIN_ID
      || existing.contractAddress !== CONTRACT
      || existing.protectedInputs.secretFileSha256 !== wallets.secretFileSha256
    ) throw new Error("The resumable browser journal identity differs from protected inputs.");
    return { journal: existing, wallets };
  }
  const now = new Date().toISOString();
  const transactions = {
    create: null, approveFunding: null, fund: null, evidence: null,
    approveTopUp: null, topUp: null, release: null,
  } satisfies Record<ActionName, null>;
  const journal: BrowserJournal = {
    schemaVersion: 1,
    phase: "5B2",
    chainId: CHAIN_ID,
    contractAddress: CONTRACT,
    browserRoute: "/app",
    activeAccount: FREELANCER,
    invoiceId: null,
    currentStep: "PREFLIGHT_COMPLETE",
    transactionIntent: null,
    completionStatus: "IN_PROGRESS",
    executionGitCommit: WALLET_ACTIONS_COMMIT,
    createdAt: now,
    updatedAt: now,
    protectedInputs: {
      deploymentFileSha256: sha256(deploymentBytes),
      secretFileSha256: wallets.secretFileSha256,
      runtimeBytecodeHash: EXPECTED_RUNTIME_HASH,
    },
    preflight: {
      checkedAt: now,
      chainId: CHAIN_ID,
      invoiceCount: Number(nextInvoiceId - 1n),
      nextInvoiceId: nextInvoiceId.toString(),
      liabilitiesAtomic: initialSnapshot.activeFxrpLiabilitiesAtomic,
      ftsoFeeWei: "0",
      feedValue: feedValue.toString(),
      feedDecimals: Number(feedDecimals),
      feedTimestamp: feedTimestamp.toString(),
      feedAgeSeconds: Number(feedAge),
      setupGasRequired,
      initialSnapshot,
    },
    scopeManifest: null,
    evidenceManifest: null,
    transactions,
    approvalHistory: [],
    friction: {
      networkSwitches: 0,
      quoteRefreshes: 0,
      walletPrompts: 0,
      approvalPrompts: 0,
      rejectedActions: 0,
      repeatedActions: 0,
      reloadRecoveries: 0,
      actionStateDelaysMs: [],
      confusingCopy: [],
      mobileLayoutProblems: [],
      observedIssues: [],
    },
    finalSnapshot: null,
    errors: [],
  };
  await atomicWriteJournal(journal);
  return { journal, wallets };
}

async function rawRpc(method: string, params: readonly unknown[] = []): Promise<unknown> {
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!response.ok) throw new Error(`Coston2 RPC HTTP ${response.status}.`);
  const payload = await response.json() as { result?: unknown; error?: { code: number; message: string; data?: unknown } };
  if (payload.error) throw Object.assign(new Error(payload.error.message), payload.error);
  return payload.result;
}

export class LiveBrowserWalletBridge {
  private activeAccount: PrivateKeyAccount;
  private readonly wallets: Wallets;
  readonly journal: BrowserJournal;

  constructor(journal: BrowserJournal, wallets: Wallets) {
    this.journal = journal;
    this.wallets = wallets;
    this.activeAccount = wallets.freelancer;
  }

  async install(page: Page): Promise<void> {
    await page.exposeBinding("__proofPayWalletRequest", async (_source, request: unknown) => (
      await this.request(request)
    ));
    await page.addInitScript(() => {
      type Listener = (...args: unknown[]) => void;
      const listeners = new Map<string, Set<Listener>>();
      const state = { connected: false, account: "" };
      const emit = (event: string, value: unknown) => {
        for (const listener of listeners.get(event) ?? []) listener(value);
      };
      const provider = {
        isMetaMask: true,
        on(event: string, listener: Listener) {
          const bucket = listeners.get(event) ?? new Set<Listener>();
          bucket.add(listener);
          listeners.set(event, bucket);
          return provider;
        },
        removeListener(event: string, listener: Listener) {
          listeners.get(event)?.delete(listener);
          return provider;
        },
        async request(payload: { method: string; params?: readonly unknown[] }) {
          const result = await (window as typeof window & {
            __proofPayWalletRequest: (value: unknown) => Promise<unknown>;
          }).__proofPayWalletRequest(payload);
          if (payload.method === "eth_requestAccounts") {
            state.connected = true;
            state.account = String((result as string[])[0] ?? "");
            emit("accountsChanged", result);
          }
          return result;
        },
      };
      Object.assign(window, {
        ethereum: provider,
        __proofPaySetPublicAccount(address: string) {
          state.account = address;
          if (state.connected) emit("accountsChanged", [address]);
        },
      });
    });
  }

  async setAccount(page: Page, address: Address): Promise<void> {
    this.activeAccount = address === CLIENT ? this.wallets.client : this.wallets.freelancer;
    this.journal.activeAccount = this.activeAccount.address;
    await atomicWriteJournal(this.journal);
    await page.evaluate((next) => {
      const setter = (window as typeof window & { __proofPaySetPublicAccount?: (value: string) => void })
        .__proofPaySetPublicAccount;
      setter?.(next);
    }, this.activeAccount.address);
  }

  async plan(
    action: ActionName,
    browserRoute: string,
    browserVisibleIntent: string,
  ): Promise<void> {
    const existing = this.journal.transactions[action];
    if (existing?.transactionHash) {
      if ((action === "approveFunding" || action === "approveTopUp") && existing.status === "COMPLETE") {
        this.journal.approvalHistory.push(existing);
        this.journal.transactions[action] = null;
      } else {
        throw new Error(`${action} already has a transaction hash; refusing duplicate intent.`);
      }
    }
    const before = await readSnapshot(this.journal.invoiceId ? BigInt(this.journal.invoiceId) : null);
    const entry: JournalTransaction = {
      action,
      status: "INTENT_RECORDED",
      browserRoute,
      activeAccount: this.activeAccount.address,
      browserVisibleIntent,
      intendedAt: new Date().toISOString(),
      transactionHash: null,
      submittedAt: null,
      receipt: null,
      before,
      after: null,
      browserVisibleResult: null,
      broadcastCount: 0,
    };
    this.journal.browserRoute = browserRoute;
    this.journal.currentStep = `${action.toUpperCase()}_INTENT_RECORDED`;
    this.journal.transactionIntent = entry;
    this.journal.transactions[action] = entry;
    await atomicWriteJournal(this.journal);
  }

  async complete(action: ActionName, browserVisibleResult: string): Promise<TransactionReceipt> {
    const entry = this.journal.transactions[action];
    if (!entry?.transactionHash) throw new Error(`${action} has no submitted transaction to reconcile.`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: entry.transactionHash, confirmations: 1, timeout: 120_000 });
    entry.receipt = {
      status: receipt.status,
      blockNumber: receipt.blockNumber.toString(),
      gasUsed: receipt.gasUsed.toString(),
      effectiveGasPriceWei: receipt.effectiveGasPrice.toString(),
    };
    entry.after = await readSnapshot(this.journal.invoiceId ? BigInt(this.journal.invoiceId) : null, receipt.blockNumber);
    entry.browserVisibleResult = browserVisibleResult;
    entry.status = "COMPLETE";
    this.journal.currentStep = `${action.toUpperCase()}_CONFIRMED`;
    this.journal.transactionIntent = entry;
    await atomicWriteJournal(this.journal);
    if (receipt.status !== "success") throw new Error(`${action} transaction reverted.`);
    return receipt;
  }

  async assignCreatedInvoice(receipt: TransactionReceipt): Promise<bigint> {
    const events = parseEventLogs({ abi: proofPayAbi, logs: receipt.logs, eventName: "InvoiceCreated", strict: true });
    const created = events[0];
    if (!created) throw new Error("InvoiceCreated event was not found in the browser transaction receipt.");
    const id = created.args.invoiceId;
    this.journal.invoiceId = id.toString();
    const entry = this.journal.transactions.create;
    if (entry) entry.after = await readSnapshot(id, receipt.blockNumber);
    await atomicWriteJournal(this.journal);
    return id;
  }

  async persistScope(canonicalJson: string, hash: Hash): Promise<void> {
    await writeCanonicalArtifact(SCOPE_PATH, canonicalJson);
    if (hashCanonical(canonicalJson) !== hash) throw new Error("Browser scope commitment differs from canonical bytes.");
    this.journal.scopeManifest = { path: "artifacts/browser-scope-manifest.json", keccak256: hash, canonicalJson };
    await atomicWriteJournal(this.journal);
  }

  async persistEvidence(canonicalJson: string, hash: Hash, evidenceUri: string): Promise<void> {
    await writeCanonicalArtifact(EVIDENCE_PATH, canonicalJson);
    if (hashCanonical(canonicalJson) !== hash) throw new Error("Browser evidence commitment differs from canonical bytes.");
    this.journal.evidenceManifest = {
      path: "artifacts/browser-evidence-manifest.json",
      keccak256: hash,
      canonicalJson,
      evidenceUri,
    };
    await atomicWriteJournal(this.journal);
  }

  async finish(): Promise<void> {
    this.journal.finalSnapshot = await readSnapshot(BigInt(this.journal.invoiceId ?? "0"));
    this.journal.currentStep = "COMPLETE";
    this.journal.transactionIntent = null;
    this.journal.completionStatus = "PASS";
    const currentSecretHash = sha256(await readFile(SECRET_PATH));
    if (currentSecretHash !== this.journal.protectedInputs.secretFileSha256) {
      throw new Error("The owner-only burner-wallet file changed during the browser run.");
    }
    await atomicWriteJournal(this.journal);
  }

  private async request(value: unknown): Promise<unknown> {
    if (!isObject(value) || typeof value.method !== "string") throw new Error("Invalid EIP-1193 request.");
    const params = Array.isArray(value.params) ? value.params : [];
    switch (value.method) {
      case "eth_accounts": return [this.activeAccount.address];
      case "eth_requestAccounts": return [this.activeAccount.address];
      case "eth_chainId": return "0x72";
      case "wallet_switchEthereumChain": {
        const requested = isObject(params[0]) ? params[0].chainId : undefined;
        if (requested !== "0x72") throw Object.assign(new Error("Only Coston2 is available."), { code: 4902 });
        return null;
      }
      case "wallet_addEthereumChain": return null;
      case "eth_sendTransaction": return await this.sendTransaction(params[0]);
      default: return await rawRpc(value.method, params);
    }
  }

  private async sendTransaction(value: unknown): Promise<Hash> {
    if (!isObject(value)) throw new Error("Wallet transaction payload is invalid.");
    const pending = Object.values(this.journal.transactions).find((entry) => entry?.status === "INTENT_RECORDED");
    if (!pending) throw new Error("The application has not produced a durable browser-visible intent.");
    if (pending.transactionHash !== null || pending.broadcastCount !== 0) {
      throw new Error("A transaction is already associated with this intent.");
    }
    const from = getAddress(String(value.from));
    const to = getAddress(String(value.to));
    const data = String(value.data ?? "0x") as Hex;
    const transactionValue = BigInt(String(value.value ?? "0x0"));
    if (from !== this.activeAccount.address || pending.activeAccount !== from) {
      throw new Error("The EIP-1193 sender differs from the durable browser intent.");
    }
    if (to !== CONTRACT && to !== FXRP) throw new Error("The browser transaction target is outside ProofPay or FXRP.");
    await publicClient.call({ account: from, to, data, value: transactionValue });
    const gas = await publicClient.estimateGas({ account: from, to, data, value: transactionValue });
    const gasPrice = await publicClient.getGasPrice();
    const walletClient = createWalletClient({ account: this.activeAccount, chain: coston2, transport: http(RPC_URL) });
    pending.broadcastCount = 1;
    const hash = await walletClient.sendTransaction({
      account: this.activeAccount,
      chain: coston2,
      to,
      data,
      value: transactionValue,
      gas: gas * 12n / 10n,
      gasPrice,
    });
    pending.transactionHash = hash;
    pending.submittedAt = new Date().toISOString();
    pending.status = "TRANSACTION_SUBMITTED";
    this.journal.currentStep = `${pending.action.toUpperCase()}_TRANSACTION_SUBMITTED`;
    this.journal.transactionIntent = pending;
    await atomicWriteJournal(this.journal);
    return hash;
  }
}

export function transactionHash(journal: BrowserJournal, action: ActionName): Hash {
  const hash = journal.transactions[action]?.transactionHash;
  if (!hash) throw new Error(`${action} transaction hash is unavailable.`);
  return hash;
}

export async function verifyNoSecretLeak(paths: readonly string[]): Promise<void> {
  const wallets = await readWallets();
  const secret = JSON.parse(await readFile(SECRET_PATH, "utf8")) as SecretFile;
  for (const path of paths) {
    const bytes = await readFile(path);
    const text = bytes.toString("utf8");
    if (text.includes(secret.senderPrivateKey) || text.includes(secret.recipientPrivateKey)) {
      throw new Error(`Private key material was found in ${path}.`);
    }
  }
  if (sha256(await readFile(SECRET_PATH)) !== wallets.secretFileSha256) {
    throw new Error("Secret file changed during the leak scan.");
  }
}
