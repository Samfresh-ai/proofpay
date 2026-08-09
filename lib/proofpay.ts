import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  createPublicClient,
  defineChain,
  getAddress,
  http,
  keccak256,
  parseAbi,
  parseEventLogs,
  toHex,
  type Address,
  type Hash,
  type Log,
} from "viem";

const DEPLOYMENT_PATH = resolve(process.cwd(), "deployment", "coston2.json");
const RECEIPT_POINTER_PATH = resolve(process.cwd(), "artifacts", "coston2-settlement-receipt.json");
const BROWSER_RECEIPT_POINTER_PATH = resolve(process.cwd(), "artifacts", "coston2-browser-settlement-receipt.json");
const BROWSER_JOURNAL_PATH = resolve(process.cwd(), "artifacts", "coston2-browser-invoice.json");
const LIVE_JOURNAL_PATH = resolve(process.cwd(), "artifacts", "coston2-live-invoice.json");
const SCOPE_MANIFEST_PATH = resolve(process.cwd(), "artifacts", "live-scope-manifest.json");
const EVIDENCE_MANIFEST_PATH = resolve(process.cwd(), "artifacts", "live-evidence-manifest.json");
const BROWSER_SCOPE_MANIFEST_PATH = resolve(process.cwd(), "artifacts", "browser-scope-manifest.json");
const BROWSER_EVIDENCE_MANIFEST_PATH = resolve(process.cwd(), "artifacts", "browser-evidence-manifest.json");

const EXPECTED_CHAIN_ID = 114;
const EXPECTED_RECEIPT_ID = 1n;
const SYNTHETIC_TOP_UP_INVOICE_ID = 2n;
const WALLET_ACTION_FIXTURE_IDS = new Set([3n, 4n, 5n, 6n, 7n]);
const EXPECTED_RPC_URL = "https://coston2-api.flare.network/ext/C/rpc";
const EXPECTED_CONTRACT_ADDRESS = getAddress("0x53bE2D49f4bFCF2cc04A225Ccb7398Fb5E5EAA21");
const EXPECTED_FXRP_ADDRESS = getAddress("0x0b6A3645c240605887a5532109323A3E12273dc7");
const FXRP_DECIMALS = 6;
const USD_DECIMALS = 6;
const RPC_TIMEOUT_MS = 15_000;
const RPC_RETRY_COUNT = 1;
const FIXTURE_AUTH_VALUE = "phase5a-e2e";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;
const ZERO_HASH = `0x${"0".repeat(64)}` as Hash;
const MAX_UINT256 = (1n << 256n) - 1n;

const proofPayAbi = parseAbi([
  "function fxrp() view returns (address)",
  "function activeFxrpLiabilities() view returns (uint256)",
  "function invoices(uint256 invoiceId) view returns (address freelancer, address client, uint256 usdTarget, uint256 fxrpLocked, uint64 deliveryDeadline, bytes32 scopeHash, bytes32 evidenceHash, uint256 fundingPrice, int8 fundingPriceDecimals, uint64 fundingPriceTimestamp, uint256 releasePrice, int8 releasePriceDecimals, uint64 releasePriceTimestamp, uint8 status)",
  "function quoteRelease(uint256 invoiceId) returns (uint256 requiredPayoutFxrp, uint256 clientRefundFxrp, uint256 topUpFxrp, uint256 price, int8 priceDecimals, uint64 priceTimestamp)",
  "event InvoiceCreated(uint256 indexed invoiceId, address indexed freelancer, address indexed client, uint256 usdTarget, uint64 deliveryDeadline, bytes32 scopeHash)",
  "event InvoiceFunded(uint256 indexed invoiceId, uint256 fxrpLocked, uint256 price, int8 priceDecimals, uint64 priceTimestamp)",
  "event EvidenceSubmitted(uint256 indexed invoiceId, bytes32 indexed evidenceHash, string evidenceURI)",
  "event InvoiceToppedUp(uint256 indexed invoiceId, uint256 amount, uint256 newFxrpLocked, uint256 price, int8 priceDecimals, uint64 priceTimestamp)",
  "event InvoiceReleased(uint256 indexed invoiceId, uint256 freelancerPayout, uint256 clientRefund, uint256 price, int8 priceDecimals, uint64 priceTimestamp)",
  "event InvoiceCancelled(uint256 indexed invoiceId)",
  "event InvoiceRefunded(uint256 indexed invoiceId, uint256 clientRefund)",
]);

const erc20Abi = parseAbi(["function balanceOf(address account) view returns (uint256)"]);

export const invoiceStatuses = [
  "CREATED",
  "FUNDED",
  "SUBMITTED",
  "RELEASED",
  "CANCELLED",
  "REFUNDED",
] as const;

export type InvoiceStatus = (typeof invoiceStatuses)[number];
export type InvoiceDisplayStatus = InvoiceStatus | "UNKNOWN";

export interface AmountView {
  atomic: string;
  decimals: number;
  display: string;
  symbol: "USD" | "FXRP";
}

export interface PriceView {
  raw: string;
  decimals: number;
  display: string;
  timestamp: TimestampView;
}

export interface TimestampView {
  unix: string;
  iso: string;
}

export interface NetworkView {
  name: "Flare Testnet Coston2";
  chainId: 114;
  testnet: true;
  pinnedBlockNumber: string;
  pinnedBlockTimestamp: TimestampView;
}

export type LifecycleStage = "AGREED" | "FUNDED" | "DELIVERED" | "SETTLED";

export interface InvoiceLifecycleView {
  stage: LifecycleStage;
  reached: boolean;
  confirmed: boolean;
}

export interface ReceiptLifecycleView extends InvoiceLifecycleView {
  reached: true;
  confirmed: true;
  eventName: "InvoiceCreated" | "InvoiceFunded" | "EvidenceSubmitted" | "InvoiceReleased";
  transactionHash: Hash;
  blockNumber: string;
  blockTimestamp: TimestampView;
  explorerUrl: string;
}

export interface ReleasePreviewView {
  label: "Preview quote";
  confirmed: false;
  payout: AmountView;
  refund: AmountView;
  topUp: AmountView;
  price: PriceView;
}

export interface InvoiceEvidenceView {
  hash: Hash;
  uri?: string;
  completionNote?: string;
}

export interface InvoiceView {
  kind: "invoice";
  exists: boolean;
  id: string;
  network: NetworkView;
  contractAddress: Address;
  status: InvoiceDisplayStatus;
  title: string;
  usdTarget: AmountView | null;
  currentFxrpLocked: AmountView | null;
  activeLiabilities: AmountView;
  contractFxrpBalance: AmountView;
  deadline: TimestampView | null;
  client: Address | null;
  freelancer: Address | null;
  scopeHash: Hash | null;
  receiptLocatorAvailable: boolean;
  sampleScenario?:
    | "TOP_UP_REQUIRED"
    | "ACTION_CREATED"
    | "ACTION_FUNDED_OPEN"
    | "ACTION_FUNDED_EXPIRED"
    | "ACTION_SUBMITTED_TOP_UP"
    | "ACTION_SUBMITTED_RELEASE";
  scopeLines?: readonly string[];
  summary: string;
  nextStep: string;
  evidence?: InvoiceEvidenceView;
  fundingPrice?: PriceView;
  releasePrice?: PriceView;
  preview?: ReleasePreviewView;
  lifecycle: readonly InvoiceLifecycleView[];
}

export interface ReceiptView {
  kind: "receipt";
  id: string;
  invoice: InvoiceView & { exists: true; status: "RELEASED" };
  confirmed: {
    locked: AmountView;
    payout: AmountView;
    refund: AmountView;
    fundingPrice: PriceView;
    releasePrice: PriceView;
  };
  currentPartyBalances: {
    client: AmountView;
    freelancer: AmountView;
  };
  evidenceUri: string;
  lifecycle: readonly ReceiptLifecycleView[];
  reconciliation: {
    payoutPlusRefundEqualsLock: true;
    contractSolventAtPinnedBlock: true;
    exactContractEvents: true;
    currentInvoiceMatchesEvents: true;
    partyBalancesReadAtPinnedBlock: true;
  };
}

export type ProofPayDataErrorCode =
  | "CONFIGURATION"
  | "FIXTURE_DISABLED"
  | "INVALID_INVOICE_ID"
  | "INVALID_LOCAL_EVIDENCE"
  | "MANIFEST_HASH_MISMATCH"
  | "ONCHAIN_CONTRADICTION"
  | "RPC_FAILURE";

export class ProofPayDataError extends Error {
  readonly code: ProofPayDataErrorCode;

  constructor(code: ProofPayDataErrorCode, message: string) {
    super(message);
    this.name = "ProofPayDataError";
    this.code = code;
  }
}

interface DeploymentIdentity {
  chainId: 114;
  rpcUrl: string;
  contractAddress: Address;
  fxrpAddress: Address;
  deploymentBlock: bigint;
}

interface RawInvoice {
  freelancer: Address;
  client: Address;
  usdTarget: bigint;
  fxrpLocked: bigint;
  deliveryDeadline: bigint;
  scopeHash: Hash;
  evidenceHash: Hash;
  fundingPrice: bigint;
  fundingPriceDecimals: number;
  fundingPriceTimestamp: bigint;
  releasePrice: bigint;
  releasePriceDecimals: number;
  releasePriceTimestamp: bigint;
  status: number;
}

interface PinnedSnapshot {
  blockNumber: bigint;
  blockTimestamp: bigint;
  invoice: RawInvoice;
  activeLiabilities: bigint;
  contractFxrpBalance: bigint;
}

interface VerifiedScopeManifest {
  milestoneTitle: string;
  scope: readonly string[];
}

interface VerifiedEvidenceManifest {
  milestoneTitle: string;
  completionNote: string;
}

interface ReceiptPointers {
  create: Hash;
  funding: Hash;
  evidence: Hash;
  release: Hash;
}

type ExpectedReceiptEvent = ReceiptLifecycleView["eventName"];

interface DecodedReceiptEvent {
  eventName: ExpectedReceiptEvent;
  args: Record<string, unknown>;
  transactionHash: Hash;
  transactionFrom: Address;
  blockNumber: bigint;
  blockTimestamp: bigint;
}

let deploymentIdentityPromise: Promise<DeploymentIdentity> | undefined;
let publicClientPromise: Promise<ReturnType<typeof createProofPayClient>> | undefined;

export function parseInvoiceId(value: string | number | bigint): bigint {
  let parsed: bigint;
  if (typeof value === "bigint") {
    parsed = value;
  } else if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new ProofPayDataError("INVALID_INVOICE_ID", "Invoice ID must be a safe positive integer.");
    }
    parsed = BigInt(value);
  } else {
    const normalized = value.trim();
    if (!/^[1-9][0-9]*$/.test(normalized)) {
      throw new ProofPayDataError("INVALID_INVOICE_ID", "Invoice ID must contain only a positive base-10 integer.");
    }
    parsed = BigInt(normalized);
  }
  if (parsed <= 0n || parsed > MAX_UINT256) {
    throw new ProofPayDataError("INVALID_INVOICE_ID", "Invoice ID is outside the uint256 positive range.");
  }
  return parsed;
}

export function formatAtomic(
  value: bigint | string,
  decimals: number,
  minimumFractionDigits = 0,
): string {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
    throw new RangeError("decimals must be an integer from 0 through 255");
  }
  if (!Number.isInteger(minimumFractionDigits) || minimumFractionDigits < 0 || minimumFractionDigits > decimals) {
    throw new RangeError("minimumFractionDigits must be between zero and decimals");
  }
  const atomic = typeof value === "bigint" ? value : parseInteger(value, "atomic value");
  const negative = atomic < 0n;
  const digits = (negative ? -atomic : atomic).toString().padStart(decimals + 1, "0");
  if (decimals === 0) return `${negative ? "-" : ""}${digits}`;
  const whole = digits.slice(0, -decimals);
  const fraction = digits.slice(-decimals);
  let retained = fraction.length;
  while (retained > minimumFractionDigits && fraction[retained - 1] === "0") retained -= 1;
  const suffix = retained > 0 ? `.${fraction.slice(0, retained)}` : "";
  return `${negative ? "-" : ""}${whole}${suffix}`;
}

export function formatUsd(value: bigint | string): string {
  return `$${formatAtomic(value, USD_DECIMALS, 2)}`;
}

export function formatFxrp(value: bigint | string): string {
  return `${formatAtomic(value, FXRP_DECIMALS)} FXRP`;
}

export function formatPrice(value: bigint | string, decimals: number): string {
  return `$${formatAtomic(value, decimals, Math.min(2, decimals))}`;
}

export function formatTimestamp(value: bigint | string): string {
  const seconds = typeof value === "bigint" ? value : parseInteger(value, "timestamp");
  if (seconds < 0n || seconds > BigInt(Math.floor(8.64e15 / 1_000))) {
    throw new RangeError("timestamp is outside the JavaScript Date range");
  }
  return new Date(Number(seconds) * 1_000).toISOString();
}

export function shortenHex(value: string, head = 6, tail = 4): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export async function getInvoiceView(value: string | number | bigint): Promise<InvoiceView> {
  const invoiceId = parseInvoiceId(value);
  const mode = resolveDataMode();
  if (mode === "fixture") return await getFixtureInvoiceView(invoiceId);

  try {
    const identity = await getDeploymentIdentity();
    const client = await getPublicClient(identity);
    const snapshot = await readPinnedSnapshot(client, identity, invoiceId);
    const preview = snapshot.invoice.status === 2
      ? await readOptionalReleasePreview(client, identity, invoiceId, snapshot.blockNumber)
      : undefined;
    const receiptLocatorAvailable = await hasVerifiedReceiptLocator(identity, invoiceId);
    return await buildInvoiceView(identity, invoiceId, snapshot, preview, receiptLocatorAvailable);
  } catch (error) {
    if (error instanceof ProofPayDataError) throw error;
    throw new ProofPayDataError("RPC_FAILURE", `Coston2 invoice ${invoiceId} could not be read.`);
  }
}

export async function getReceiptView(value: string | number | bigint): Promise<ReceiptView | null> {
  const invoiceId = parseInvoiceId(value);
  const mode = resolveDataMode();
  if (mode === "fixture") return invoiceId === EXPECTED_RECEIPT_ID ? await getFixtureReceiptView() : null;

  try {
    const identity = await getDeploymentIdentity();
    if (!await hasVerifiedReceiptLocator(identity, invoiceId)) return null;
    return await getLiveReceiptView(invoiceId);
  } catch (error) {
    if (error instanceof ProofPayDataError) throw error;
    throw new ProofPayDataError("RPC_FAILURE", `Coston2 receipt ${invoiceId} could not be reconciled.`);
  }
}

export function normalizeProofPayDataMode(value: string | undefined): string {
  return value?.trim() || "live";
}

function resolveDataMode(): "live" | "fixture" {
  const configured = normalizeProofPayDataMode(process.env.PROOFPAY_DATA_MODE);
  if (configured === "live") return "live";
  if (configured !== "fixture") {
    throw new ProofPayDataError("CONFIGURATION", `Unsupported PROOFPAY_DATA_MODE: ${configured}`);
  }
  if (process.env.NODE_ENV === "production") {
    throw new ProofPayDataError("FIXTURE_DISABLED", "ProofPay fixture mode is disabled in production.");
  }
  if (process.env.PROOFPAY_FIXTURE_AUTH !== FIXTURE_AUTH_VALUE) {
    throw new ProofPayDataError(
      "FIXTURE_DISABLED",
      "ProofPay fixture mode requires explicit Phase 5A E2E authorization.",
    );
  }
  return "fixture";
}

async function getDeploymentIdentity(): Promise<DeploymentIdentity> {
  deploymentIdentityPromise ??= readDeploymentIdentity();
  return await deploymentIdentityPromise;
}

async function readDeploymentIdentity(): Promise<DeploymentIdentity> {
  const parsed = await readJsonObject(DEPLOYMENT_PATH, "deployment record");
  const network = objectField(parsed, "network", "deployment record");
  const rpc = objectField(network, "rpc", "deployment network");
  const deployment = objectField(parsed, "deployment", "deployment record");
  const dependencies = objectField(parsed, "dependencies", "deployment record");
  const chainId = numberField(network, "chainId", "deployment network");
  if (chainId !== EXPECTED_CHAIN_ID) contradiction(`Deployment chain ID ${chainId} is not 114.`);
  const rpcUrl = stringField(rpc, "url", "deployment RPC");
  const contractAddress = addressField(deployment, "contractAddress", "deployment");
  const fxrpAddress = addressField(dependencies, "fxrpAddress", "deployment dependencies");
  if (rpcUrl !== EXPECTED_RPC_URL) contradiction("Deployment record does not use the locked official Coston2 RPC.");
  if (contractAddress !== EXPECTED_CONTRACT_ADDRESS) contradiction("Deployment record contract address changed.");
  if (fxrpAddress !== EXPECTED_FXRP_ADDRESS) contradiction("Deployment record FXRP address changed.");
  return {
    chainId: EXPECTED_CHAIN_ID,
    rpcUrl,
    contractAddress,
    fxrpAddress,
    deploymentBlock: positiveBigInt(stringField(deployment, "blockNumber", "deployment"), "deployment block"),
  };
}

function createProofPayClient(identity: DeploymentIdentity) {
  const coston2 = defineChain({
    id: EXPECTED_CHAIN_ID,
    name: "Flare Testnet Coston2",
    nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
    rpcUrls: { default: { http: [identity.rpcUrl] } },
    testnet: true,
  });
  return createPublicClient({
    chain: coston2,
    transport: http(identity.rpcUrl, {
      timeout: RPC_TIMEOUT_MS,
      retryCount: RPC_RETRY_COUNT,
      retryDelay: 500,
    }),
  });
}

async function getPublicClient(identity: DeploymentIdentity): Promise<ReturnType<typeof createProofPayClient>> {
  publicClientPromise ??= Promise.resolve(createProofPayClient(identity));
  return await publicClientPromise;
}

async function readPinnedSnapshot(
  client: ReturnType<typeof createProofPayClient>,
  identity: DeploymentIdentity,
  invoiceId: bigint,
): Promise<PinnedSnapshot> {
  const [chainId, block] = await Promise.all([
    client.getChainId(),
    client.getBlock({ blockTag: "latest", includeTransactions: false }),
  ]);
  if (chainId !== identity.chainId) contradiction(`RPC returned chain ID ${chainId}, not Coston2 chain 114.`);
  if (block.number < identity.deploymentBlock) contradiction("Pinned Coston2 block predates the deployment.");

  const [invoiceTuple, activeLiabilities, contractFxrpBalance] = await Promise.all([
    client.readContract({
      address: identity.contractAddress,
      abi: proofPayAbi,
      functionName: "invoices",
      args: [invoiceId],
      blockNumber: block.number,
    }),
    client.readContract({
      address: identity.contractAddress,
      abi: proofPayAbi,
      functionName: "activeFxrpLiabilities",
      blockNumber: block.number,
    }),
    client.readContract({
      address: identity.fxrpAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [identity.contractAddress],
      blockNumber: block.number,
    }),
  ]);

  const tuple = invoiceTuple as readonly [
    Address, Address, bigint, bigint, bigint, Hash, Hash, bigint, number, bigint, bigint, number, bigint, number,
  ];
  const invoice: RawInvoice = {
    freelancer: getAddress(tuple[0]),
    client: getAddress(tuple[1]),
    usdTarget: tuple[2],
    fxrpLocked: tuple[3],
    deliveryDeadline: tuple[4],
    scopeHash: tuple[5],
    evidenceHash: tuple[6],
    fundingPrice: tuple[7],
    fundingPriceDecimals: Number(tuple[8]),
    fundingPriceTimestamp: tuple[9],
    releasePrice: tuple[10],
    releasePriceDecimals: Number(tuple[11]),
    releasePriceTimestamp: tuple[12],
    status: Number(tuple[13]),
  };
  if (invoice.freelancer !== ZERO_ADDRESS && (invoice.status < 0 || invoice.status >= invoiceStatuses.length)) {
    contradiction(`Invoice ${invoiceId} returned unknown status ${invoice.status}.`);
  }
  if (contractFxrpBalance < activeLiabilities) {
    contradiction("Contract FXRP balance is below active liabilities at the pinned block.");
  }
  return {
    blockNumber: block.number,
    blockTimestamp: block.timestamp,
    invoice,
    activeLiabilities,
    contractFxrpBalance,
  };
}

async function readOptionalReleasePreview(
  client: ReturnType<typeof createProofPayClient>,
  identity: DeploymentIdentity,
  invoiceId: bigint,
  blockNumber: bigint,
): Promise<ReleasePreviewView | undefined> {
  try {
    const simulation = await client.simulateContract({
      address: identity.contractAddress,
      abi: proofPayAbi,
      functionName: "quoteRelease",
      args: [invoiceId],
      blockNumber,
    });
    const result = simulation.result as readonly [bigint, bigint, bigint, bigint, number, bigint];
    return {
      label: "Preview quote",
      confirmed: false,
      payout: money(result[0], "FXRP"),
      refund: money(result[1], "FXRP"),
      topUp: money(result[2], "FXRP"),
      price: price(result[3], Number(result[4]), result[5]),
    };
  } catch {
    return undefined;
  }
}

async function buildInvoiceView(
  identity: DeploymentIdentity,
  invoiceId: bigint,
  snapshot: PinnedSnapshot,
  preview?: ReleasePreviewView,
  receiptLocatorAvailable = false,
): Promise<InvoiceView> {
  const exists = snapshot.invoice.freelancer !== ZERO_ADDRESS;
  const network = networkView(snapshot.blockNumber, snapshot.blockTimestamp);
  if (!exists) {
    return {
      kind: "invoice",
      exists: false,
      id: invoiceId.toString(),
      network,
      contractAddress: identity.contractAddress,
      status: "UNKNOWN",
      title: `ProofPay milestone #${invoiceId}`,
      usdTarget: null,
      currentFxrpLocked: null,
      activeLiabilities: money(snapshot.activeLiabilities, "FXRP"),
      contractFxrpBalance: money(snapshot.contractFxrpBalance, "FXRP"),
      deadline: null,
      client: null,
      freelancer: null,
      scopeHash: null,
      receiptLocatorAvailable: false,
      summary: "No record was found at the deployed ProofPay contract on Coston2.",
      nextStep: "Check the invoice ID.",
      lifecycle: lifecycleFor("UNKNOWN"),
    };
  }

  const status = invoiceStatuses[snapshot.invoice.status];
  if (status === undefined) contradiction(`Invoice ${invoiceId} returned an unsupported status.`);
  const browserInvoice = await isBrowserSettlementInvoice(invoiceId);
  const scopePath = invoiceId === EXPECTED_RECEIPT_ID
    ? SCOPE_MANIFEST_PATH
    : browserInvoice ? BROWSER_SCOPE_MANIFEST_PATH : null;
  const evidencePath = invoiceId === EXPECTED_RECEIPT_ID
    ? EVIDENCE_MANIFEST_PATH
    : browserInvoice ? BROWSER_EVIDENCE_MANIFEST_PATH : null;
  const scope = scopePath
    ? await loadScopeManifest(scopePath, snapshot.invoice.scopeHash, identity, snapshot.invoice)
    : undefined;
  const evidence = evidencePath && snapshot.invoice.evidenceHash !== ZERO_HASH
    ? await loadEvidenceManifest(evidencePath, snapshot.invoice.evidenceHash, identity, browserInvoice)
    : undefined;
  const copy = statusCopy(status, preview, receiptLocatorAvailable);
  const view: InvoiceView = {
    kind: "invoice",
    exists: true,
    id: invoiceId.toString(),
    network,
    contractAddress: identity.contractAddress,
    status,
    title: scope?.milestoneTitle ?? `ProofPay milestone #${invoiceId}`,
    usdTarget: money(snapshot.invoice.usdTarget, "USD"),
    currentFxrpLocked: money(snapshot.invoice.fxrpLocked, "FXRP"),
    activeLiabilities: money(snapshot.activeLiabilities, "FXRP"),
    contractFxrpBalance: money(snapshot.contractFxrpBalance, "FXRP"),
    deadline: timestamp(snapshot.invoice.deliveryDeadline),
    client: snapshot.invoice.client,
    freelancer: snapshot.invoice.freelancer,
    scopeHash: snapshot.invoice.scopeHash,
    receiptLocatorAvailable,
    summary: copy.summary,
    nextStep: copy.nextStep,
    lifecycle: lifecycleFor(status),
  };
  if (scope) view.scopeLines = scope.scope;
  if (snapshot.invoice.evidenceHash !== ZERO_HASH) {
    view.evidence = {
      hash: snapshot.invoice.evidenceHash,
      ...(evidence ? { completionNote: evidence.completionNote } : {}),
    };
  }
  if (snapshot.invoice.fundingPriceTimestamp > 0n) {
    view.fundingPrice = price(
      snapshot.invoice.fundingPrice,
      snapshot.invoice.fundingPriceDecimals,
      snapshot.invoice.fundingPriceTimestamp,
    );
  }
  if (snapshot.invoice.releasePriceTimestamp > 0n) {
    view.releasePrice = price(
      snapshot.invoice.releasePrice,
      snapshot.invoice.releasePriceDecimals,
      snapshot.invoice.releasePriceTimestamp,
    );
  }
  if (preview) view.preview = preview;
  return view;
}

async function getLiveReceiptView(invoiceId: bigint): Promise<ReceiptView> {
  const identity = await getDeploymentIdentity();
  const client = await getPublicClient(identity);
  const pointers = await readReceiptPointers(identity, invoiceId);

  // Keep the public RPC burst bounded: each lifecycle read may fetch a transaction,
  // receipt, and block, so the four stages are reconciled in order rather than all at once.
  const created = await readExactReceiptEvent(
    client,
    identity,
    pointers.create,
    "InvoiceCreated",
    invoiceId,
  );
  const funded = await readExactReceiptEvent(
    client,
    identity,
    pointers.funding,
    "InvoiceFunded",
    invoiceId,
  );
  const evidence = await readExactReceiptEvent(
    client,
    identity,
    pointers.evidence,
    "EvidenceSubmitted",
    invoiceId,
  );
  const released = await readExactReceiptEvent(
    client,
    identity,
    pointers.release,
    "InvoiceReleased",
    invoiceId,
  );
  if (!(created.blockNumber <= funded.blockNumber && funded.blockNumber <= evidence.blockNumber && evidence.blockNumber <= released.blockNumber)) {
    contradiction("Receipt lifecycle transactions are not in contract order.");
  }

  const snapshot = await readPinnedSnapshot(client, identity, invoiceId);
  if (released.blockNumber > snapshot.blockNumber) {
    contradiction("Receipt lifecycle evidence is newer than the pinned current-state snapshot.");
  }
  const invoice = await buildInvoiceView(identity, invoiceId, snapshot, undefined, true);
  if (!invoice.exists || invoice.status !== "RELEASED") {
    contradiction("The preserved receipt points to an invoice that is not currently RELEASED.");
  }
  const currentPartyBalances = await readPartyBalancesAtPinnedBlock(
    client,
    identity,
    snapshot.invoice.client,
    snapshot.invoice.freelancer,
    snapshot.blockNumber,
  );

  assertAddress(created.args.freelancer, snapshot.invoice.freelancer, "created freelancer");
  assertAddress(created.args.client, snapshot.invoice.client, "created client");
  assertBigInt(created.args.usdTarget, snapshot.invoice.usdTarget, "created USD target");
  assertBigInt(created.args.deliveryDeadline, snapshot.invoice.deliveryDeadline, "created deadline");
  assertHash(created.args.scopeHash, snapshot.invoice.scopeHash, "created scope hash");
  assertAddress(created.transactionFrom, snapshot.invoice.freelancer, "create transaction sender");

  const fundedLock = bigintArg(funded.args.fxrpLocked, "funded lock");
  assertBigInt(funded.args.price, snapshot.invoice.fundingPrice, "funding price");
  assertNumber(funded.args.priceDecimals, snapshot.invoice.fundingPriceDecimals, "funding price decimals");
  assertBigInt(funded.args.priceTimestamp, snapshot.invoice.fundingPriceTimestamp, "funding timestamp");
  assertAddress(funded.transactionFrom, snapshot.invoice.client, "fund transaction sender");

  assertHash(evidence.args.evidenceHash, snapshot.invoice.evidenceHash, "evidence hash");
  assertAddress(evidence.transactionFrom, snapshot.invoice.freelancer, "evidence transaction sender");
  const evidenceUri = stringArg(evidence.args.evidenceURI, "evidence URI");

  const payout = bigintArg(released.args.freelancerPayout, "freelancer payout");
  const refund = bigintArg(released.args.clientRefund, "client refund");
  assertSettlementConservation(fundedLock, payout, refund);
  assertBigInt(fundedLock, snapshot.invoice.fxrpLocked, "funded lock/current lock");
  assertBigInt(released.args.price, snapshot.invoice.releasePrice, "release price");
  assertNumber(released.args.priceDecimals, snapshot.invoice.releasePriceDecimals, "release price decimals");
  assertBigInt(released.args.priceTimestamp, snapshot.invoice.releasePriceTimestamp, "release timestamp");
  assertAddress(released.transactionFrom, snapshot.invoice.client, "release transaction sender");

  if (invoice.evidence) invoice.evidence.uri = evidenceUri;
  const lifecycle = [
    receiptLifecycle("AGREED", created, identity),
    receiptLifecycle("FUNDED", funded, identity),
    receiptLifecycle("DELIVERED", evidence, identity),
    receiptLifecycle("SETTLED", released, identity),
  ] as const;

  return {
    kind: "receipt",
    id: invoiceId.toString(),
    invoice: invoice as InvoiceView & { exists: true; status: "RELEASED" },
    confirmed: {
      locked: money(fundedLock, "FXRP"),
      payout: money(payout, "FXRP"),
      refund: money(refund, "FXRP"),
      fundingPrice: price(
        bigintArg(funded.args.price, "funding price"),
        numberArg(funded.args.priceDecimals, "funding price decimals"),
        bigintArg(funded.args.priceTimestamp, "funding timestamp"),
      ),
      releasePrice: price(
        bigintArg(released.args.price, "release price"),
        numberArg(released.args.priceDecimals, "release price decimals"),
        bigintArg(released.args.priceTimestamp, "release timestamp"),
      ),
    },
    currentPartyBalances: {
      client: money(currentPartyBalances.client, "FXRP"),
      freelancer: money(currentPartyBalances.freelancer, "FXRP"),
    },
    evidenceUri,
    lifecycle,
    reconciliation: {
      payoutPlusRefundEqualsLock: true,
      contractSolventAtPinnedBlock: true,
      exactContractEvents: true,
      currentInvoiceMatchesEvents: true,
      partyBalancesReadAtPinnedBlock: true,
    },
  };
}

async function readPartyBalancesAtPinnedBlock(
  client: ReturnType<typeof createProofPayClient>,
  identity: DeploymentIdentity,
  clientAddress: Address,
  freelancerAddress: Address,
  blockNumber: bigint,
): Promise<{ client: bigint; freelancer: bigint }> {
  const [clientBalance, freelancerBalance] = await Promise.all([
    client.readContract({
      address: identity.fxrpAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [clientAddress],
      blockNumber,
    }),
    client.readContract({
      address: identity.fxrpAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [freelancerAddress],
      blockNumber,
    }),
  ]);
  return { client: clientBalance, freelancer: freelancerBalance };
}

async function readExactReceiptEvent(
  client: ReturnType<typeof createProofPayClient>,
  identity: DeploymentIdentity,
  hash: Hash,
  expectedEvent: ExpectedReceiptEvent,
  invoiceId: bigint,
): Promise<DecodedReceiptEvent> {
  const [transaction, receipt] = await Promise.all([
    client.getTransaction({ hash }),
    client.getTransactionReceipt({ hash }),
  ]);
  if (receipt.status !== "success") contradiction(`${expectedEvent} transaction did not succeed.`);
  if (transaction.to === null || getAddress(transaction.to) !== identity.contractAddress) {
    contradiction(`${expectedEvent} transaction does not target the deployed ProofPay contract.`);
  }
  if (transaction.chainId !== identity.chainId) contradiction(`${expectedEvent} transaction is not on chain 114.`);
  const block = await client.getBlock({ blockNumber: receipt.blockNumber, includeTransactions: false });
  const contractLogs = receipt.logs.filter(
    (log) => getAddress(log.address) === identity.contractAddress,
  ) as Log[];
  const event = decodeExactContractEvent(contractLogs.length, expectedEvent, () => (
    parseEventLogs({ abi: proofPayAbi, logs: contractLogs, strict: true })
  ));
  const args = event.args as Record<string, unknown>;
  assertBigInt(args.invoiceId, invoiceId, `${expectedEvent} invoice ID`);
  return {
    eventName: expectedEvent,
    args,
    transactionHash: hash,
    transactionFrom: getAddress(transaction.from),
    blockNumber: receipt.blockNumber,
    blockTimestamp: block.timestamp,
  };
}

function decodeExactContractEvent<T extends { eventName: string }>(
  contractLogCount: number,
  expectedEvent: ExpectedReceiptEvent,
  decode: () => readonly T[],
): T {
  let decodedEvents: readonly T[];
  try {
    decodedEvents = decode();
  } catch {
    contradiction(`${expectedEvent} deployed-contract log could not be decoded.`);
  }
  return selectExactContractEvent(contractLogCount, decodedEvents, expectedEvent);
}

function selectExactContractEvent<T extends { eventName: string }>(
  contractLogCount: number,
  decodedEvents: readonly T[],
  expectedEvent: ExpectedReceiptEvent,
): T {
  if (contractLogCount !== 1) {
    contradiction(`${expectedEvent} transaction did not contain exactly one deployed-contract log.`);
  }
  if (decodedEvents.length !== 1 || decodedEvents[0]?.eventName !== expectedEvent) {
    contradiction(`${expectedEvent} transaction did not decode to exactly the expected contract event.`);
  }
  return decodedEvents[0];
}

async function readReceiptPointers(
  identity: DeploymentIdentity,
  invoiceId: bigint,
): Promise<ReceiptPointers> {
  const path = invoiceId === EXPECTED_RECEIPT_ID ? RECEIPT_POINTER_PATH : BROWSER_RECEIPT_POINTER_PATH;
  const parsed = await readJsonObject(path, "settlement receipt pointer file");
  return parseReceiptPointers(parsed, identity.chainId, identity.contractAddress, invoiceId);
}

function parseReceiptPointers(
  parsed: Record<string, unknown>,
  expectedChainId = EXPECTED_CHAIN_ID,
  expectedContractAddress = EXPECTED_CONTRACT_ADDRESS,
  expectedInvoiceId = EXPECTED_RECEIPT_ID,
): ReceiptPointers {
  const network = objectField(parsed, "network", "settlement receipt pointer file");
  const invoice = objectField(parsed, "invoice", "settlement receipt pointer file");
  const contract = objectField(parsed, "contract", "settlement receipt pointer file");
  if (numberField(network, "chainId", "receipt network") !== expectedChainId) {
    invalidLocalEvidence("Receipt locator chain ID does not match the configured deployment.");
  }
  if (positiveBigIntField(invoice, "invoiceId", "receipt invoice") !== expectedInvoiceId) {
    invalidLocalEvidence("Receipt locator invoice ID does not match the requested receipt.");
  }
  if (addressField(contract, "address", "receipt contract") !== expectedContractAddress) {
    invalidLocalEvidence("Receipt locator contract does not match the configured deployment.");
  }
  const transactions = objectField(parsed, "transactions", "settlement receipt pointer file");
  const pointers: ReceiptPointers = {
    create: hashField(transactions, "create", "receipt transactions"),
    funding: hashField(transactions, "funding", "receipt transactions"),
    evidence: hashField(transactions, "evidence", "receipt transactions"),
    release: hashField(transactions, "release", "receipt transactions"),
  };
  if (new Set(Object.values(pointers).map((hash) => hash.toLowerCase())).size !== 4) {
    invalidLocalEvidence("Receipt lifecycle transaction hashes are not distinct.");
  }
  return pointers;
}

async function hasVerifiedReceiptLocator(identity: DeploymentIdentity, invoiceId: bigint): Promise<boolean> {
  try {
    await readReceiptPointers(identity, invoiceId);
    return true;
  } catch (error) {
    if (error instanceof ProofPayDataError && error.code === "INVALID_LOCAL_EVIDENCE") return false;
    throw error;
  }
}

async function loadScopeManifest(
  path: string,
  expectedHash: Hash,
  identity: DeploymentIdentity,
  invoice: RawInvoice,
): Promise<VerifiedScopeManifest> {
  const parsed = await readHashVerifiedJson(path, expectedHash, "scope manifest");
  assertAddress(parsed.contractAddress, identity.contractAddress, "scope manifest contract");
  assertAddress(parsed.client, invoice.client, "scope manifest client");
  assertAddress(parsed.freelancer, invoice.freelancer, "scope manifest freelancer");
  assertBigInt(parsed.usdTargetAtomic, invoice.usdTarget, "scope manifest USD target");
  assertBigInt(parsed.deliveryDeadline, invoice.deliveryDeadline, "scope manifest deadline");
  const milestoneTitle = stringField(parsed, "milestoneTitle", "scope manifest");
  const rawScope = parsed.scope;
  if (!Array.isArray(rawScope) || rawScope.some((item) => typeof item !== "string")) {
    throw new ProofPayDataError("INVALID_LOCAL_EVIDENCE", "Scope manifest lines are invalid.");
  }
  return { milestoneTitle, scope: rawScope };
}

async function loadEvidenceManifest(
  path: string,
  expectedHash: Hash,
  identity: DeploymentIdentity,
  browserInvoice = false,
): Promise<VerifiedEvidenceManifest> {
  const parsed = await readHashVerifiedJson(path, expectedHash, "evidence manifest");
  if (!browserInvoice) assertAddress(parsed.deployedContractAddress, identity.contractAddress, "evidence manifest contract");
  return {
    milestoneTitle: stringField(parsed, "milestoneTitle", "evidence manifest"),
    completionNote: stringField(parsed, "completionNote", "evidence manifest"),
  };
}

async function isBrowserSettlementInvoice(invoiceId: bigint): Promise<boolean> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(BROWSER_JOURNAL_PATH, "utf8"));
  } catch (error) {
    if (isObject(error) && error.code === "ENOENT") return false;
    throw new ProofPayDataError("INVALID_LOCAL_EVIDENCE", "Browser settlement journal could not be parsed.");
  }
  if (!isObject(parsed)) {
    throw new ProofPayDataError("INVALID_LOCAL_EVIDENCE", "Browser settlement journal is not an object.");
  }
  const value = parsed.invoiceId;
  if (value === null) return false;
  if (typeof value !== "string" || !/^[1-9][0-9]*$/u.test(value)) {
    throw new ProofPayDataError("INVALID_LOCAL_EVIDENCE", "Browser settlement journal invoice ID is invalid.");
  }
  return BigInt(value) === invoiceId;
}

async function readHashVerifiedJson(path: string, expectedHash: Hash, label: string): Promise<Record<string, unknown>> {
  let bytes: Buffer;
  try {
    bytes = await readFile(path);
  } catch {
    throw new ProofPayDataError("INVALID_LOCAL_EVIDENCE", `${label} could not be read.`);
  }
  const observedHash = keccak256(toHex(bytes));
  if (observedHash.toLowerCase() !== expectedHash.toLowerCase()) {
    throw new ProofPayDataError("MANIFEST_HASH_MISMATCH", `${label} bytes do not match the onchain commitment.`);
  }
  try {
    const parsed: unknown = JSON.parse(bytes.toString("utf8"));
    if (!isObject(parsed)) throw new Error("not an object");
    return parsed;
  } catch {
    throw new ProofPayDataError("INVALID_LOCAL_EVIDENCE", `${label} is not valid JSON.`);
  }
}

async function readJsonObject(path: string, label: string): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    if (!isObject(parsed)) throw new Error("not an object");
    return parsed;
  } catch {
    throw new ProofPayDataError("INVALID_LOCAL_EVIDENCE", `${label} could not be parsed.`);
  }
}

function lifecycleFor(status: InvoiceDisplayStatus): readonly InvoiceLifecycleView[] {
  const reached = {
    AGREED: status !== "UNKNOWN",
    FUNDED: status === "FUNDED" || status === "SUBMITTED" || status === "RELEASED" || status === "REFUNDED",
    DELIVERED: status === "SUBMITTED" || status === "RELEASED",
    SETTLED: status === "RELEASED",
  } as const;
  return (["AGREED", "FUNDED", "DELIVERED", "SETTLED"] as const).map((stage) => ({
    stage,
    reached: reached[stage],
    confirmed: reached[stage],
  }));
}

function statusCopy(
  status: InvoiceStatus,
  preview?: ReleasePreviewView,
  hasReceiptLocator = false,
): { summary: string; nextStep: string } {
  switch (status) {
    case "CREATED": return {
      summary: "Agreement recorded. No FXRP has been locked.",
      nextStep: "Waiting for the client to fund the milestone.",
    };
    case "FUNDED": return {
      summary: "Milestone funded. The client locked the displayed FXRP amount.",
      nextStep: "Waiting for delivery evidence.",
    };
    case "SUBMITTED": return preview && BigInt(preview.topUp.atomic) > 0n ? {
      summary: "Top-up required. The escrow no longer covers the milestone target; no payment has been released.",
      nextStep: "Waiting for the client to add the previewed FXRP shortfall.",
    } : {
      summary: "Delivery evidence submitted. FXRP remains locked while the client reviews it.",
      nextStep: "Waiting for the client’s decision.",
    };
    case "RELEASED": return {
      summary: "Payment released. The release state and price are confirmed by the current contract record.",
      nextStep: hasReceiptLocator
        ? "View the public receipt."
        : "Review the current contract state; no verified receipt locator is available for this invoice.",
    };
    case "CANCELLED": return {
      summary: "Invoice cancelled. The freelancer cancelled before funding; no FXRP was locked.",
      nextStep: "This invoice is terminal.",
    };
    case "REFUNDED": return {
      summary: "FXRP returned to the client after the deadline passed without submitted evidence.",
      nextStep: "This invoice is terminal.",
    };
  }
}

function receiptLifecycle(
  stage: LifecycleStage,
  event: DecodedReceiptEvent,
  identity: DeploymentIdentity,
): ReceiptLifecycleView {
  return {
    stage,
    reached: true,
    confirmed: true,
    eventName: event.eventName,
    transactionHash: event.transactionHash,
    blockNumber: event.blockNumber.toString(),
    blockTimestamp: timestamp(event.blockTimestamp),
    explorerUrl: explorerTransaction(identity, event.transactionHash),
  };
}

function money(value: bigint, symbol: "USD" | "FXRP"): AmountView {
  const decimals = symbol === "USD" ? USD_DECIMALS : FXRP_DECIMALS;
  return {
    atomic: value.toString(),
    decimals,
    display: symbol === "USD" ? formatUsd(value) : formatFxrp(value),
    symbol,
  };
}

function price(value: bigint, decimals: number, observedAt: bigint): PriceView {
  return {
    raw: value.toString(),
    decimals,
    display: formatPrice(value, decimals),
    timestamp: timestamp(observedAt),
  };
}

function timestamp(value: bigint): TimestampView {
  return { unix: value.toString(), iso: formatTimestamp(value) };
}

function networkView(blockNumber: bigint, blockTimestamp: bigint): NetworkView {
  return {
    name: "Flare Testnet Coston2",
    chainId: EXPECTED_CHAIN_ID,
    testnet: true,
    pinnedBlockNumber: blockNumber.toString(),
    pinnedBlockTimestamp: timestamp(blockTimestamp),
  };
}

function explorerTransaction(identity: DeploymentIdentity, hash: Hash): string {
  return `https://coston2-explorer.flare.network/tx/${hash}`;
}

function assertSettlementConservation(locked: bigint, payout: bigint, refund: bigint): void {
  if (payout + refund !== locked) contradiction("Confirmed payout plus refund does not equal the funded lock.");
}

function parseInteger(value: string, label: string): bigint {
  if (!/^-?[0-9]+$/.test(value)) throw new TypeError(`${label} must be an integer string`);
  return BigInt(value);
}

function positiveBigInt(value: string, label: string): bigint {
  const parsed = parseInteger(value, label);
  if (parsed <= 0n) throw new ProofPayDataError("INVALID_LOCAL_EVIDENCE", `${label} must be positive.`);
  return parsed;
}

function bigintArg(value: unknown, label: string): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
  if (typeof value === "string" && /^[0-9]+$/.test(value)) return BigInt(value);
  contradiction(`${label} is not an integer.`);
}

function numberArg(value: unknown, label: string): number {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "bigint" && value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER)) {
    return Number(value);
  }
  contradiction(`${label} is not an integer number.`);
}

function stringArg(value: unknown, label: string): string {
  if (typeof value === "string" && value.length > 0) return value;
  contradiction(`${label} is not a non-empty string.`);
}

function assertBigInt(actual: unknown, expected: bigint, label: string): void {
  if (bigintArg(actual, label) !== expected) contradiction(`${label} contradicts current contract state.`);
}

function assertNumber(actual: unknown, expected: number, label: string): void {
  if (numberArg(actual, label) !== expected) contradiction(`${label} contradicts current contract state.`);
}

function assertAddress(actual: unknown, expected: Address, label: string): void {
  if (typeof actual !== "string") contradiction(`${label} is not an address.`);
  try {
    if (getAddress(actual) !== getAddress(expected)) contradiction(`${label} contradicts current contract state.`);
  } catch {
    contradiction(`${label} is not a valid address.`);
  }
}

function assertHash(actual: unknown, expected: Hash, label: string): void {
  if (typeof actual !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(actual)) contradiction(`${label} is not a hash.`);
  if (actual.toLowerCase() !== expected.toLowerCase()) contradiction(`${label} contradicts current contract state.`);
}

function contradiction(message: string): never {
  throw new ProofPayDataError("ONCHAIN_CONTRADICTION", message);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function objectField(parent: Record<string, unknown>, key: string, label: string): Record<string, unknown> {
  const value = parent[key];
  if (!isObject(value)) throw new ProofPayDataError("INVALID_LOCAL_EVIDENCE", `${label}.${key} is invalid.`);
  return value;
}

function stringField(parent: Record<string, unknown>, key: string, label: string): string {
  const value = parent[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new ProofPayDataError("INVALID_LOCAL_EVIDENCE", `${label}.${key} is invalid.`);
  }
  return value;
}

function numberField(parent: Record<string, unknown>, key: string, label: string): number {
  const value = parent[key];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ProofPayDataError("INVALID_LOCAL_EVIDENCE", `${label}.${key} is invalid.`);
  }
  return value;
}

function unsignedBigIntField(parent: Record<string, unknown>, key: string, label: string): bigint {
  const value = parent[key];
  if (typeof value !== "string" || !/^[0-9]+$/.test(value)) {
    invalidLocalEvidence(`${label}.${key} is not an unsigned integer string.`);
  }
  return BigInt(value);
}

function positiveBigIntField(parent: Record<string, unknown>, key: string, label: string): bigint {
  const value = unsignedBigIntField(parent, key, label);
  if (value === 0n) invalidLocalEvidence(`${label}.${key} must be positive.`);
  return value;
}

function addressField(parent: Record<string, unknown>, key: string, label: string): Address {
  try {
    return getAddress(stringField(parent, key, label));
  } catch {
    throw new ProofPayDataError("INVALID_LOCAL_EVIDENCE", `${label}.${key} is not a valid address.`);
  }
}

function hashField(parent: Record<string, unknown>, key: string, label: string): Hash {
  const value = stringField(parent, key, label);
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new ProofPayDataError("INVALID_LOCAL_EVIDENCE", `${label}.${key} is not a transaction hash.`);
  }
  return value as Hash;
}

function invalidLocalEvidence(message: string): never {
  throw new ProofPayDataError("INVALID_LOCAL_EVIDENCE", message);
}

interface FixtureReceiptArtifact {
  invoice: {
    invoiceId: string;
    milestoneTitle: string;
    usdTargetAtomic: string;
    freelancer: Address;
    client: Address;
    deliveryDeadline: string;
    scopeHash: Hash;
    evidenceHash: Hash;
    evidenceUri: string;
  };
  settlement: {
    fundingPrice: string;
    fundingPriceDecimals: number;
    fundingPriceTimestamp: string;
    releasePrice: string;
    releasePriceDecimals: number;
    releasePriceTimestamp: string;
    fxrpLockedAtomic: string;
    fxrpPaidAtomic: string;
    fxrpRefundedAtomic: string;
  };
  contract: { address: Address };
  transactions: { create: Hash; funding: Hash; evidence: Hash; release: Hash };
}

interface FixtureJournalTransaction {
  transactionHash: Hash;
  blockNumber: bigint;
  blockTimestamp: bigint;
}

interface FixtureLiveJournal {
  snapshot: {
    blockNumber: bigint;
    blockTimestamp: bigint;
    activeLiabilities: bigint;
    contractFxrpBalance: bigint;
    clientFxrpBalance: bigint;
    freelancerFxrpBalance: bigint;
  };
  transactions: Record<keyof ReceiptPointers, FixtureJournalTransaction>;
}

async function readFixtureArtifact(): Promise<FixtureReceiptArtifact> {
  return await readJsonObject(RECEIPT_POINTER_PATH, "fixture receipt") as unknown as FixtureReceiptArtifact;
}

async function readFixtureLiveJournal(identity: DeploymentIdentity): Promise<FixtureLiveJournal> {
  const parsed = await readJsonObject(LIVE_JOURNAL_PATH, "fixture live journal");
  if (numberField(parsed, "chainId", "fixture live journal") !== identity.chainId) {
    invalidLocalEvidence("Fixture live journal chain ID does not match the deployment.");
  }
  if (addressField(parsed, "contractAddress", "fixture live journal") !== identity.contractAddress) {
    invalidLocalEvidence("Fixture live journal contract does not match the deployment.");
  }
  if (positiveBigIntField(parsed, "invoiceId", "fixture live journal") !== EXPECTED_RECEIPT_ID) {
    invalidLocalEvidence("Fixture live journal invoice ID is not the preserved receipt invoice.");
  }

  const rawTransactions = objectField(parsed, "transactions", "fixture live journal");
  const readTransaction = (journalKey: string, label: string): FixtureJournalTransaction => {
    const transaction = objectField(rawTransactions, journalKey, "fixture live journal transactions");
    const receipt = objectField(transaction, "receipt", label);
    const after = objectField(transaction, "after", label);
    const blockNumber = positiveBigIntField(receipt, "blockNumber", `${label} receipt`);
    const afterBlockNumber = positiveBigIntField(after, "blockNumber", `${label} after-state`);
    if (blockNumber !== afterBlockNumber) {
      invalidLocalEvidence(`${label} receipt and after-state blocks do not match.`);
    }
    return {
      transactionHash: hashField(transaction, "transactionHash", label),
      blockNumber,
      blockTimestamp: positiveBigIntField(after, "blockTimestamp", `${label} after-state`),
    };
  };
  const transactions: FixtureLiveJournal["transactions"] = {
    create: readTransaction("create", "fixture create transaction"),
    funding: readTransaction("fund", "fixture funding transaction"),
    evidence: readTransaction("evidence", "fixture evidence transaction"),
    release: readTransaction("release", "fixture release transaction"),
  };
  const orderedTransactions = [
    transactions.create,
    transactions.funding,
    transactions.evidence,
    transactions.release,
  ];
  for (let index = 1; index < orderedTransactions.length; index += 1) {
    const previous = orderedTransactions[index - 1];
    const current = orderedTransactions[index];
    if (!previous || !current) invalidLocalEvidence("Fixture lifecycle transaction data is incomplete.");
    if (current.blockNumber < previous.blockNumber || current.blockTimestamp < previous.blockTimestamp) {
      invalidLocalEvidence("Fixture lifecycle transaction chronology is invalid.");
    }
  }

  const contractState = objectField(parsed, "contractState", "fixture live journal");
  const snapshot = {
    blockNumber: positiveBigIntField(contractState, "blockNumber", "fixture contract state"),
    blockTimestamp: positiveBigIntField(contractState, "blockTimestamp", "fixture contract state"),
    activeLiabilities: unsignedBigIntField(
      contractState,
      "activeFxrpLiabilitiesAtomic",
      "fixture contract state",
    ),
    contractFxrpBalance: unsignedBigIntField(contractState, "contractFxrpAtomic", "fixture contract state"),
    clientFxrpBalance: unsignedBigIntField(contractState, "clientFxrpAtomic", "fixture contract state"),
    freelancerFxrpBalance: unsignedBigIntField(
      contractState,
      "freelancerFxrpAtomic",
      "fixture contract state",
    ),
  };
  if (
    snapshot.blockNumber < transactions.release.blockNumber
    || snapshot.blockTimestamp < transactions.release.blockTimestamp
  ) {
    invalidLocalEvidence("Fixture contract snapshot predates the release transaction.");
  }
  return { snapshot, transactions };
}

function fixtureInvoiceSnapshot(
  invoice: RawInvoice,
  journal: FixtureLiveJournal,
): PinnedSnapshot {
  return {
    ...journal.snapshot,
    invoice,
  };
}

function rawFixtureInvoice(artifact: FixtureReceiptArtifact): RawInvoice {
  return {
    freelancer: getAddress(artifact.invoice.freelancer),
    client: getAddress(artifact.invoice.client),
    usdTarget: BigInt(artifact.invoice.usdTargetAtomic),
    fxrpLocked: BigInt(artifact.settlement.fxrpLockedAtomic),
    deliveryDeadline: BigInt(artifact.invoice.deliveryDeadline),
    scopeHash: artifact.invoice.scopeHash,
    evidenceHash: artifact.invoice.evidenceHash,
    fundingPrice: BigInt(artifact.settlement.fundingPrice),
    fundingPriceDecimals: artifact.settlement.fundingPriceDecimals,
    fundingPriceTimestamp: BigInt(artifact.settlement.fundingPriceTimestamp),
    releasePrice: BigInt(artifact.settlement.releasePrice),
    releasePriceDecimals: artifact.settlement.releasePriceDecimals,
    releasePriceTimestamp: BigInt(artifact.settlement.releasePriceTimestamp),
    status: 3,
  };
}

function emptyFixtureInvoice(): RawInvoice {
  return {
    freelancer: ZERO_ADDRESS,
    client: ZERO_ADDRESS,
    usdTarget: 0n,
    fxrpLocked: 0n,
    deliveryDeadline: 0n,
    scopeHash: ZERO_HASH,
    evidenceHash: ZERO_HASH,
    fundingPrice: 0n,
    fundingPriceDecimals: 0,
    fundingPriceTimestamp: 0n,
    releasePrice: 0n,
    releasePriceDecimals: 0,
    releasePriceTimestamp: 0n,
    status: 0,
  };
}

function syntheticTopUpInvoiceView(): InvoiceView {
  const preview: ReleasePreviewView = {
    label: "Preview quote",
    confirmed: false,
    payout: money(0n, "FXRP"),
    refund: money(0n, "FXRP"),
    topUp: money(1_000_000n, "FXRP"),
    price: price(1_000_000n, 6, 0n),
  };
  const copy = statusCopy("SUBMITTED", preview);
  return {
    kind: "invoice",
    exists: true,
    id: SYNTHETIC_TOP_UP_INVOICE_ID.toString(),
    network: networkView(0n, 0n),
    contractAddress: ZERO_ADDRESS,
    status: "SUBMITTED",
    title: "Sample scenario — Top-up required",
    usdTarget: money(5_000_000n, "USD"),
    currentFxrpLocked: money(4_000_000n, "FXRP"),
    activeLiabilities: money(4_000_000n, "FXRP"),
    contractFxrpBalance: money(4_000_000n, "FXRP"),
    deadline: null,
    client: null,
    freelancer: null,
    scopeHash: null,
    receiptLocatorAvailable: false,
    sampleScenario: "TOP_UP_REQUIRED",
    summary: copy.summary,
    nextStep: copy.nextStep,
    preview,
    lifecycle: ([
      ["AGREED", true],
      ["FUNDED", true],
      ["DELIVERED", true],
      ["SETTLED", false],
    ] as const).map(([stage, reached]) => ({ stage, reached, confirmed: false })),
  };
}

function syntheticWalletActionInvoiceView(invoiceId: bigint): InvoiceView {
  const client = getAddress("0x2222222222222222222222222222222222222222");
  const freelancer = getAddress("0x1111111111111111111111111111111111111111");
  const futureDeadline = 2_000_000_000n;
  const expiredDeadline = 1_700_000_000n;
  const fixtures = {
    3: {
      status: "CREATED",
      sampleScenario: "ACTION_CREATED",
      deadline: futureDeadline,
      locked: 0n,
      title: "Wallet-action fixture — Awaiting funding",
    },
    4: {
      status: "FUNDED",
      sampleScenario: "ACTION_FUNDED_OPEN",
      deadline: futureDeadline,
      locked: 5_500_000n,
      title: "Wallet-action fixture — Delivery window open",
    },
    5: {
      status: "FUNDED",
      sampleScenario: "ACTION_FUNDED_EXPIRED",
      deadline: expiredDeadline,
      locked: 5_500_000n,
      title: "Wallet-action fixture — Delivery deadline passed",
    },
    6: {
      status: "SUBMITTED",
      sampleScenario: "ACTION_SUBMITTED_TOP_UP",
      deadline: expiredDeadline,
      locked: 4_000_000n,
      title: "Wallet-action fixture — Settlement shortfall",
    },
    7: {
      status: "SUBMITTED",
      sampleScenario: "ACTION_SUBMITTED_RELEASE",
      deadline: expiredDeadline,
      locked: 5_500_000n,
      title: "Wallet-action fixture — Ready for settlement",
    },
  } as const satisfies Record<number, {
    status: InvoiceStatus;
    sampleScenario: Exclude<NonNullable<InvoiceView["sampleScenario"]>, "TOP_UP_REQUIRED">;
    deadline: bigint;
    locked: bigint;
    title: string;
  }>;
  const fixture = fixtures[Number(invoiceId) as keyof typeof fixtures];
  if (!fixture) throw new ProofPayDataError("INVALID_INVOICE_ID", "Unknown wallet-action fixture invoice.");
  const copy = statusCopy(fixture.status, undefined, false);
  const reachedCount = fixture.status === "CREATED" ? 1 : fixture.status === "FUNDED" ? 2 : 3;
  return {
    kind: "invoice",
    exists: true,
    id: invoiceId.toString(),
    network: networkView(0n, 0n),
    contractAddress: EXPECTED_CONTRACT_ADDRESS,
    status: fixture.status,
    title: fixture.title,
    usdTarget: money(5_000_000n, "USD"),
    currentFxrpLocked: money(fixture.locked, "FXRP"),
    activeLiabilities: money(fixture.locked, "FXRP"),
    contractFxrpBalance: money(fixture.locked, "FXRP"),
    deadline: timestamp(fixture.deadline),
    client,
    freelancer,
    scopeHash: `0x${"3".repeat(64)}`,
    receiptLocatorAvailable: false,
    sampleScenario: fixture.sampleScenario,
    summary: copy.summary,
    nextStep: copy.nextStep,
    lifecycle: (["AGREED", "FUNDED", "DELIVERED", "SETTLED"] as const).map((stage, index) => ({
      stage,
      reached: index < reachedCount,
      confirmed: false,
    })),
  };
}

async function getFixtureInvoiceView(invoiceId: bigint): Promise<InvoiceView> {
  if (invoiceId === SYNTHETIC_TOP_UP_INVOICE_ID) return syntheticTopUpInvoiceView();
  if (WALLET_ACTION_FIXTURE_IDS.has(invoiceId)) return syntheticWalletActionInvoiceView(invoiceId);
  const artifact = await readFixtureArtifact();
  const identity = await getDeploymentIdentity();
  const journal = await readFixtureLiveJournal(identity);
  if (invoiceId !== EXPECTED_RECEIPT_ID) {
    return await buildInvoiceView(identity, invoiceId, fixtureInvoiceSnapshot(emptyFixtureInvoice(), journal));
  }
  const receiptLocatorAvailable = await hasVerifiedReceiptLocator(identity, invoiceId);
  return await buildInvoiceView(
    identity,
    invoiceId,
    fixtureInvoiceSnapshot(rawFixtureInvoice(artifact), journal),
    undefined,
    receiptLocatorAvailable,
  );
}

async function getFixtureReceiptView(): Promise<ReceiptView> {
  const artifact = await readFixtureArtifact();
  const identity = await getDeploymentIdentity();
  const journal = await readFixtureLiveJournal(identity);
  const pointers = await readReceiptPointers(identity, EXPECTED_RECEIPT_ID);
  const invoice = await buildInvoiceView(
    identity,
    EXPECTED_RECEIPT_ID,
    fixtureInvoiceSnapshot(rawFixtureInvoice(artifact), journal),
    undefined,
    true,
  );
  if (!invoice.exists || invoice.status !== "RELEASED") contradiction("Fixture invoice is not RELEASED.");
  const locked = BigInt(artifact.settlement.fxrpLockedAtomic);
  const payout = BigInt(artifact.settlement.fxrpPaidAtomic);
  const refund = BigInt(artifact.settlement.fxrpRefundedAtomic);
  assertSettlementConservation(locked, payout, refund);
  const stageData = [
    ["AGREED", "InvoiceCreated", "create"],
    ["FUNDED", "InvoiceFunded", "funding"],
    ["DELIVERED", "EvidenceSubmitted", "evidence"],
    ["SETTLED", "InvoiceReleased", "release"],
  ] as const;
  const lifecycle = stageData.map(([stage, eventName, key]) => ({
    stage,
    reached: true as const,
    confirmed: true as const,
    eventName,
    transactionHash: pointers[key],
    blockNumber: journal.transactions[key].blockNumber.toString(),
    blockTimestamp: timestamp(journal.transactions[key].blockTimestamp),
    explorerUrl: explorerTransaction(identity, pointers[key]),
  })) satisfies readonly ReceiptLifecycleView[];
  for (const key of Object.keys(pointers) as (keyof ReceiptPointers)[]) {
    if (pointers[key].toLowerCase() !== journal.transactions[key].transactionHash.toLowerCase()) {
      invalidLocalEvidence(`Fixture ${key} transaction hash does not match the live journal.`);
    }
  }
  if (invoice.evidence) invoice.evidence.uri = artifact.invoice.evidenceUri;
  return {
    kind: "receipt",
    id: EXPECTED_RECEIPT_ID.toString(),
    invoice: invoice as InvoiceView & { exists: true; status: "RELEASED" },
    confirmed: {
      locked: money(locked, "FXRP"),
      payout: money(payout, "FXRP"),
      refund: money(refund, "FXRP"),
      fundingPrice: price(
        BigInt(artifact.settlement.fundingPrice),
        artifact.settlement.fundingPriceDecimals,
        BigInt(artifact.settlement.fundingPriceTimestamp),
      ),
      releasePrice: price(
        BigInt(artifact.settlement.releasePrice),
        artifact.settlement.releasePriceDecimals,
        BigInt(artifact.settlement.releasePriceTimestamp),
      ),
    },
    currentPartyBalances: {
      client: money(journal.snapshot.clientFxrpBalance, "FXRP"),
      freelancer: money(journal.snapshot.freelancerFxrpBalance, "FXRP"),
    },
    evidenceUri: artifact.invoice.evidenceUri,
    lifecycle,
    reconciliation: {
      payoutPlusRefundEqualsLock: true,
      contractSolventAtPinnedBlock: true,
      exactContractEvents: true,
      currentInvoiceMatchesEvents: true,
      partyBalancesReadAtPinnedBlock: true,
    },
  };
}

export const __test = {
  EXPECTED_CHAIN_ID,
  EXPECTED_CONTRACT_ADDRESS,
  EXPECTED_RECEIPT_ID,
  RPC_RETRY_COUNT,
  RPC_TIMEOUT_MS,
  SYNTHETIC_TOP_UP_INVOICE_ID,
  ZERO_HASH,
  assertSettlementConservation,
  decodeExactContractEvent,
  parseReceiptPointers,
  readHashVerifiedJson,
  selectExactContractEvent,
  statusCopy,
};
