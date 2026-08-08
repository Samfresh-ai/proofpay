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
  stringToHex,
  type Address,
  type Hash,
  type TransactionReceipt,
} from "viem";

const CHAIN_ID = 114;
const RPC_URL = "https://coston2-api.flare.network/ext/C/rpc";
const CONTRACT = getAddress("0x53bE2D49f4bFCF2cc04A225Ccb7398Fb5E5EAA21");
const CLIENT = getAddress("0x3c47ddC46848A7a225d3491DA5c211e2E7A51F42");
const FREELANCER = getAddress("0xB9CC4f51Bb837DC56998474961250287f40FA680");
const ROOT = resolve(process.cwd());
const RECEIPT_PATH = resolve(ROOT, "artifacts/coston2-settlement-receipt.json");
const SCOPE_PATH = resolve(ROOT, "artifacts/live-scope-manifest.json");
const EVIDENCE_PATH = resolve(ROOT, "artifacts/live-evidence-manifest.json");

const proofPayAbi = parseAbi([
  "function fxrp() view returns (address)",
  "function ftsoV2() view returns (address)",
  "function xrpUsdFeedId() view returns (bytes21)",
  "function maximumPriceAge() view returns (uint64)",
  "function activeFxrpLiabilities() view returns (uint256)",
  "function invoices(uint256 invoiceId) view returns (address freelancer, address client, uint256 usdTarget, uint256 fxrpLocked, uint64 deliveryDeadline, bytes32 scopeHash, bytes32 evidenceHash, uint256 fundingPrice, int8 fundingPriceDecimals, uint64 fundingPriceTimestamp, uint256 releasePrice, int8 releasePriceDecimals, uint64 releasePriceTimestamp, uint8 status)",
  "event InvoiceCreated(uint256 indexed invoiceId, address indexed freelancer, address indexed client, uint256 usdTarget, uint64 deliveryDeadline, bytes32 scopeHash)",
  "event InvoiceFunded(uint256 indexed invoiceId, uint256 fxrpLocked, uint256 price, int8 priceDecimals, uint64 priceTimestamp)",
  "event EvidenceSubmitted(uint256 indexed invoiceId, bytes32 indexed evidenceHash, string evidenceURI)",
  "event InvoiceToppedUp(uint256 indexed invoiceId, uint256 amount, uint256 newFxrpLocked, uint256 price, int8 priceDecimals, uint64 priceTimestamp)",
  "event InvoiceReleased(uint256 indexed invoiceId, uint256 freelancerPayout, uint256 clientRefund, uint256 price, int8 priceDecimals, uint64 priceTimestamp)",
]);
const erc20Abi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
]);

const coston2 = defineChain({
  id: CHAIN_ID,
  name: "Flare Testnet Coston2",
  nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  testnet: true,
});
const client = createPublicClient({
  chain: coston2,
  transport: http(RPC_URL, { retryCount: 3, retryDelay: 1_000, timeout: 30_000 }),
});

interface Snapshot {
  clientC2flrWei: string;
  freelancerC2flrWei: string;
  clientFxrpAtomic: string;
  freelancerFxrpAtomic: string;
  contractFxrpAtomic: string;
  activeFxrpLiabilitiesAtomic: string;
}

interface SettlementReceipt {
  schemaVersion: 1;
  phase: "4B";
  network: { chainId: 114; testnet: true };
  invoice: {
    invoiceId: string;
    usdTargetAtomic: string;
    freelancer: Address;
    client: Address;
    creationBlockTimestamp: string;
    deliveryDeadline: string;
    requestedDeliveryWindowSeconds: string;
    observedSecondsFromCreationToDeadline: string;
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
    topUpAtomic: string;
    payoutPlusRefundEqualsPriorLock: true;
  };
  contract: {
    address: Address;
    runtimeBytecodeHash: Hash;
    fxrp: Address;
    ftsoV2: Address;
    feedId: string;
  };
  transactions: {
    setupGas: Hash | null;
    create: Hash | null;
    approval: Hash | null;
    funding: Hash | null;
    evidence: Hash | null;
    topUpApproval: Hash | null;
    topUp: Hash | null;
    release: Hash | null;
  };
  balances: {
    initialContractSurplusAtomic: string;
    final: Snapshot;
  };
  final: {
    invoiceState: string;
    activeFxrpLiabilitiesAtomic: string;
    contractFxrpBalanceAtomic: string;
  };
  manifests: {
    scope: { keccak256: Hash };
    evidence: { keccak256: Hash; evidenceUri: string };
  };
  executionGitCommit: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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

function requireCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

function findEvent(receipt: TransactionReceipt, name: string): Record<string, unknown> {
  const events = parseEventLogs({ abi: proofPayAbi, logs: receipt.logs, strict: true });
  const event = events.find((candidate) => candidate.eventName === name);
  requireCondition(event !== undefined, `${name} event is missing.`);
  return event.args as Record<string, unknown>;
}

function findApproval(receipt: TransactionReceipt): Record<string, unknown> {
  const events = parseEventLogs({ abi: erc20Abi, logs: receipt.logs, strict: true });
  const event = events.find((candidate) => candidate.eventName === "Approval");
  requireCondition(event !== undefined, "Funding Approval event is missing.");
  return event.args as Record<string, unknown>;
}

async function tokenBalance(token: Address, account: Address, blockNumber: bigint): Promise<bigint> {
  return await client.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account],
    blockNumber,
  });
}

async function verifyTransaction(
  hash: Hash,
  expectedFrom: Address,
  expectedTo: Address,
): Promise<TransactionReceipt> {
  const [transaction, receipt] = await Promise.all([
    client.getTransaction({ hash }),
    client.getTransactionReceipt({ hash }),
  ]);
  requireCondition(receipt.status === "success", `${hash} did not succeed.`);
  requireCondition(transaction.chainId === CHAIN_ID, `${hash} is not a chain-114 transaction.`);
  requireCondition(getAddress(transaction.from) === expectedFrom, `${hash} sender differs.`);
  requireCondition(transaction.to !== null, `${hash} unexpectedly creates a contract.`);
  requireCondition(getAddress(transaction.to) === expectedTo, `${hash} destination differs.`);
  return receipt;
}

async function main(): Promise<void> {
  const receipt = await readJson<SettlementReceipt>(RECEIPT_PATH);
  requireCondition(
    receipt.schemaVersion === 1 &&
      receipt.phase === "4B" &&
      receipt.network.chainId === CHAIN_ID &&
      receipt.network.testnet,
    "Receipt schema or network differs from Phase 4B Coston2.",
  );
  requireCondition(getAddress(receipt.contract.address) === CONTRACT, "Receipt contract differs.");
  requireCondition(getAddress(receipt.invoice.client) === CLIENT, "Receipt client differs.");
  requireCondition(
    getAddress(receipt.invoice.freelancer) === FREELANCER,
    "Receipt freelancer differs.",
  );
  requireCondition(receipt.final.invoiceState === "RELEASED", "Receipt final state is not RELEASED.");
  requireCondition(
    receipt.final.activeFxrpLiabilitiesAtomic === "0",
    "Receipt final liabilities are nonzero.",
  );

  const requiredTransactions = [
    receipt.transactions.create,
    receipt.transactions.approval,
    receipt.transactions.funding,
    receipt.transactions.evidence,
    receipt.transactions.release,
  ];
  requireCondition(requiredTransactions.every((hash) => hash !== null), "A required transaction is missing.");
  const createHash = receipt.transactions.create as Hash;
  const approvalHash = receipt.transactions.approval as Hash;
  const fundingHash = receipt.transactions.funding as Hash;
  const evidenceHash = receipt.transactions.evidence as Hash;
  const releaseHash = receipt.transactions.release as Hash;

  const transactionChecks: Array<Promise<TransactionReceipt>> = [
    verifyTransaction(createHash, FREELANCER, CONTRACT),
    verifyTransaction(approvalHash, CLIENT, getAddress(receipt.contract.fxrp)),
    verifyTransaction(fundingHash, CLIENT, CONTRACT),
    verifyTransaction(evidenceHash, FREELANCER, CONTRACT),
    verifyTransaction(releaseHash, CLIENT, CONTRACT),
  ];
  if (receipt.transactions.setupGas !== null) {
    transactionChecks.push(verifyTransaction(receipt.transactions.setupGas, CLIENT, FREELANCER));
  }
  if (BigInt(receipt.settlement.topUpAtomic) > 0n) {
    requireCondition(
      receipt.transactions.topUpApproval !== null && receipt.transactions.topUp !== null,
      "A required top-up transaction is missing.",
    );
    transactionChecks.push(
      verifyTransaction(receipt.transactions.topUpApproval, CLIENT, getAddress(receipt.contract.fxrp)),
      verifyTransaction(receipt.transactions.topUp, CLIENT, CONTRACT),
    );
  } else {
    requireCondition(
      receipt.transactions.topUpApproval === null && receipt.transactions.topUp === null,
      "Receipt includes a top-up transaction while top-up amount is zero.",
    );
  }
  const confirmed = await Promise.all(transactionChecks);
  const [createReceipt, approvalReceipt, fundingReceipt, evidenceReceipt, releaseReceipt] = confirmed;
  requireCondition(
    createReceipt !== undefined &&
      approvalReceipt !== undefined &&
      fundingReceipt !== undefined &&
      evidenceReceipt !== undefined &&
      releaseReceipt !== undefined,
    "Receipt retrieval was incomplete.",
  );

  if (receipt.transactions.setupGas !== null) {
    const setupTransaction = await client.getTransaction({ hash: receipt.transactions.setupGas });
    requireCondition(setupTransaction.value === 1_000_000_000_000_000_000n, "Gas setup was not exactly 1 C2FLR.");
  }

  const scopeBytes = await readFile(SCOPE_PATH, "utf8");
  const evidenceBytes = await readFile(EVIDENCE_PATH, "utf8");
  requireCondition(scopeBytes === canonicalJson(JSON.parse(scopeBytes)), "Scope manifest is not canonical JSON.");
  requireCondition(
    evidenceBytes === canonicalJson(JSON.parse(evidenceBytes)),
    "Evidence manifest is not canonical JSON.",
  );
  const scopeHash = keccak256(stringToHex(scopeBytes));
  const manifestEvidenceHash = keccak256(stringToHex(evidenceBytes));
  requireCondition(
    scopeHash === receipt.invoice.scopeHash && scopeHash === receipt.manifests.scope.keccak256,
    "Scope manifest hash differs from the receipt.",
  );
  requireCondition(
    manifestEvidenceHash === receipt.invoice.evidenceHash &&
      manifestEvidenceHash === receipt.manifests.evidence.keccak256,
    "Evidence manifest hash differs from the receipt.",
  );

  const [chainId, code, fxrp, ftso, feedId, maximumAge, liabilities, invoiceTuple] =
    await Promise.all([
      client.getChainId(),
      client.getCode({ address: CONTRACT }),
      client.readContract({ address: CONTRACT, abi: proofPayAbi, functionName: "fxrp" }),
      client.readContract({ address: CONTRACT, abi: proofPayAbi, functionName: "ftsoV2" }),
      client.readContract({ address: CONTRACT, abi: proofPayAbi, functionName: "xrpUsdFeedId" }),
      client.readContract({ address: CONTRACT, abi: proofPayAbi, functionName: "maximumPriceAge" }),
      client.readContract({ address: CONTRACT, abi: proofPayAbi, functionName: "activeFxrpLiabilities" }),
      client.readContract({
        address: CONTRACT,
        abi: proofPayAbi,
        functionName: "invoices",
        args: [BigInt(receipt.invoice.invoiceId)],
      }),
    ]);
  requireCondition(chainId === CHAIN_ID, "Independent RPC chain ID is not 114.");
  requireCondition(code !== undefined && code !== "0x", "Independent read found no contract code.");
  requireCondition(keccak256(code) === receipt.contract.runtimeBytecodeHash, "Runtime hash differs.");
  requireCondition(getAddress(fxrp) === getAddress(receipt.contract.fxrp), "FXRP immutable differs.");
  requireCondition(getAddress(ftso) === getAddress(receipt.contract.ftsoV2), "FTSO immutable differs.");
  requireCondition(feedId.toLowerCase() === receipt.contract.feedId.toLowerCase(), "Feed ID differs.");
  requireCondition(maximumAge === 30n, "Maximum price age differs from 30 seconds.");
  requireCondition(liabilities === 0n, "Independent read found nonzero active liabilities.");

  requireCondition(getAddress(invoiceTuple[0]) === FREELANCER, "Stored freelancer differs.");
  requireCondition(getAddress(invoiceTuple[1]) === CLIENT, "Stored client differs.");
  requireCondition(invoiceTuple[2].toString() === receipt.invoice.usdTargetAtomic, "USD target differs.");
  requireCondition(invoiceTuple[3].toString() === receipt.settlement.fxrpLockedAtomic, "Lock differs.");
  requireCondition(
    invoiceTuple[4].toString() === receipt.invoice.deliveryDeadline,
    "Delivery deadline differs.",
  );
  requireCondition(invoiceTuple[5].toLowerCase() === receipt.invoice.scopeHash, "Stored scope hash differs.");
  requireCondition(
    invoiceTuple[6].toLowerCase() === receipt.invoice.evidenceHash,
    "Stored evidence hash differs.",
  );
  requireCondition(invoiceTuple[7].toString() === receipt.settlement.fundingPrice, "Funding price differs.");
  requireCondition(
    Number(invoiceTuple[8]) === receipt.settlement.fundingPriceDecimals &&
      invoiceTuple[9].toString() === receipt.settlement.fundingPriceTimestamp,
    "Funding observation differs.",
  );
  requireCondition(invoiceTuple[10].toString() === receipt.settlement.releasePrice, "Release price differs.");
  requireCondition(
    Number(invoiceTuple[11]) === receipt.settlement.releasePriceDecimals &&
      invoiceTuple[12].toString() === receipt.settlement.releasePriceTimestamp,
    "Release observation differs.",
  );
  requireCondition(Number(invoiceTuple[13]) === 3, "Invoice is not RELEASED.");

  const created = findEvent(createReceipt, "InvoiceCreated");
  const createBlock = await client.getBlock({ blockNumber: createReceipt.blockNumber });
  requireCondition(BigInt(String(created.invoiceId)) === BigInt(receipt.invoice.invoiceId), "Create event ID differs.");
  requireCondition(String(created.scopeHash).toLowerCase() === receipt.invoice.scopeHash, "Create scope differs.");
  requireCondition(BigInt(String(created.usdTarget)) === BigInt(receipt.invoice.usdTargetAtomic), "Create target differs.");
  requireCondition(
    createBlock.timestamp.toString() === receipt.invoice.creationBlockTimestamp &&
      (BigInt(receipt.invoice.deliveryDeadline) - createBlock.timestamp).toString() ===
        receipt.invoice.observedSecondsFromCreationToDeadline,
    "Creation timestamp or observed delivery interval differs.",
  );

  const approval = findApproval(approvalReceipt);
  requireCondition(getAddress(String(approval.owner)) === CLIENT, "Approval owner differs.");
  requireCondition(getAddress(String(approval.spender)) === CONTRACT, "Approval spender differs.");

  const funded = findEvent(fundingReceipt, "InvoiceFunded");
  const fundingLock = BigInt(String(funded.fxrpLocked));
  requireCondition(
    String(funded.price) === receipt.settlement.fundingPrice &&
      Number(funded.priceDecimals) === receipt.settlement.fundingPriceDecimals &&
      String(funded.priceTimestamp) === receipt.settlement.fundingPriceTimestamp,
    "Funding event observation differs.",
  );

  const evidence = findEvent(evidenceReceipt, "EvidenceSubmitted");
  requireCondition(
    String(evidence.evidenceHash).toLowerCase() === receipt.invoice.evidenceHash,
    "Evidence event hash differs.",
  );
  requireCondition(String(evidence.evidenceURI) === receipt.invoice.evidenceUri, "Evidence URI differs.");

  const released = findEvent(releaseReceipt, "InvoiceReleased");
  const payout = BigInt(String(released.freelancerPayout));
  const refund = BigInt(String(released.clientRefund));
  const priorLock = BigInt(receipt.settlement.fxrpLockedAtomic);
  requireCondition(payout === BigInt(receipt.settlement.fxrpPaidAtomic), "Payout differs.");
  requireCondition(refund === BigInt(receipt.settlement.fxrpRefundedAtomic), "Refund differs.");
  requireCondition(payout + refund === priorLock, "Payout plus refund does not equal prior lock.");
  requireCondition(
    String(released.price) === receipt.settlement.releasePrice &&
      Number(released.priceDecimals) === receipt.settlement.releasePriceDecimals &&
      String(released.priceTimestamp) === receipt.settlement.releasePriceTimestamp,
    "Release event observation differs.",
  );

  const token = getAddress(receipt.contract.fxrp);
  const [fundClientBefore, fundClientAfter, fundContractBefore, fundContractAfter] = await Promise.all([
    tokenBalance(token, CLIENT, fundingReceipt.blockNumber - 1n),
    tokenBalance(token, CLIENT, fundingReceipt.blockNumber),
    tokenBalance(token, CONTRACT, fundingReceipt.blockNumber - 1n),
    tokenBalance(token, CONTRACT, fundingReceipt.blockNumber),
  ]);
  requireCondition(fundClientBefore - fundClientAfter === fundingLock, "Funding client delta differs.");
  requireCondition(fundContractAfter - fundContractBefore === fundingLock, "Funding contract delta differs.");

  const [releaseClientBefore, releaseClientAfter, releaseFreelancerBefore, releaseFreelancerAfter, releaseContractBefore, releaseContractAfter] =
    await Promise.all([
      tokenBalance(token, CLIENT, releaseReceipt.blockNumber - 1n),
      tokenBalance(token, CLIENT, releaseReceipt.blockNumber),
      tokenBalance(token, FREELANCER, releaseReceipt.blockNumber - 1n),
      tokenBalance(token, FREELANCER, releaseReceipt.blockNumber),
      tokenBalance(token, CONTRACT, releaseReceipt.blockNumber - 1n),
      tokenBalance(token, CONTRACT, releaseReceipt.blockNumber),
    ]);
  requireCondition(releaseClientAfter - releaseClientBefore === refund, "Release client refund delta differs.");
  requireCondition(
    releaseFreelancerAfter - releaseFreelancerBefore === payout,
    "Release freelancer payout delta differs.",
  );
  requireCondition(releaseContractBefore - releaseContractAfter === priorLock, "Release contract delta differs.");

  if (BigInt(receipt.settlement.topUpAtomic) > 0n) {
    const topUpHash = receipt.transactions.topUp as Hash;
    const topUpReceipt = await client.getTransactionReceipt({ hash: topUpHash });
    const toppedUp = findEvent(topUpReceipt, "InvoiceToppedUp");
    requireCondition(
      BigInt(String(toppedUp.amount)) === BigInt(receipt.settlement.topUpAtomic),
      "Top-up event amount differs.",
    );
  }

  const [currentClientFxrp, currentFreelancerFxrp, currentContractFxrp, currentClientC2flr, currentFreelancerC2flr] =
    await Promise.all([
      tokenBalance(token, CLIENT, await client.getBlockNumber()),
      tokenBalance(token, FREELANCER, await client.getBlockNumber()),
      tokenBalance(token, CONTRACT, await client.getBlockNumber()),
      client.getBalance({ address: CLIENT }),
      client.getBalance({ address: FREELANCER }),
    ]);
  requireCondition(
    currentClientFxrp.toString() === receipt.balances.final.clientFxrpAtomic,
    "Current client FXRP differs from receipt.",
  );
  requireCondition(
    currentFreelancerFxrp.toString() === receipt.balances.final.freelancerFxrpAtomic,
    "Current freelancer FXRP differs from receipt.",
  );
  requireCondition(
    currentContractFxrp.toString() === receipt.balances.final.contractFxrpAtomic,
    "Current contract FXRP differs from receipt.",
  );
  requireCondition(
    currentContractFxrp === BigInt(receipt.balances.initialContractSurplusAtomic),
    "Final contract balance does not equal pre-existing direct-donation surplus.",
  );
  requireCondition(
    currentClientC2flr.toString() === receipt.balances.final.clientC2flrWei,
    "Current client C2FLR differs from receipt.",
  );
  requireCondition(
    currentFreelancerC2flr.toString() === receipt.balances.final.freelancerC2flrWei,
    "Current freelancer C2FLR differs from receipt.",
  );

  console.log(
    `INDEPENDENT_VERIFICATION PASS invoice=${receipt.invoice.invoiceId} state=RELEASED liabilities=0 payout=${payout} refund=${refund}`,
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown verifier error";
  console.error(`Independent Phase 4B verification failed: ${message.split("\n")[0]}`);
  process.exitCode = 1;
});
