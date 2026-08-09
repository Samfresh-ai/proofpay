import { readFile, writeFile } from "node:fs/promises";
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

const ROOT = resolve(process.cwd());
const JOURNAL_PATH = resolve(ROOT, "artifacts/coston2-browser-invoice.json");
const RECEIPT_PATH = resolve(ROOT, "artifacts/coston2-browser-settlement-receipt.json");
const SCOPE_PATH = resolve(ROOT, "artifacts/browser-scope-manifest.json");
const EVIDENCE_PATH = resolve(ROOT, "artifacts/browser-evidence-manifest.json");
const OUTPUT_PATH = resolve(ROOT, "artifacts/browser-settlement-verification.json");
const CHAIN_ID = 114;
const RPC_URL = "https://coston2-api.flare.network/ext/C/rpc";
const CONTRACT = getAddress("0x53bE2D49f4bFCF2cc04A225Ccb7398Fb5E5EAA21");
const FXRP = getAddress("0x0b6A3645c240605887a5532109323A3E12273dc7");
const CLIENT = getAddress("0x3c47ddC46848A7a225d3491DA5c211e2E7A51F42");
const FREELANCER = getAddress("0xB9CC4f51Bb837DC56998474961250287f40FA680");
const WALLET_ACTIONS_COMMIT = "b61c6bc920015cc52f09b265620cebae44a1e5b0";

const proofPayAbi = parseAbi([
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

interface JournalTransaction {
  status: string;
  activeAccount: Address;
  transactionHash: Hash;
  broadcastCount: number;
  receipt: { status: string; blockNumber: string };
}

interface Journal {
  schemaVersion: 1;
  phase: "5B2";
  chainId: 114;
  contractAddress: Address;
  invoiceId: string;
  executionGitCommit: string;
  completionStatus: "PASS";
  protectedInputs: { runtimeBytecodeHash: Hash };
  preflight: { nextInvoiceId: string; initialSnapshot: { clientFxrpAtomic: string; freelancerFxrpAtomic: string } };
  scopeManifest: { keccak256: Hash; canonicalJson: string };
  evidenceManifest: { keccak256: Hash; canonicalJson: string; evidenceUri: string };
  transactions: {
    create: JournalTransaction;
    approveFunding: JournalTransaction | null;
    fund: JournalTransaction;
    evidence: JournalTransaction;
    approveTopUp: JournalTransaction | null;
    topUp: JournalTransaction | null;
    release: JournalTransaction;
  };
  approvalHistory?: JournalTransaction[];
  finalSnapshot: {
    clientFxrpAtomic: string;
    freelancerFxrpAtomic: string;
    contractFxrpAtomic: string;
    activeFxrpLiabilitiesAtomic: string;
  };
}

interface ReceiptArtifact {
  schemaVersion: 1;
  phase: "5B2";
  network: { chainId: 114; testnet: true };
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
    fxrpLockedAtomic: string;
    fxrpPaidAtomic: string;
    fxrpRefundedAtomic: string;
    topUpAtomic: string;
    payoutPlusRefundEqualsPriorLock: boolean;
  };
  contract: { address: Address };
  transactions: {
    create: Hash;
    approval: Hash | null;
    funding: Hash;
    evidence: Hash;
    topUpApproval: Hash | null;
    topUp: Hash | null;
    release: Hash;
    approvalHistory?: Array<Hash | null>;
  };
  final: {
    invoiceState: string;
    activeFxrpLiabilitiesAtomic: string;
    contractFxrpBalanceAtomic: string;
  };
  executionGitCommit: string;
}

function requireCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

function exactEvent(receipt: TransactionReceipt, name: "InvoiceCreated" | "InvoiceFunded" | "EvidenceSubmitted" | "InvoiceToppedUp" | "InvoiceReleased") {
  const decoded = parseEventLogs({ abi: proofPayAbi, logs: receipt.logs.filter((log) => getAddress(log.address) === CONTRACT), strict: true });
  requireCondition(decoded.length === 1 && decoded[0]?.eventName === name, `${name} is not the exact ProofPay receipt event.`);
  return decoded[0].args as Record<string, unknown>;
}

async function verifiedReceipt(hash: Hash, from: Address, to: Address): Promise<TransactionReceipt> {
  const [transaction, receipt] = await Promise.all([
    client.getTransaction({ hash }),
    client.getTransactionReceipt({ hash }),
  ]);
  requireCondition(receipt.status === "success", `${hash} reverted.`);
  requireCondition(transaction.chainId === CHAIN_ID, `${hash} is not on chain 114.`);
  requireCondition(getAddress(transaction.from) === from, `${hash} sender differs.`);
  requireCondition(transaction.to !== null && getAddress(transaction.to) === to, `${hash} destination differs.`);
  return receipt;
}

function asBigInt(value: unknown, label: string): bigint {
  requireCondition(typeof value === "bigint", `${label} is not an onchain integer.`);
  return value;
}

function asString(value: unknown, label: string): string {
  requireCondition(typeof value === "string", `${label} is not a string.`);
  return value;
}

async function main(): Promise<void> {
  const [journal, artifact, scopeBytes, evidenceBytes, chainId, code] = await Promise.all([
    readJson<Journal>(JOURNAL_PATH),
    readJson<ReceiptArtifact>(RECEIPT_PATH),
    readFile(SCOPE_PATH, "utf8"),
    readFile(EVIDENCE_PATH, "utf8"),
    client.getChainId(),
    client.getCode({ address: CONTRACT }),
  ]);
  requireCondition(chainId === CHAIN_ID, "Verifier RPC is not Coston2.");
  requireCondition(code !== undefined && code !== "0x" && keccak256(code) === journal.protectedInputs.runtimeBytecodeHash, "Runtime bytecode hash differs.");
  requireCondition(journal.schemaVersion === 1 && journal.phase === "5B2" && journal.completionStatus === "PASS", "Browser journal is not a completed Phase 5B2 record.");
  requireCondition(journal.executionGitCommit === WALLET_ACTIONS_COMMIT && artifact.executionGitCommit === WALLET_ACTIONS_COMMIT, "Wallet-actions commit differs.");
  requireCondition(artifact.network.chainId === CHAIN_ID && artifact.network.testnet && getAddress(artifact.contract.address) === CONTRACT, "Receipt network or contract differs.");
  requireCondition(journal.invoiceId === journal.preflight.nextInvoiceId && artifact.invoice.invoiceId === journal.invoiceId, "Invoice identity differs.");
  requireCondition(getAddress(artifact.invoice.client) === CLIENT && getAddress(artifact.invoice.freelancer) === FREELANCER, "Invoice parties differ.");
  requireCondition(artifact.invoice.usdTargetAtomic === "2000000", "Invoice target is not $2 atomic.");
  requireCondition(artifact.invoice.milestoneTitle === "Verify ProofPay wallet actions on Coston2", "Milestone title differs.");

  const scopeHash = keccak256(stringToHex(scopeBytes));
  const evidenceHash = keccak256(stringToHex(evidenceBytes));
  requireCondition(scopeBytes === journal.scopeManifest.canonicalJson && scopeHash === journal.scopeManifest.keccak256, "Scope bytes or hash differ from the browser journal.");
  requireCondition(evidenceBytes === journal.evidenceManifest.canonicalJson && evidenceHash === journal.evidenceManifest.keccak256, "Evidence bytes or hash differ from the browser journal.");
  requireCondition(JSON.stringify(JSON.parse(scopeBytes)) === scopeBytes, "Scope manifest is not compact canonical JSON.");
  requireCondition(JSON.stringify(JSON.parse(evidenceBytes)) === evidenceBytes, "Evidence manifest is not compact canonical JSON.");
  const evidenceManifest = JSON.parse(evidenceBytes) as Record<string, unknown>;
  requireCondition(evidenceManifest.walletActionsCommit === WALLET_ACTIONS_COMMIT, "Evidence wallet-actions commit differs.");
  requireCondition(evidenceManifest.createTransaction === artifact.transactions.create, "Evidence create transaction differs.");
  requireCondition(evidenceManifest.approvalTransaction === artifact.transactions.approval, "Evidence approval transaction differs.");
  requireCondition(evidenceManifest.fundingTransaction === artifact.transactions.funding, "Evidence funding transaction differs.");
  requireCondition(Array.isArray(evidenceManifest.deliveryUrls) && evidenceManifest.deliveryUrls[0] === artifact.invoice.evidenceUri, "Evidence public URL differs.");

  const [createReceipt, fundingReceipt, evidenceReceipt, releaseReceipt] = await Promise.all([
    verifiedReceipt(artifact.transactions.create, FREELANCER, CONTRACT),
    verifiedReceipt(artifact.transactions.funding, CLIENT, CONTRACT),
    verifiedReceipt(artifact.transactions.evidence, FREELANCER, CONTRACT),
    verifiedReceipt(artifact.transactions.release, CLIENT, CONTRACT),
  ]);
  requireCondition(createReceipt.blockNumber <= fundingReceipt.blockNumber && fundingReceipt.blockNumber <= evidenceReceipt.blockNumber && evidenceReceipt.blockNumber <= releaseReceipt.blockNumber, "Lifecycle transaction order differs.");
  const created = exactEvent(createReceipt, "InvoiceCreated");
  const funded = exactEvent(fundingReceipt, "InvoiceFunded");
  const submitted = exactEvent(evidenceReceipt, "EvidenceSubmitted");
  const released = exactEvent(releaseReceipt, "InvoiceReleased");
  const invoiceId = BigInt(journal.invoiceId);
  for (const [label, args] of [["create", created], ["fund", funded], ["evidence", submitted], ["release", released]] as const) {
    requireCondition(asBigInt(args.invoiceId, `${label} invoice ID`) === invoiceId, `${label} invoice ID differs.`);
  }
  requireCondition(getAddress(asString(created.freelancer, "created freelancer")) === FREELANCER, "Created freelancer differs.");
  requireCondition(getAddress(asString(created.client, "created client")) === CLIENT, "Created client differs.");
  requireCondition(asBigInt(created.usdTarget, "created target") === 2_000_000n, "Created target differs.");
  requireCondition(asString(created.scopeHash, "created scope hash") === scopeHash, "Created scope commitment differs.");
  requireCondition(asString(submitted.evidenceHash, "submitted evidence hash") === evidenceHash, "Submitted evidence commitment differs.");
  requireCondition(asString(submitted.evidenceURI, "submitted evidence URI") === journal.evidenceManifest.evidenceUri, "Submitted evidence URI differs.");

  if (artifact.transactions.approval) {
    const approvalReceipt = await verifiedReceipt(artifact.transactions.approval, CLIENT, FXRP);
    const approvals = parseEventLogs({ abi: erc20Abi, logs: approvalReceipt.logs.filter((log) => getAddress(log.address) === FXRP), eventName: "Approval", strict: true });
    requireCondition(approvals.length === 1 && getAddress(approvals[0]?.args.owner ?? "") === CLIENT && getAddress(approvals[0]?.args.spender ?? "") === CONTRACT, "Funding approval does not identify the exact owner and spender.");
  }

  let priorLock = asBigInt(funded.fxrpLocked, "funded lock");
  let topUpAtomic = 0n;
  if (artifact.transactions.topUp) {
    const topUpReceipt = await verifiedReceipt(artifact.transactions.topUp, CLIENT, CONTRACT);
    const toppedUp = exactEvent(topUpReceipt, "InvoiceToppedUp");
    topUpAtomic = asBigInt(toppedUp.amount, "top-up amount");
    priorLock = asBigInt(toppedUp.newFxrpLocked, "post-top-up lock");
  }
  const payout = asBigInt(released.freelancerPayout, "freelancer payout");
  const refund = asBigInt(released.clientRefund, "client refund");
  requireCondition(payout + refund === priorLock, "Payout plus refund does not equal the pre-release lock.");
  requireCondition(artifact.settlement.fxrpLockedAtomic === asBigInt(funded.fxrpLocked, "artifact lock").toString(), "Receipt lock differs.");
  requireCondition(artifact.settlement.fxrpPaidAtomic === payout.toString() && artifact.settlement.fxrpRefundedAtomic === refund.toString(), "Receipt payout or refund differs.");
  requireCondition(artifact.settlement.topUpAtomic === topUpAtomic.toString() && artifact.settlement.payoutPlusRefundEqualsPriorLock, "Receipt top-up or conservation flag differs.");

  const latest = await client.getBlock({ blockTag: "latest" });
  const [invoice, liabilities, contractBalance, clientBalance, freelancerBalance] = await Promise.all([
    client.readContract({ address: CONTRACT, abi: proofPayAbi, functionName: "invoices", args: [invoiceId], blockNumber: latest.number }),
    client.readContract({ address: CONTRACT, abi: proofPayAbi, functionName: "activeFxrpLiabilities", blockNumber: latest.number }),
    client.readContract({ address: FXRP, abi: erc20Abi, functionName: "balanceOf", args: [CONTRACT], blockNumber: latest.number }),
    client.readContract({ address: FXRP, abi: erc20Abi, functionName: "balanceOf", args: [CLIENT], blockNumber: latest.number }),
    client.readContract({ address: FXRP, abi: erc20Abi, functionName: "balanceOf", args: [FREELANCER], blockNumber: latest.number }),
  ]);
  requireCondition(Number(invoice[13]) === 3 && String(invoice[3]) === priorLock.toString(), "Final invoice is not RELEASED with its historical lock preserved.");
  requireCondition(String(invoice[5]) === scopeHash && String(invoice[6]) === evidenceHash, "Final commitments differ.");
  requireCondition(liabilities === 0n && contractBalance === 0n, "Final liabilities or contract FXRP balance are nonzero.");
  requireCondition(artifact.final.invoiceState === "RELEASED" && artifact.final.activeFxrpLiabilitiesAtomic === "0" && artifact.final.contractFxrpBalanceAtomic === "0", "Receipt final state differs.");
  requireCondition(clientBalance.toString() === journal.finalSnapshot.clientFxrpAtomic && freelancerBalance.toString() === journal.finalSnapshot.freelancerFxrpAtomic, "Party balances differ from the final browser journal snapshot.");
  for (const entry of Object.values(journal.transactions)) {
    if (!entry) continue;
    requireCondition(entry.status === "COMPLETE" && entry.receipt.status === "success" && entry.broadcastCount === 1, "A browser journal transaction was not confirmed exactly once.");
  }
  for (const entry of journal.approvalHistory ?? []) {
    requireCondition(entry.status === "COMPLETE" && entry.receipt.status === "success" && entry.broadcastCount === 1, "A superseded exact approval was not confirmed exactly once.");
    await verifiedReceipt(entry.transactionHash, CLIENT, FXRP);
  }

  const verification = {
    schemaVersion: 1,
    phase: "5B2",
    status: "PASS",
    verifiedAt: new Date().toISOString(),
    chainId: CHAIN_ID,
    invoiceId: journal.invoiceId,
    pinnedBlock: latest.number.toString(),
    checks: {
      browserJournalTransactionsConfirmedExactlyOnce: true,
      canonicalManifestHashesMatch: true,
      lifecycleReceiptsMatch: true,
      onchainInvoiceMatches: true,
      payoutPlusRefundEqualsPriorLock: true,
      liabilitiesAndContractBalanceZero: true,
      partyBalancesMatch: true,
    },
  };
  await writeFile(OUTPUT_PATH, `${JSON.stringify(verification, null, 2)}\n`, "utf8");
  console.log(`BROWSER_SETTLEMENT_VERIFICATION PASS invoice=${journal.invoiceId} block=${latest.number}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Browser settlement verification failed.");
  process.exitCode = 1;
});
