import { spawn } from "node:child_process";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";

import {
  createPublicClient,
  createWalletClient,
  decodeAbiParameters,
  defineChain,
  encodeAbiParameters,
  encodeDeployData,
  encodeErrorResult,
  encodeFunctionData,
  formatEther,
  getAddress,
  getContractAddress,
  http,
  keccak256,
  parseAbi,
  zeroAddress,
  type Abi,
  type Address,
  type Hash,
  type Hex,
  type TransactionReceipt,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";

const EXPECTED_CHAIN_ID = 114;
const COSTON2_RPC_URL = "https://coston2-api.flare.network/ext/C/rpc";
const COSTON2_EXPLORER_URL = "https://coston2-explorer.flare.network";
const COSTON2_VERIFIER_URL = `${COSTON2_EXPLORER_URL}/api/`;
const FLARE_CONTRACT_REGISTRY_ADDRESS = getAddress(
  "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019",
);
const RECORDED_DEPLOYER = getAddress("0x3c47ddC46848A7a225d3491DA5c211e2E7A51F42");
const XRP_USD_FEED_ID =
  "0x015852502f55534400000000000000000000000000" as const;
const MAXIMUM_PRICE_AGE_SECONDS = 30;
const FXRP_DECIMALS = 6;
const GAS_LIMIT_NUMERATOR = 120n;
const GAS_LIMIT_DENOMINATOR = 100n;
const TEST_USD_TARGET = 100_000_000n;
const REPOSITORY_ROOT = resolve(process.cwd());
const CONTRACTS_ROOT = resolve(REPOSITORY_ROOT, "contracts");
const DEPLOYMENT_PATH = resolve(REPOSITORY_ROOT, "deployment/coston2.json");
const DEPLOYMENT_TEMP_PATH = resolve(REPOSITORY_ROOT, "deployment/coston2.json.tmp");
const ESCROW_ARTIFACT_PATH = resolve(
  CONTRACTS_ROOT,
  "out/ProofPayEscrow.sol/ProofPayEscrow.json",
);
const QUOTE_SIMULATOR_ARTIFACT_PATH = resolve(
  CONTRACTS_ROOT,
  "out/DeployProofPay.s.sol/ProofPayFundingQuoteSimulation.json",
);
const SECRET_DIRECTORY = resolve(homedir(), ".local/share/proofpay");
const SECRET_PATH = resolve(SECRET_DIRECTORY, "coston2-burner-wallets.json");
const FOUNDRY_FORGE = resolve(homedir(), ".foundry/bin/forge");

const registryAbi = parseAbi([
  "function getContractAddressByName(string _name) view returns (address)",
]);
const assetManagerAbi = parseAbi(["function fAsset() view returns (address)"]);
const erc20Abi = parseAbi([
  "function decimals() view returns (uint8)",
  "function balanceOf(address account) view returns (uint256)",
]);
const ftsoV2Abi = parseAbi([
  "function calculateFeeById(bytes21 _feedId) view returns (uint256)",
  "function getFeedById(bytes21 _feedId) payable returns (uint256 _value, int8 _decimals, uint64 _timestamp)",
]);
const proofPayReadAbi = parseAbi([
  "function fxrp() view returns (address)",
  "function ftsoV2() view returns (address)",
  "function xrpUsdFeedId() view returns (bytes21)",
  "function maximumPriceAge() view returns (uint64)",
  "function activeFxrpLiabilities() view returns (uint256)",
  "function invoices(uint256 invoiceId) view returns (address freelancer, address client, uint256 usdTarget, uint256 fxrpLocked, uint64 deliveryDeadline, bytes32 scopeHash, bytes32 evidenceHash, uint256 fundingPrice, int8 fundingPriceDecimals, uint64 fundingPriceTimestamp, uint256 releasePrice, int8 releasePriceDecimals, uint64 releasePriceTimestamp, uint8 status)",
  "function quoteFunding(uint256 invoiceId) returns (uint256 requiredFxrp, uint256 price, int8 priceDecimals, uint64 priceTimestamp)",
  "error InvoiceNotFound(uint256 invoiceId)",
]);

const coston2 = defineChain({
  id: EXPECTED_CHAIN_ID,
  name: "Flare Testnet Coston2",
  nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
  rpcUrls: { default: { http: [COSTON2_RPC_URL] } },
  blockExplorers: {
    default: { name: "Coston2 Explorer", url: COSTON2_EXPLORER_URL },
  },
  testnet: true,
});

const publicClient = createPublicClient({
  chain: coston2,
  transport: http(COSTON2_RPC_URL),
});

type DeploymentStatus =
  | "INTENT_REVIEWED"
  | "SIGNED_READY_TO_SUBMIT"
  | "TRANSACTION_SUBMITTED"
  | "DEPLOYED_VERIFIED";

interface SecretFile {
  schemaVersion: 1;
  purpose: "proofpay-coston2-technical-probe";
  chainId: 114;
  senderPrivateKey: Hex;
  recipientPrivateKey: Hex;
}

interface ForgeArtifact {
  abi: Abi;
  bytecode: { object: Hex };
  deployedBytecode: { object: Hex };
  metadata: {
    compiler: { version: string };
    settings: {
      optimizer: { enabled: boolean; runs: number };
      viaIR: boolean;
      evmVersion: string;
    };
  };
}

interface PhaseOneArtifact {
  status: string;
  registry: {
    assetManagerAddress: Address;
    ftsoV2Address: Address;
  };
  fxrp: { address: Address; decimals: number };
  xrpUsd: { feedId: Hex };
  wallets: { sender: Address };
}

interface PhaseThreeArtifact {
  status: string;
  registry: { ftsoV2Address: Address };
  feed: { feedId: Hex };
  statistics: { nonzeroFeeCount: number };
  policy: { plannedMaxPriceAgeSeconds: number; recommendation: string };
}

interface CommandResult {
  command: string;
  workingDirectory: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface DeploymentRecord {
  schemaVersion: 1;
  phase: "4A";
  status: DeploymentStatus;
  network: {
    name: "Flare Testnet Coston2";
    chainId: 114;
    rpc: {
      classification: "official-public-rpc";
      url: string;
      embedsSecrets: false;
    };
  };
  deployer: {
    address: Address;
    balanceBeforeWei: string;
    balanceBeforeC2flr: string;
    balanceAfterWei: string | null;
    balanceAfterC2flr: string | null;
  };
  dependencies: {
    registryAddress: Address;
    assetManagerAddress: Address;
    fxrpAddress: Address;
    fxrpDecimals: 6;
    ftsoV2Address: Address;
    xrpUsdFeedId: typeof XRP_USD_FEED_ID;
    maximumPriceAgeSeconds: 30;
    currentFtsoFeeWei: "0";
    preflightFeed: {
      value: string;
      decimals: number;
      timestamp: string;
      timestampIso: string;
      ageSecondsAtLatestBlock: number;
      latestBlock: string;
    };
  };
  compiler: {
    version: string;
    optimizerEnabled: true;
    optimizerRuns: 200;
    viaIr: true;
    evmVersion: string;
  };
  intent: {
    checkpointedAt: string;
    reviewStatus: "PASS";
    reviewedAgainst: {
      contractSpec: "PASS";
      phaseOneProbe: "MATCH" | "CURRENT_REGISTRY_CHANGE_ACCEPTED";
      phaseThreeBLiveFtso: "PASS";
    };
    constructorArguments: {
      fxrp: Address;
      ftsoV2: Address;
      xrpUsdFeedId: typeof XRP_USD_FEED_ID;
      maximumPriceAgeSeconds: 30;
    };
    gitCommit: string;
    expectedCreationBytecodeHash: Hash;
    expectedRuntimeBytecodeHash: Hash;
    estimatedGas: string;
    gasLimit: string;
    gasPriceWei: string;
    expectedMaximumFeeWei: string;
    expectedMaximumFeeC2flr: string;
    deployerNonce: string;
    expectedContractAddress: Address;
    foundryDryRun: CommandResult;
  };
  deployment: {
    plannedTransactionHash: Hash | null;
    transactionHash: Hash | null;
    submittedAt: string | null;
    contractAddress: Address | null;
    blockNumber: string | null;
    gasUsed: string | null;
    effectiveGasPriceWei: string | null;
    totalFeeWei: string | null;
    totalFeeC2flr: string | null;
    timestamp: string | null;
    timestampIso: string | null;
    gitCommit: string;
  };
  bytecodeVerification: {
    status: "PENDING" | "PASS";
    expectedRuntimeBytecodeHash: Hash;
    deployedRuntimeBytecodeHash: Hash | null;
    creationTransactionInputHash: Hash | null;
  };
  postDeployment: null | {
    chainId: 114;
    receiptStatus: "success";
    constructorDependenciesMatch: true;
    fxrpDecimals: 6;
    activeFxrpLiabilities: "0";
    firstInvoiceSlotEmpty: true;
    invoiceCount: "0";
    invoiceCountEvidence: string;
    contractFxrpBalance: "0";
    solvent: true;
    quoteSimulation: {
      status: "PASS";
      method: "non-persistent eth_call contract creation";
      usdTargetAtomic: "100000000";
      requiredFundingFxrpAtomic: string;
      price: string;
      priceDecimals: number;
      priceTimestamp: string;
      independentMathMatch: true;
      persistentStateChanged: false;
    };
    stalePriceSimulation: {
      status: "PENDING" | "PASS";
      environment: "existing deterministic mock";
      command: string;
    };
    invalidInvoiceLookup: {
      status: "PASS";
      invoiceId: "1";
      expectedErrorData: Hex;
      observedErrorData: Hex;
    };
  };
  explorer: {
    transaction: string | null;
    contract: string | null;
  };
  sourceVerification: {
    status: "NOT_ATTEMPTED" | "VERIFIED" | "FAILED";
    failureClass: null | "EXPLORER_OR_TOOLING" | "CONTRACT_VERIFICATION_MISMATCH";
    attemptedAt: string | null;
    command: string | null;
    workingDirectory: string | null;
    exitCode: number | null;
    response: string | null;
  };
  guardrails: {
    invoiceTransactionSent: false;
    fxrpEscrowActionSent: false;
    faucetRequested: false;
    walletCreated: false;
  };
}

interface PreparedDeployment {
  account: PrivateKeyAccount;
  initCode: Hex;
  gasLimit: bigint;
  gasPrice: bigint;
  nonce: bigint;
  record: DeploymentRecord;
}

function isPrivateKey(value: unknown): value is Hex {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function safeErrorMessage(error: unknown): string {
  if (isObject(error) && typeof error.shortMessage === "string") return error.shortMessage;
  if (error instanceof Error) return error.message.split("\n")[0] ?? "unknown error";
  return "unknown error";
}

function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  return numerator / denominator + (numerator % denominator === 0n ? 0n : 1n);
}

async function enforceSecretPermissions(): Promise<void> {
  const [directoryStats, fileStats] = await Promise.all([
    stat(SECRET_DIRECTORY),
    stat(SECRET_PATH),
  ]);
  if ((directoryStats.mode & 0o077) !== 0) {
    throw new Error("The burner-wallet secret directory is not owner-only.");
  }
  if ((fileStats.mode & 0o077) !== 0) {
    throw new Error("The burner-wallet secret file is not owner-only.");
  }
  if (process.getuid !== undefined) {
    const currentUser = process.getuid();
    if (directoryStats.uid !== currentUser || fileStats.uid !== currentUser) {
      throw new Error("The burner-wallet secret storage is not owned by the current user.");
    }
  }
}

async function readDeployer(): Promise<PrivateKeyAccount> {
  await enforceSecretPermissions();
  const parsed = JSON.parse(await readFile(SECRET_PATH, "utf8")) as Partial<SecretFile>;
  if (
    parsed.schemaVersion !== 1 ||
    parsed.purpose !== "proofpay-coston2-technical-probe" ||
    parsed.chainId !== EXPECTED_CHAIN_ID ||
    !isPrivateKey(parsed.senderPrivateKey)
  ) {
    throw new Error("The owner-only wallet file does not match the recorded Coston2 schema.");
  }
  const account = privateKeyToAccount(parsed.senderPrivateKey);
  if (account.address !== RECORDED_DEPLOYER) {
    throw new Error("The funded sender wallet does not match the recorded Phase 1 deployer.");
  }
  return account;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function readGitCommit(): Promise<string> {
  const result = await runCommand("git", ["rev-parse", "HEAD"], REPOSITORY_ROOT);
  if (result.exitCode !== 0) throw new Error("Unable to read the current git commit.");
  return result.stdout.trim();
}

async function requireContractCode(label: string, address: Address): Promise<void> {
  if (address === zeroAddress) throw new Error(`${label} resolved to the zero address.`);
  const code = await publicClient.getCode({ address });
  if (code === undefined || code === "0x") {
    throw new Error(`${label} does not contain deployed bytecode.`);
  }
}

async function runCommand(
  executable: string,
  args: string[],
  workingDirectory: string,
  environment?: NodeJS.ProcessEnv,
): Promise<CommandResult> {
  return await new Promise((resolvePromise, reject) => {
    const child = spawn(executable, args, {
      cwd: workingDirectory,
      env: environment ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      const exitCode = code ?? 1;
      resolvePromise({
        command: [executable, ...args].join(" "),
        workingDirectory,
        exitCode,
        stdout,
        stderr,
      });
    });
  });
}

async function writeRecord(record: DeploymentRecord): Promise<void> {
  await mkdir(resolve(REPOSITORY_ROOT, "deployment"), { recursive: true });
  await writeFile(DEPLOYMENT_TEMP_PATH, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  await rename(DEPLOYMENT_TEMP_PATH, DEPLOYMENT_PATH);
}

async function readRecord(): Promise<DeploymentRecord> {
  const record = await readJson<DeploymentRecord>(DEPLOYMENT_PATH);
  if (record.schemaVersion !== 1 || record.phase !== "4A" || record.network.chainId !== 114) {
    throw new Error("The deployment record does not match the Phase 4A Coston2 schema.");
  }
  return record;
}

async function collectPreparedDeployment(): Promise<PreparedDeployment> {
  const account = await readDeployer();
  const actualChainId = await publicClient.getChainId();
  if (actualChainId !== EXPECTED_CHAIN_ID || coston2.id !== EXPECTED_CHAIN_ID) {
    throw new Error(`Expected Coston2 chain 114, received ${actualChainId}.`);
  }

  const [phaseOne, phaseThree, architecture, artifact, gitCommit] =
    await Promise.all([
      readJson<PhaseOneArtifact>(resolve(REPOSITORY_ROOT, "artifacts/flare-probe.json")),
      readJson<PhaseThreeArtifact>(resolve(REPOSITORY_ROOT, "artifacts/ftso-tolerance.json")),
      readFile(resolve(REPOSITORY_ROOT, "docs/ARCHITECTURE.md"), "utf8"),
      readJson<ForgeArtifact>(ESCROW_ARTIFACT_PATH),
      readGitCommit(),
    ]);

  if (phaseOne.status !== "PASS" || getAddress(phaseOne.wallets.sender) !== account.address) {
    throw new Error("Phase 1 evidence does not support the selected deployer.");
  }
  if (
    phaseOne.xrpUsd.feedId.toLowerCase() !== XRP_USD_FEED_ID ||
    phaseOne.fxrp.decimals !== FXRP_DECIMALS
  ) {
    throw new Error("Phase 1 evidence disagrees with the FXRP/feed deployment configuration.");
  }
  if (
    phaseThree.status !== "PASS" ||
    phaseThree.feed.feedId.toLowerCase() !== XRP_USD_FEED_ID ||
    phaseThree.statistics.nonzeroFeeCount !== 0 ||
    phaseThree.policy.plannedMaxPriceAgeSeconds !== MAXIMUM_PRICE_AGE_SECONDS ||
    phaseThree.policy.recommendation !== "KEEP_30_SECONDS"
  ) {
    throw new Error("Phase 3B live FTSO evidence does not support this deployment configuration.");
  }
  if (
    !architecture.includes(XRP_USD_FEED_ID) ||
    !architecture.includes("30-second maximum price age")
  ) {
    throw new Error("The public architecture record does not support the constructor arguments.");
  }
  if (
    artifact.metadata.compiler.version !== "0.8.25+commit.b61c2a91" ||
    artifact.metadata.settings.optimizer.enabled !== true ||
    artifact.metadata.settings.optimizer.runs !== 200 ||
    artifact.metadata.settings.viaIR !== true
  ) {
    throw new Error("The local artifact does not use the reproducible compiler settings.");
  }

  await requireContractCode("Flare Contract Registry", FLARE_CONTRACT_REGISTRY_ADDRESS);
  const [assetManagerAddress, ftsoV2Address] = await Promise.all([
    publicClient.readContract({
      address: FLARE_CONTRACT_REGISTRY_ADDRESS,
      abi: registryAbi,
      functionName: "getContractAddressByName",
      args: ["AssetManagerFXRP"],
    }),
    publicClient.readContract({
      address: FLARE_CONTRACT_REGISTRY_ADDRESS,
      abi: registryAbi,
      functionName: "getContractAddressByName",
      args: ["FtsoV2"],
    }),
  ]);
  const assetManager = getAddress(assetManagerAddress);
  const ftsoV2 = getAddress(ftsoV2Address);
  await Promise.all([
    requireContractCode("AssetManagerFXRP", assetManager),
    requireContractCode("FtsoV2", ftsoV2),
  ]);

  const fxrpAddress = getAddress(
    await publicClient.readContract({
      address: assetManager,
      abi: assetManagerAbi,
      functionName: "fAsset",
    }),
  );
  await requireContractCode("FXRP", fxrpAddress);
  const fxrpDecimals = await publicClient.readContract({
    address: fxrpAddress,
    abi: erc20Abi,
    functionName: "decimals",
  });
  if (fxrpDecimals !== FXRP_DECIMALS) {
    throw new Error(`FXRP decimals must be six; resolved token reports ${fxrpDecimals}.`);
  }

  const [fee, feedSimulation, latestBlock] = await Promise.all([
    publicClient.readContract({
      address: ftsoV2,
      abi: ftsoV2Abi,
      functionName: "calculateFeeById",
      args: [XRP_USD_FEED_ID],
    }),
    publicClient.simulateContract({
      address: ftsoV2,
      abi: ftsoV2Abi,
      functionName: "getFeedById",
      args: [XRP_USD_FEED_ID],
      value: 0n,
    }),
    publicClient.getBlock({ blockTag: "latest" }),
  ]);
  if (fee !== 0n) throw new Error(`FTSO calculateFeeById returned ${fee}.`);
  const [feedValue, feedDecimals, feedTimestamp] = feedSimulation.result;
  if (
    feedValue === 0n ||
    feedDecimals < 0 ||
    feedDecimals > 18 ||
    feedTimestamp === 0n ||
    feedTimestamp > latestBlock.timestamp
  ) {
    throw new Error("The current XRP/USD FTSO observation is invalid.");
  }
  const feedAge = latestBlock.timestamp - feedTimestamp;
  if (feedAge >= BigInt(MAXIMUM_PRICE_AGE_SECONDS)) {
    throw new Error(`The current XRP/USD observation is ${feedAge}s old, not below 30s.`);
  }

  const constructorArguments = [
    fxrpAddress,
    ftsoV2,
    XRP_USD_FEED_ID,
    BigInt(MAXIMUM_PRICE_AGE_SECONDS),
  ] as const;
  const initCode = encodeDeployData({
    abi: artifact.abi,
    bytecode: artifact.bytecode.object,
    args: constructorArguments,
  });
  const creationSimulation = await publicClient.call({ account: account.address, data: initCode });
  const expectedRuntimeBytecode = creationSimulation.data;
  if (expectedRuntimeBytecode === undefined || expectedRuntimeBytecode === "0x") {
    throw new Error("The live-RPC constructor simulation returned no runtime bytecode.");
  }

  const [estimatedGas, gasPrice, balance, nonceNumber] = await Promise.all([
    publicClient.estimateGas({ account: account.address, data: initCode }),
    publicClient.getGasPrice(),
    publicClient.getBalance({ address: account.address }),
    publicClient.getTransactionCount({ address: account.address, blockTag: "pending" }),
  ]);
  const gasLimit = ceilDiv(
    estimatedGas * GAS_LIMIT_NUMERATOR,
    GAS_LIMIT_DENOMINATOR,
  );
  const expectedMaximumFee = gasLimit * gasPrice;
  if (balance < expectedMaximumFee) {
    throw new Error(
      `Deployer balance ${formatEther(balance)} C2FLR is below the maximum expected fee ${formatEther(expectedMaximumFee)} C2FLR.`,
    );
  }
  const nonce = BigInt(nonceNumber);
  const expectedContractAddress = getContractAddress({ from: account.address, nonce });

  const foundryDryRun = await runCommand(
    FOUNDRY_FORGE,
    [
      "script",
      "script/DeployProofPay.s.sol:DeployProofPay",
      "--rpc-url",
      COSTON2_RPC_URL,
      "--sender",
      account.address,
      "--legacy",
      "--color",
      "never",
    ],
    CONTRACTS_ROOT,
    {
      ...process.env,
      PROOFPAY_DEPLOYER_ADDRESS: account.address,
      PROOFPAY_EXPECTED_MAX_FEE_WEI: expectedMaximumFee.toString(),
    },
  );
  if (foundryDryRun.exitCode !== 0) {
    throw new Error(`Foundry deployment dry run failed: ${foundryDryRun.stderr.trim()}`);
  }

  const phaseOneAddressesMatch =
    getAddress(phaseOne.registry.assetManagerAddress) === assetManager &&
    getAddress(phaseOne.registry.ftsoV2Address) === ftsoV2 &&
    getAddress(phaseOne.fxrp.address) === fxrpAddress;
  const phaseThreeAddressMatches = getAddress(phaseThree.registry.ftsoV2Address) === ftsoV2;
  const runtimeHash = keccak256(expectedRuntimeBytecode);
  const creationHash = keccak256(initCode);

  const record: DeploymentRecord = {
    schemaVersion: 1,
    phase: "4A",
    status: "INTENT_REVIEWED",
    network: {
      name: "Flare Testnet Coston2",
      chainId: 114,
      rpc: {
        classification: "official-public-rpc",
        url: COSTON2_RPC_URL,
        embedsSecrets: false,
      },
    },
    deployer: {
      address: account.address,
      balanceBeforeWei: balance.toString(),
      balanceBeforeC2flr: formatEther(balance),
      balanceAfterWei: null,
      balanceAfterC2flr: null,
    },
    dependencies: {
      registryAddress: FLARE_CONTRACT_REGISTRY_ADDRESS,
      assetManagerAddress: assetManager,
      fxrpAddress,
      fxrpDecimals: 6,
      ftsoV2Address: ftsoV2,
      xrpUsdFeedId: XRP_USD_FEED_ID,
      maximumPriceAgeSeconds: 30,
      currentFtsoFeeWei: "0",
      preflightFeed: {
        value: feedValue.toString(),
        decimals: feedDecimals,
        timestamp: feedTimestamp.toString(),
        timestampIso: new Date(Number(feedTimestamp) * 1_000).toISOString(),
        ageSecondsAtLatestBlock: Number(feedAge),
        latestBlock: latestBlock.number.toString(),
      },
    },
    compiler: {
      version: artifact.metadata.compiler.version,
      optimizerEnabled: true,
      optimizerRuns: 200,
      viaIr: true,
      evmVersion: artifact.metadata.settings.evmVersion,
    },
    intent: {
      checkpointedAt: new Date().toISOString(),
      reviewStatus: "PASS",
      reviewedAgainst: {
        contractSpec: "PASS",
        phaseOneProbe:
          phaseOneAddressesMatch && phaseThreeAddressMatches
            ? "MATCH"
            : "CURRENT_REGISTRY_CHANGE_ACCEPTED",
        phaseThreeBLiveFtso: "PASS",
      },
      constructorArguments: {
        fxrp: fxrpAddress,
        ftsoV2,
        xrpUsdFeedId: XRP_USD_FEED_ID,
        maximumPriceAgeSeconds: 30,
      },
      gitCommit,
      expectedCreationBytecodeHash: creationHash,
      expectedRuntimeBytecodeHash: runtimeHash,
      estimatedGas: estimatedGas.toString(),
      gasLimit: gasLimit.toString(),
      gasPriceWei: gasPrice.toString(),
      expectedMaximumFeeWei: expectedMaximumFee.toString(),
      expectedMaximumFeeC2flr: formatEther(expectedMaximumFee),
      deployerNonce: nonce.toString(),
      expectedContractAddress,
      foundryDryRun,
    },
    deployment: {
      plannedTransactionHash: null,
      transactionHash: null,
      submittedAt: null,
      contractAddress: null,
      blockNumber: null,
      gasUsed: null,
      effectiveGasPriceWei: null,
      totalFeeWei: null,
      totalFeeC2flr: null,
      timestamp: null,
      timestampIso: null,
      gitCommit,
    },
    bytecodeVerification: {
      status: "PENDING",
      expectedRuntimeBytecodeHash: runtimeHash,
      deployedRuntimeBytecodeHash: null,
      creationTransactionInputHash: null,
    },
    postDeployment: null,
    explorer: { transaction: null, contract: null },
    sourceVerification: {
      status: "NOT_ATTEMPTED",
      failureClass: null,
      attemptedAt: null,
      command: null,
      workingDirectory: null,
      exitCode: null,
      response: null,
    },
    guardrails: {
      invoiceTransactionSent: false,
      fxrpEscrowActionSent: false,
      faucetRequested: false,
      walletCreated: false,
    },
  };

  return { account, initCode, gasLimit, gasPrice, nonce, record };
}

function extractRpcErrorData(error: unknown): Hex | undefined {
  const visited = new Set<unknown>();
  function visit(value: unknown): Hex | undefined {
    if (visited.has(value)) return undefined;
    if (typeof value === "string" && /^0x[0-9a-fA-F]+$/.test(value)) return value as Hex;
    if (!isObject(value)) return undefined;
    visited.add(value);
    for (const key of ["data", "cause", "error", "details"]) {
      const result = visit(value[key]);
      if (result !== undefined) return result;
    }
    return undefined;
  }
  return visit(error);
}

async function assertInvalidInvoiceLookup(contractAddress: Address): Promise<{
  expected: Hex;
  observed: Hex;
}> {
  const callData = encodeFunctionData({
    abi: proofPayReadAbi,
    functionName: "quoteFunding",
    args: [1n],
  });
  const expected = encodeErrorResult({
    abi: proofPayReadAbi,
    errorName: "InvoiceNotFound",
    args: [1n],
  });
  try {
    await publicClient.call({ to: contractAddress, data: callData });
  } catch (error) {
    const observed = extractRpcErrorData(error);
    if (observed === expected) return { expected, observed };
    throw new Error("Invalid invoice lookup did not return InvoiceNotFound(1).");
  }
  throw new Error("Invalid invoice lookup unexpectedly succeeded.");
}

async function simulateLiveFundingQuote(
  contractAddress: Address,
  account: Address,
): Promise<{
  requiredFxrp: bigint;
  price: bigint;
  priceDecimals: number;
  priceTimestamp: bigint;
}> {
  const artifact = await readJson<ForgeArtifact>(QUOTE_SIMULATOR_ARTIFACT_PATH);
  const data = encodeDeployData({
    abi: artifact.abi,
    bytecode: artifact.bytecode.object,
    args: [contractAddress],
  });
  const result = await publicClient.call({ account, data });
  if (result.data === undefined || result.data === "0x") {
    throw new Error("The non-persistent funding quote simulation returned no data.");
  }
  const [requiredFxrp, price, priceDecimals, priceTimestamp] = decodeAbiParameters(
    [
      { type: "uint256" },
      { type: "uint256" },
      { type: "int8" },
      { type: "uint64" },
    ],
    result.data,
  );
  const scale = 10n ** BigInt(priceDecimals);
  const baseRequired = ceilDiv(TEST_USD_TARGET * scale, price);
  const independentFunding = ceilDiv(baseRequired * 11_000n, 10_000n);
  if (requiredFxrp !== independentFunding) {
    throw new Error("The live $100 quote does not match independent integer math.");
  }
  return { requiredFxrp, price, priceDecimals, priceTimestamp };
}

async function finalizeReceipt(
  record: DeploymentRecord,
  receipt: TransactionReceipt,
): Promise<DeploymentRecord> {
  if (receipt.status !== "success" || receipt.contractAddress == null) {
    throw new Error("The deployment receipt was not successful contract creation.");
  }
  const contractAddress = getAddress(receipt.contractAddress);
  if (contractAddress !== record.intent.expectedContractAddress) {
    throw new Error("The receipt contract address differs from the intent prediction.");
  }
  const transactionHash = record.deployment.transactionHash ?? record.deployment.plannedTransactionHash;
  if (transactionHash === null) throw new Error("The deployment hash is missing from the record.");

  const [transaction, block, deployedCode, artifact] = await Promise.all([
    publicClient.getTransaction({ hash: transactionHash }),
    publicClient.getBlock({ blockNumber: receipt.blockNumber }),
    publicClient.getCode({ address: contractAddress, blockNumber: receipt.blockNumber }),
    readJson<ForgeArtifact>(ESCROW_ARTIFACT_PATH),
  ]);
  if (transaction.chainId !== EXPECTED_CHAIN_ID || transaction.to !== null) {
    throw new Error("The confirmed transaction is not Coston2 contract creation.");
  }
  if (getAddress(transaction.from) !== record.deployer.address) {
    throw new Error("The confirmed deployment sender differs from the intent.");
  }
  if (deployedCode === undefined || deployedCode === "0x") {
    throw new Error("No deployed bytecode exists at the receipt contract address.");
  }
  const deployedRuntimeHash = keccak256(deployedCode);
  if (deployedRuntimeHash !== record.intent.expectedRuntimeBytecodeHash) {
    throw new Error("Deployed runtime bytecode does not match the pre-broadcast simulation.");
  }
  const creationInputHash = keccak256(transaction.input);
  if (creationInputHash !== record.intent.expectedCreationBytecodeHash) {
    throw new Error("The confirmed creation transaction differs from the reviewed initcode.");
  }

  const [fxrp, ftsoV2, feedId, maximumPriceAge, liabilities, invoiceOne] = await Promise.all([
    publicClient.readContract({
      address: contractAddress,
      abi: proofPayReadAbi,
      functionName: "fxrp",
      blockNumber: receipt.blockNumber,
    }),
    publicClient.readContract({
      address: contractAddress,
      abi: proofPayReadAbi,
      functionName: "ftsoV2",
      blockNumber: receipt.blockNumber,
    }),
    publicClient.readContract({
      address: contractAddress,
      abi: proofPayReadAbi,
      functionName: "xrpUsdFeedId",
      blockNumber: receipt.blockNumber,
    }),
    publicClient.readContract({
      address: contractAddress,
      abi: proofPayReadAbi,
      functionName: "maximumPriceAge",
      blockNumber: receipt.blockNumber,
    }),
    publicClient.readContract({
      address: contractAddress,
      abi: proofPayReadAbi,
      functionName: "activeFxrpLiabilities",
      blockNumber: receipt.blockNumber,
    }),
    publicClient.readContract({
      address: contractAddress,
      abi: proofPayReadAbi,
      functionName: "invoices",
      args: [1n],
      blockNumber: receipt.blockNumber,
    }),
  ]);
  if (
    getAddress(fxrp) !== record.dependencies.fxrpAddress ||
    getAddress(ftsoV2) !== record.dependencies.ftsoV2Address ||
    feedId.toLowerCase() !== record.dependencies.xrpUsdFeedId ||
    maximumPriceAge !== BigInt(MAXIMUM_PRICE_AGE_SECONDS)
  ) {
    throw new Error("Onchain constructor dependencies differ from the reviewed intent.");
  }
  if (liabilities !== 0n || invoiceOne[0] !== zeroAddress) {
    throw new Error("The escrow did not begin with zero liabilities and no first invoice.");
  }
  const [fxrpDecimals, contractFxrpBalance, invalidLookup] = await Promise.all([
    publicClient.readContract({
      address: record.dependencies.fxrpAddress,
      abi: erc20Abi,
      functionName: "decimals",
    }),
    publicClient.readContract({
      address: record.dependencies.fxrpAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [contractAddress],
    }),
    assertInvalidInvoiceLookup(contractAddress),
  ]);
  if (fxrpDecimals !== FXRP_DECIMALS || contractFxrpBalance !== 0n) {
    throw new Error("The deployed escrow did not begin with six-decimal FXRP and zero balance.");
  }

  const beforeQuote = await Promise.all([
    publicClient.readContract({
      address: contractAddress,
      abi: proofPayReadAbi,
      functionName: "activeFxrpLiabilities",
    }),
    publicClient.readContract({
      address: record.dependencies.fxrpAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [contractAddress],
    }),
    publicClient.readContract({
      address: contractAddress,
      abi: proofPayReadAbi,
      functionName: "invoices",
      args: [1n],
    }),
  ]);
  const quote = await simulateLiveFundingQuote(contractAddress, record.deployer.address);
  const afterQuote = await Promise.all([
    publicClient.readContract({
      address: contractAddress,
      abi: proofPayReadAbi,
      functionName: "activeFxrpLiabilities",
    }),
    publicClient.readContract({
      address: record.dependencies.fxrpAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [contractAddress],
    }),
    publicClient.readContract({
      address: contractAddress,
      abi: proofPayReadAbi,
      functionName: "invoices",
      args: [1n],
    }),
  ]);
  if (
    beforeQuote[0] !== afterQuote[0] ||
    beforeQuote[1] !== afterQuote[1] ||
    beforeQuote[2][0] !== afterQuote[2][0]
  ) {
    throw new Error("The eth_call funding quote simulation unexpectedly changed live state.");
  }

  const totalFee = receipt.gasUsed * receipt.effectiveGasPrice;
  const balanceAfter = await publicClient.getBalance({ address: record.deployer.address });
  record.status = "DEPLOYED_VERIFIED";
  record.deployer.balanceAfterWei = balanceAfter.toString();
  record.deployer.balanceAfterC2flr = formatEther(balanceAfter);
  record.deployment.transactionHash = transactionHash;
  record.deployment.contractAddress = contractAddress;
  record.deployment.blockNumber = receipt.blockNumber.toString();
  record.deployment.gasUsed = receipt.gasUsed.toString();
  record.deployment.effectiveGasPriceWei = receipt.effectiveGasPrice.toString();
  record.deployment.totalFeeWei = totalFee.toString();
  record.deployment.totalFeeC2flr = formatEther(totalFee);
  record.deployment.timestamp = block.timestamp.toString();
  record.deployment.timestampIso = new Date(Number(block.timestamp) * 1_000).toISOString();
  record.bytecodeVerification = {
    status: "PASS",
    expectedRuntimeBytecodeHash: record.intent.expectedRuntimeBytecodeHash,
    deployedRuntimeBytecodeHash: deployedRuntimeHash,
    creationTransactionInputHash: creationInputHash,
  };
  record.postDeployment = {
    chainId: 114,
    receiptStatus: "success",
    constructorDependenciesMatch: true,
    fxrpDecimals: 6,
    activeFxrpLiabilities: "0",
    firstInvoiceSlotEmpty: true,
    invoiceCount: "0",
    invoiceCountEvidence:
      "invoices(1).freelancer is zero and quoteFunding(1) returns InvoiceNotFound(1)",
    contractFxrpBalance: "0",
    solvent: true,
    quoteSimulation: {
      status: "PASS",
      method: "non-persistent eth_call contract creation",
      usdTargetAtomic: "100000000",
      requiredFundingFxrpAtomic: quote.requiredFxrp.toString(),
      price: quote.price.toString(),
      priceDecimals: quote.priceDecimals,
      priceTimestamp: quote.priceTimestamp.toString(),
      independentMathMatch: true,
      persistentStateChanged: false,
    },
    stalePriceSimulation: {
      status: "PENDING",
      environment: "existing deterministic mock",
      command:
        "forge test --match-test testQuoteFundingAcceptsFreshnessEqualityAndRejectsOneSecondOlder -vv",
    },
    invalidInvoiceLookup: {
      status: "PASS",
      invoiceId: "1",
      expectedErrorData: invalidLookup.expected,
      observedErrorData: invalidLookup.observed,
    },
  };
  record.explorer.transaction = `${COSTON2_EXPLORER_URL}/tx/${transactionHash}`;
  record.explorer.contract = `${COSTON2_EXPLORER_URL}/address/${contractAddress}`;
  return record;
}

async function reconcile(record: DeploymentRecord): Promise<void> {
  const hash = record.deployment.transactionHash ?? record.deployment.plannedTransactionHash;
  if (hash === null) throw new Error("No submitted or planned transaction hash is available.");
  let receipt: TransactionReceipt;
  try {
    receipt = await publicClient.waitForTransactionReceipt({
      hash,
      confirmations: 1,
      timeout: 180_000,
      pollingInterval: 2_000,
    });
  } catch (error) {
    const transaction = await publicClient.getTransaction({ hash }).catch(() => null);
    if (transaction === null) {
      const currentNonce = await publicClient.getTransactionCount({
        address: record.deployer.address,
        blockTag: "pending",
      });
      throw new Error(
        `Transaction ${hash} is not visible; recorded nonce=${record.intent.deployerNonce}, current pending nonce=${currentNonce}.`,
      );
    }
    throw error;
  }
  record.deployment.transactionHash = hash;
  record.status = "TRANSACTION_SUBMITTED";
  await writeRecord(record);
  const finalized = await finalizeReceipt(record, receipt);
  await writeRecord(finalized);
  console.log(
    `DEPLOYED_VERIFIED contract=${finalized.deployment.contractAddress} tx=${finalized.deployment.transactionHash}`,
  );
}

async function prepareOnly(): Promise<void> {
  try {
    const existing = await readRecord();
    if (
      existing.deployment.transactionHash !== null ||
      existing.deployment.plannedTransactionHash !== null
    ) {
      throw new Error("A deployment hash already exists; use --reconcile instead of preparing again.");
    }
  } catch (error) {
    const code = isObject(error) && isObject(error.cause) ? error.cause.code : undefined;
    if (code !== "ENOENT" && !(error instanceof SyntaxError)) {
      const message = safeErrorMessage(error);
      if (!message.includes("ENOENT")) throw error;
    }
  }
  const prepared = await collectPreparedDeployment();
  await writeRecord(prepared.record);
  console.log(
    `INTENT_REVIEWED deployer=${prepared.record.deployer.address} expectedContract=${prepared.record.intent.expectedContractAddress} maxFeeC2FLR=${prepared.record.intent.expectedMaximumFeeC2flr}`,
  );
}

async function broadcast(): Promise<void> {
  try {
    const existing = await readRecord();
    if (
      existing.deployment.transactionHash !== null ||
      existing.deployment.plannedTransactionHash !== null
    ) {
      await reconcile(existing);
      return;
    }
  } catch (error) {
    if (!safeErrorMessage(error).includes("ENOENT")) throw error;
  }

  const prepared = await collectPreparedDeployment();
  await writeRecord(prepared.record);

  const currentNonce = await publicClient.getTransactionCount({
    address: prepared.account.address,
    blockTag: "pending",
  });
  if (BigInt(currentNonce) !== prepared.nonce) {
    throw new Error("The deployer nonce changed after the intent checkpoint; prepare again.");
  }
  const serializedTransaction = await prepared.account.signTransaction({
    chainId: EXPECTED_CHAIN_ID,
    data: prepared.initCode,
    gas: prepared.gasLimit,
    gasPrice: prepared.gasPrice,
    nonce: Number(prepared.nonce),
    type: "legacy",
    value: 0n,
  });
  const plannedHash = keccak256(serializedTransaction);
  prepared.record.status = "SIGNED_READY_TO_SUBMIT";
  prepared.record.deployment.plannedTransactionHash = plannedHash;
  await writeRecord(prepared.record);

  const walletClient = createWalletClient({
    account: prepared.account,
    chain: coston2,
    transport: http(COSTON2_RPC_URL),
  });
  const submittedHash = await walletClient.sendRawTransaction({
    serializedTransaction,
  });
  if (submittedHash !== plannedHash) {
    throw new Error("The RPC returned a transaction hash different from the signed transaction.");
  }
  prepared.record.status = "TRANSACTION_SUBMITTED";
  prepared.record.deployment.transactionHash = submittedHash;
  prepared.record.deployment.submittedAt = new Date().toISOString();
  await writeRecord(prepared.record);
  console.log(`TRANSACTION_SUBMITTED tx=${submittedHash}`);
  await reconcile(prepared.record);
}

async function runStaleSimulation(): Promise<void> {
  const record = await readRecord();
  if (record.status !== "DEPLOYED_VERIFIED" || record.postDeployment === null) {
    throw new Error("A verified deployment is required before the stale-price simulation record.");
  }
  const args = [
    "test",
    "--match-test",
    "testQuoteFundingAcceptsFreshnessEqualityAndRejectsOneSecondOlder",
    "-vv",
    "--color",
    "never",
  ];
  const result = await runCommand(FOUNDRY_FORGE, args, CONTRACTS_ROOT);
  if (result.exitCode !== 0) {
    throw new Error(`Stale-price mock simulation failed: ${result.stderr.trim()}`);
  }
  record.postDeployment.stalePriceSimulation = {
    status: "PASS",
    environment: "existing deterministic mock",
    command: `forge ${args.join(" ")}`,
  };
  await writeRecord(record);
  console.log("STALE_PRICE_SIMULATION PASS");
}

async function verifySource(): Promise<void> {
  const record = await readRecord();
  const contractAddress = record.deployment.contractAddress;
  if (record.status !== "DEPLOYED_VERIFIED" || contractAddress === null) {
    throw new Error("A verified deployment is required before explorer source verification.");
  }
  const constructorArgs = encodeAbiParameters(
    [
      { type: "address" },
      { type: "address" },
      { type: "bytes21" },
      { type: "uint64" },
    ],
    [
      record.dependencies.fxrpAddress,
      record.dependencies.ftsoV2Address,
      record.dependencies.xrpUsdFeedId,
      BigInt(record.dependencies.maximumPriceAgeSeconds),
    ],
  );
  const args = [
    "verify-contract",
    contractAddress,
    "src/ProofPayEscrow.sol:ProofPayEscrow",
    "--chain-id",
    "114",
    "--compiler-version",
    "0.8.25",
    "--num-of-optimizations",
    "200",
    "--via-ir",
    "--evm-version",
    record.compiler.evmVersion,
    "--constructor-args",
    constructorArgs,
    "--creation-transaction-hash",
    record.deployment.transactionHash ?? "",
    "--verifier",
    "blockscout",
    "--verifier-url",
    COSTON2_VERIFIER_URL,
    "--watch",
    "--color",
    "never",
  ];
  const result = await runCommand(FOUNDRY_FORGE, args, CONTRACTS_ROOT);
  const response = [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join("\n");
  const lowerResponse = response.toLowerCase();
  const verified =
    result.exitCode === 0 ||
    lowerResponse.includes("already verified") ||
    lowerResponse.includes("contract successfully verified");
  const mismatch =
    lowerResponse.includes("bytecode mismatch") ||
    lowerResponse.includes("does not match") ||
    lowerResponse.includes("constructor arguments are not valid");
  record.sourceVerification = {
    status: verified ? "VERIFIED" : "FAILED",
    failureClass: verified
      ? null
      : mismatch
        ? "CONTRACT_VERIFICATION_MISMATCH"
        : "EXPLORER_OR_TOOLING",
    attemptedAt: new Date().toISOString(),
    command: result.command,
    workingDirectory: result.workingDirectory,
    exitCode: result.exitCode,
    response,
  };
  await writeRecord(record);
  console.log(`SOURCE_VERIFICATION ${record.sourceVerification.status}`);
  if (!verified && mismatch) process.exitCode = 1;
}

function usage(): never {
  throw new Error(
    "Usage: npm run deploy:coston2 -- --prepare|--broadcast|--reconcile|--stale-check|--verify",
  );
}

async function main(): Promise<void> {
  const mode = process.argv[2];
  if (mode === "--prepare") {
    await prepareOnly();
  } else if (mode === "--broadcast") {
    await broadcast();
  } else if (mode === "--reconcile") {
    await reconcile(await readRecord());
  } else if (mode === "--stale-check") {
    await runStaleSimulation();
  } else if (mode === "--verify") {
    await verifySource();
  } else {
    usage();
  }
}

main().catch((error: unknown) => {
  console.error(`Phase 4A deployment command failed: ${safeErrorMessage(error)}`);
  process.exitCode = 1;
});
