import { chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";

import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  decodeFunctionData,
  defineChain,
  encodeFunctionData,
  formatUnits,
  getAddress,
  http,
  parseAbi,
  parseUnits,
  zeroAddress,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import {
  generatePrivateKey,
  privateKeyToAccount,
  type PrivateKeyAccount,
} from "viem/accounts";

const EXPECTED_CHAIN_ID = 114;
const COSTON2_RPC_URL = "https://coston2-api.flare.network/ext/C/rpc";
const COSTON2_EXPLORER_URL = "https://coston2-explorer.flare.network";
const COSTON2_FAUCET_URL = "https://faucet.flare.network/";
const FLARE_CONTRACT_REGISTRY_ADDRESS = getAddress(
  "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019",
);
const ASSET_MANAGER_REGISTRY_NAME = "AssetManagerFXRP";
const FTSO_V2_REGISTRY_NAME = "FtsoV2";
const XRP_USD_FEED_ID =
  "0x015852502f55534400000000000000000000000000" as const;
const TRANSFER_AMOUNT_DISPLAY = "0.001";
const ARTIFACT_PATH = resolve("artifacts/flare-probe.json");
const SECRET_DIRECTORY = resolve(homedir(), ".local/share/proofpay");
const SECRET_PATH = resolve(SECRET_DIRECTORY, "coston2-burner-wallets.json");

const SOURCE_REFERENCES = {
  network: "https://dev.flare.network/network/overview",
  faucet: COSTON2_FAUCET_URL,
  assetManager:
    "https://dev.flare.network/fassets/developer-guides/fassets-asset-manager-address-contracts-registry",
  fxrp: "https://dev.flare.network/fxrp/token-interactions/fxrp-address",
  fassetsReference: "https://dev.flare.network/fassets/reference",
  ftso:
    "https://dev.flare.network/fassets/developer-guides/fassets-settings-node",
  ftsoInterface:
    "https://dev.flare.network/ftso/solidity-reference/FtsoV2Interface",
} as const;

const registryAbi = parseAbi([
  "function getContractAddressByName(string _name) view returns (address)",
]);

const assetManagerAbi = parseAbi([
  "function fAsset() view returns (address)",
]);

const erc20Abi = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address account) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);

const ftsoV2Abi = parseAbi([
  "function getFeedById(bytes21 _feedId) payable returns (uint256 _value, int8 _decimals, uint64 _timestamp)",
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

type ProbeMode = "read-only" | "provision-wallets" | "prepare" | "transfer" | "validate";
type ProbeStatus =
  | "READ_ONLY_PASS"
  | "AWAITING_FUNDING"
  | "READY_TO_TRANSFER"
  | "TRANSFER_SUBMITTED"
  | "PASS"
  | "FAIL";

interface CliOptions {
  mode: ProbeMode;
}

interface BalanceSnapshot {
  atomic: string;
  display: string;
}

interface SecretFile {
  schemaVersion: 1;
  purpose: "proofpay-coston2-technical-probe";
  chainId: 114;
  senderPrivateKey: Hex;
  recipientPrivateKey: Hex;
}

interface BurnerWallets {
  sender: PrivateKeyAccount;
  recipient: PrivateKeyAccount;
}

interface StoredArtifact {
  schemaVersion: 2;
  phase: 1;
  status: ProbeStatus;
  observedAt: string;
  network: {
    name: "Flare Testnet Coston2";
    rpcUrl: string;
    expectedChainId: 114;
    actualChainId?: number;
    testnet: true;
    blockNumber?: string;
  };
  registry?: {
    address: Address;
    assetManagerName: string;
    assetManagerAddress: Address;
    ftsoV2Name: string;
    ftsoV2Address: Address;
  };
  fxrp?: {
    address: Address;
    name: string;
    symbol: string;
    decimals: number;
  };
  xrpUsd?: {
    feedId: Hex;
    value: string;
    decimals: number;
    normalized: string;
    feedTimestamp: string;
    feedTimestampIso: string;
  };
  funding?: {
    route: "Official Flare Coston2 Faucet";
    url: string;
    requestedAssets: ["C2FLR", "FXRP"];
    observedSenderC2flr?: BalanceSnapshot;
    observedSenderFxrp?: BalanceSnapshot;
  };
  wallets?: {
    sender: Address;
    recipient: Address;
    purpose: "disposable-coston2-only-test-infrastructure";
    secretStorage: {
      path: string;
      fileMode: "0600";
      directoryMode: "0700";
      outsideRepository: true;
      secretValuesRecordedInEvidence: false;
    };
    before?: {
      blockNumber: string;
      senderFxrp: BalanceSnapshot;
      recipientFxrp: BalanceSnapshot;
      senderC2flr: BalanceSnapshot;
    };
    after?: {
      blockNumber: string;
      senderFxrp: BalanceSnapshot;
      recipientFxrp: BalanceSnapshot;
      senderC2flr: BalanceSnapshot;
    };
  };
  transfer: {
    state: "NOT_PREPARED" | "PREPARED" | "SUBMITTED" | "CONFIRMED" | "FAILED";
    amount?: BalanceSnapshot;
    calldata?: Hex;
    estimatedGas?: string;
    chainIdGuard?: {
      expected: 114;
      observedBeforeSigning: number;
      passed: true;
    };
    transactionHash?: Hash;
    explorerUrl?: string;
    blockNumber?: string;
    blockTimestamp?: string;
    blockTimestampIso?: string;
    confirmations?: string;
    gasUsed?: string;
    effectiveGasPrice?: string;
    gasFee?: BalanceSnapshot;
    transactionValue?: BalanceSnapshot;
    balanceDeltas?: {
      senderFxrpAtomic: string;
      recipientFxrpAtomic: string;
      senderC2flrAtomic: string;
      matchExpectedFxrpTransfer: boolean;
      matchGasOnlyC2flrChange: boolean;
    };
    validation?: {
      officialRpcChainId: 114;
      transactionChainId: 114;
      transactionTargetMatchesFxrp: true;
      calldataMatchesExactTransfer: true;
      matchingFxrpTransferLogs: 1;
      unrelatedErc20TransferLogs: 0;
      unrelatedTokenMoved: false;
      balancesReReadAtTransactionBlocks: true;
      noRealValueNetworkOrWallet: true;
    };
  };
  sourceReferences: typeof SOURCE_REFERENCES;
  command: {
    executable: string;
    arguments: string[];
    output: string[];
  };
  blocker?: string;
  error?: string;
}

function usage(): string {
  return [
    "Read Coston2 sponsor state:",
    "  npm run probe:flare",
    "",
    "Provision or re-read the two disposable burner wallets:",
    "  npm run probe:flare -- --provision-wallets",
    "",
    "Read funded wallet balances and prepare the exact transfer:",
    "  npm run probe:flare -- --prepare",
    "",
    "Sign and submit exactly 0.001 FXRP after the Coston2 chain guard passes:",
    "  npm run probe:flare -- --transfer",
    "",
    "Independently re-read and validate transaction evidence:",
    "  npm run probe:flare -- --validate",
    "",
    "No command accepts a private key, mnemonic, or seed argument.",
  ].join("\n");
}

function parseCli(argv: string[]): CliOptions {
  if (argv.length === 0) {
    return { mode: "read-only" };
  }
  if (argv.length !== 1) {
    throw new Error(`Accept exactly one mode flag.\n${usage()}`);
  }

  const flag = argv[0];
  if (flag === "--help") {
    console.log(usage());
    process.exit(0);
  }
  const modes = new Map<string, ProbeMode>([
    ["--provision-wallets", "provision-wallets"],
    ["--prepare", "prepare"],
    ["--transfer", "transfer"],
    ["--validate", "validate"],
  ]);
  const mode = flag === undefined ? undefined : modes.get(flag);
  if (mode === undefined) {
    throw new Error(`Unknown mode: ${flag ?? "<missing>"}.\n${usage()}`);
  }
  return { mode };
}

function safeArguments(options: CliOptions): string[] {
  return options.mode === "read-only" ? [] : [`--${options.mode}`];
}

function formatIntegerDecimal(value: bigint, decimals: number): string {
  if (!Number.isInteger(decimals)) {
    throw new Error(`Invalid decimal count: ${decimals}.`);
  }
  if (decimals < 0) {
    return `${value}${"0".repeat(-decimals)}`;
  }
  if (decimals === 0) {
    return value.toString();
  }

  const digits = value.toString().padStart(decimals + 1, "0");
  const whole = digits.slice(0, -decimals);
  const fractional = digits.slice(-decimals).replace(/0+$/, "");
  return fractional.length === 0 ? whole : `${whole}.${fractional}`;
}

function balanceSnapshot(value: bigint, decimals: number): BalanceSnapshot {
  return { atomic: value.toString(), display: formatUnits(value, decimals) };
}

function publicWalletEvidence(wallets: BurnerWallets): NonNullable<StoredArtifact["wallets"]> {
  return {
    sender: wallets.sender.address,
    recipient: wallets.recipient.address,
    purpose: "disposable-coston2-only-test-infrastructure",
    secretStorage: {
      path: SECRET_PATH,
      fileMode: "0600",
      directoryMode: "0700",
      outsideRepository: true,
      secretValuesRecordedInEvidence: false,
    },
  };
}

async function saveArtifact(artifact: StoredArtifact): Promise<void> {
  await mkdir(resolve("artifacts"), { recursive: true });
  await writeFile(ARTIFACT_PATH, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
}

async function readStoredArtifactIfExists(): Promise<StoredArtifact | undefined> {
  let raw: string;
  try {
    raw = await readFile(ARTIFACT_PATH, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }

  let artifact: Partial<StoredArtifact>;
  try {
    artifact = JSON.parse(raw) as Partial<StoredArtifact>;
  } catch {
    throw new Error("The saved Flare probe artifact is not valid JSON.");
  }
  if (artifact.schemaVersion !== 2 || artifact.phase !== 1) {
    throw new Error("The saved Flare probe artifact has an unsupported schema.");
  }
  return artifact as StoredArtifact;
}

async function readStoredArtifact(): Promise<StoredArtifact> {
  const artifact = await readStoredArtifactIfExists();
  if (artifact === undefined) {
    throw new Error("No Flare probe artifact exists.");
  }
  return artifact;
}

function hasTransactionEvidence(
  artifact: StoredArtifact | undefined,
): artifact is StoredArtifact & { transfer: { transactionHash: Hash } } {
  return artifact?.transfer.transactionHash !== undefined;
}

function hasPreparedOrSubmittedEvidence(artifact: StoredArtifact | undefined): boolean {
  return (
    artifact !== undefined &&
    (artifact.transfer.state === "PREPARED" ||
      artifact.transfer.state === "SUBMITTED" ||
      artifact.transfer.state === "CONFIRMED" ||
      artifact.transfer.transactionHash !== undefined ||
      artifact.wallets !== undefined ||
      artifact.funding !== undefined)
  );
}

function isPrivateKey(value: unknown): value is Hex {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);
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

async function readBurnerWallets(): Promise<BurnerWallets> {
  await enforceSecretPermissions();

  let raw: string;
  try {
    raw = await readFile(SECRET_PATH, "utf8");
  } catch {
    throw new Error("The burner-wallet secret file cannot be read.");
  }

  let parsed: Partial<SecretFile>;
  try {
    parsed = JSON.parse(raw) as Partial<SecretFile>;
  } catch {
    throw new Error("The burner-wallet secret file is not valid JSON.");
  }
  if (
    parsed.schemaVersion !== 1 ||
    parsed.purpose !== "proofpay-coston2-technical-probe" ||
    parsed.chainId !== EXPECTED_CHAIN_ID ||
    !isPrivateKey(parsed.senderPrivateKey) ||
    !isPrivateKey(parsed.recipientPrivateKey)
  ) {
    throw new Error("The burner-wallet secret file does not match the Coston2 probe schema.");
  }

  const sender = privateKeyToAccount(parsed.senderPrivateKey);
  const recipient = privateKeyToAccount(parsed.recipientPrivateKey);
  if (sender.address === recipient.address) {
    throw new Error("The two burner wallets unexpectedly resolve to the same address.");
  }
  return { sender, recipient };
}

async function provisionBurnerWallets(output: string[]): Promise<BurnerWallets> {
  await mkdir(SECRET_DIRECTORY, { recursive: true, mode: 0o700 });
  await chmod(SECRET_DIRECTORY, 0o700);

  try {
    const existing = await readBurnerWallets();
    output.push("Existing owner-only Coston2 burner-wallet secret file reused.");
    return existing;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      try {
        await stat(SECRET_PATH);
      } catch (statError) {
        if ((statError as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
      }
    }
  }

  const secret: SecretFile = {
    schemaVersion: 1,
    purpose: "proofpay-coston2-technical-probe",
    chainId: EXPECTED_CHAIN_ID,
    senderPrivateKey: generatePrivateKey(),
    recipientPrivateKey: generatePrivateKey(),
  };
  await writeFile(SECRET_PATH, `${JSON.stringify(secret)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  await chmod(SECRET_PATH, 0o600);
  await enforceSecretPermissions();

  const wallets = {
    sender: privateKeyToAccount(secret.senderPrivateKey),
    recipient: privateKeyToAccount(secret.recipientPrivateKey),
  };
  output.push("Two disposable Coston2 burner wallets generated locally.");
  return wallets;
}

async function assertCoston2(): Promise<114> {
  const actualChainId = await publicClient.getChainId();
  if (coston2.testnet !== true || coston2.id !== EXPECTED_CHAIN_ID) {
    throw new Error("The locally defined signing chain is not Coston2 testnet chain 114.");
  }
  if (actualChainId !== EXPECTED_CHAIN_ID) {
    throw new Error(
      `Coston2 chain guard blocked signing: expected 114, received ${actualChainId}.`,
    );
  }
  return actualChainId;
}

async function readSponsorState(output: string[]) {
  const [actualChainId, blockNumber] = await Promise.all([
    assertCoston2(),
    publicClient.getBlockNumber(),
  ]);
  output.push(`Coston2 chain ID: ${actualChainId}`);

  const [assetManagerAddress, ftsoV2Address] = await Promise.all([
    publicClient.readContract({
      address: FLARE_CONTRACT_REGISTRY_ADDRESS,
      abi: registryAbi,
      functionName: "getContractAddressByName",
      args: [ASSET_MANAGER_REGISTRY_NAME],
    }),
    publicClient.readContract({
      address: FLARE_CONTRACT_REGISTRY_ADDRESS,
      abi: registryAbi,
      functionName: "getContractAddressByName",
      args: [FTSO_V2_REGISTRY_NAME],
    }),
  ]);
  if (assetManagerAddress === zeroAddress || ftsoV2Address === zeroAddress) {
    throw new Error("The Flare Contract Registry returned a zero address.");
  }
  output.push(
    `${ASSET_MANAGER_REGISTRY_NAME}: ${assetManagerAddress}`,
    `${FTSO_V2_REGISTRY_NAME}: ${ftsoV2Address}`,
  );

  const fxrpAddress = await publicClient.readContract({
    address: assetManagerAddress,
    abi: assetManagerAbi,
    functionName: "fAsset",
  });
  if (fxrpAddress === zeroAddress) {
    throw new Error("AssetManagerFXRP.fAsset() returned the zero address.");
  }

  const [name, symbol, decimals, feedSimulation] = await Promise.all([
    publicClient.readContract({ address: fxrpAddress, abi: erc20Abi, functionName: "name" }),
    publicClient.readContract({ address: fxrpAddress, abi: erc20Abi, functionName: "symbol" }),
    publicClient.readContract({
      address: fxrpAddress,
      abi: erc20Abi,
      functionName: "decimals",
    }),
    publicClient.simulateContract({
      address: ftsoV2Address,
      abi: ftsoV2Abi,
      functionName: "getFeedById",
      args: [XRP_USD_FEED_ID],
      value: 0n,
    }),
  ]);
  output.push(`FXRP token: ${name} (${symbol}), ${decimals} decimals, ${fxrpAddress}`);

  const [feedValue, feedDecimals, feedTimestamp] = feedSimulation.result;
  const normalizedPrice = formatIntegerDecimal(feedValue, feedDecimals);
  const feedTimestampIso = new Date(Number(feedTimestamp) * 1_000).toISOString();
  output.push(
    `XRP/USD: ${normalizedPrice} (raw ${feedValue}, decimals ${feedDecimals})`,
    `FTSO feed timestamp: ${feedTimestamp} (${feedTimestampIso})`,
  );

  return {
    actualChainId,
    blockNumber,
    assetManagerAddress,
    ftsoV2Address,
    fxrpAddress,
    name,
    symbol,
    decimals,
    feedValue,
    feedDecimals,
    feedTimestamp,
    normalizedPrice,
    feedTimestampIso,
  };
}

function baseArtifact(
  status: ProbeStatus,
  observedAt: string,
  options: CliOptions,
  output: string[],
  state: Awaited<ReturnType<typeof readSponsorState>>,
): StoredArtifact {
  return {
    schemaVersion: 2,
    phase: 1,
    status,
    observedAt,
    network: {
      name: "Flare Testnet Coston2",
      rpcUrl: COSTON2_RPC_URL,
      expectedChainId: EXPECTED_CHAIN_ID,
      actualChainId: state.actualChainId,
      testnet: true,
      blockNumber: state.blockNumber.toString(),
    },
    registry: {
      address: FLARE_CONTRACT_REGISTRY_ADDRESS,
      assetManagerName: ASSET_MANAGER_REGISTRY_NAME,
      assetManagerAddress: state.assetManagerAddress,
      ftsoV2Name: FTSO_V2_REGISTRY_NAME,
      ftsoV2Address: state.ftsoV2Address,
    },
    fxrp: {
      address: state.fxrpAddress,
      name: state.name,
      symbol: state.symbol,
      decimals: state.decimals,
    },
    xrpUsd: {
      feedId: XRP_USD_FEED_ID,
      value: state.feedValue.toString(),
      decimals: state.feedDecimals,
      normalized: state.normalizedPrice,
      feedTimestamp: state.feedTimestamp.toString(),
      feedTimestampIso: state.feedTimestampIso,
    },
    transfer: { state: "NOT_PREPARED" },
    sourceReferences: SOURCE_REFERENCES,
    command: {
      executable: "npm run probe:flare --",
      arguments: safeArguments(options),
      output,
    },
  };
}

async function prepareTransfer(
  options: CliOptions,
  observedAt: string,
  output: string[],
): Promise<StoredArtifact> {
  const wallets = await readBurnerWallets();
  const state = await readSponsorState(output);
  const amount = parseUnits(TRANSFER_AMOUNT_DISPLAY, state.decimals);
  const blockNumber = await publicClient.getBlockNumber();
  const [senderFxrp, recipientFxrp, senderC2flr] = await Promise.all([
    publicClient.readContract({
      address: state.fxrpAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [wallets.sender.address],
      blockNumber,
    }),
    publicClient.readContract({
      address: state.fxrpAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [wallets.recipient.address],
      blockNumber,
    }),
    publicClient.getBalance({ address: wallets.sender.address, blockNumber }),
  ]);

  output.push(
    `Sender: ${wallets.sender.address}`,
    `Recipient: ${wallets.recipient.address}`,
    `Sender C2FLR: ${formatUnits(senderC2flr, 18)}`,
    `Sender ${state.symbol}: ${formatUnits(senderFxrp, state.decimals)}`,
    `Recipient ${state.symbol}: ${formatUnits(recipientFxrp, state.decimals)}`,
  );

  const funded = senderFxrp >= amount && senderC2flr > 0n;
  const artifact = baseArtifact(
    funded ? "READY_TO_TRANSFER" : "AWAITING_FUNDING",
    observedAt,
    options,
    output,
    state,
  );
  artifact.funding = {
    route: "Official Flare Coston2 Faucet",
    url: COSTON2_FAUCET_URL,
    requestedAssets: ["C2FLR", "FXRP"],
    observedSenderC2flr: balanceSnapshot(senderC2flr, 18),
    observedSenderFxrp: balanceSnapshot(senderFxrp, state.decimals),
  };
  artifact.wallets = {
    ...publicWalletEvidence(wallets),
    before: {
      blockNumber: blockNumber.toString(),
      senderFxrp: balanceSnapshot(senderFxrp, state.decimals),
      recipientFxrp: balanceSnapshot(recipientFxrp, state.decimals),
      senderC2flr: balanceSnapshot(senderC2flr, 18),
    },
  };

  if (!funded) {
    artifact.blocker =
      `The sender needs both C2FLR gas and at least ${TRANSFER_AMOUNT_DISPLAY} ${state.symbol} from the official Coston2 faucet.`;
    output.push(`Funding status: ${artifact.blocker}`);
    return artifact;
  }

  await publicClient.simulateContract({
    account: wallets.sender.address,
    address: state.fxrpAddress,
    abi: erc20Abi,
    functionName: "transfer",
    args: [wallets.recipient.address, amount],
  });
  const estimatedGas = await publicClient.estimateContractGas({
    account: wallets.sender.address,
    address: state.fxrpAddress,
    abi: erc20Abi,
    functionName: "transfer",
    args: [wallets.recipient.address, amount],
  });
  const calldata = encodeFunctionData({
    abi: erc20Abi,
    functionName: "transfer",
    args: [wallets.recipient.address, amount],
  });
  artifact.transfer = {
    state: "PREPARED",
    amount: balanceSnapshot(amount, state.decimals),
    calldata,
    estimatedGas: estimatedGas.toString(),
  };
  output.push(
    `Prepared exact transfer: ${TRANSFER_AMOUNT_DISPLAY} ${state.symbol} (${amount} atomic units).`,
  );
  return artifact;
}

async function signAndSubmitTransfer(
  options: CliOptions,
  observedAt: string,
  output: string[],
): Promise<StoredArtifact> {
  const prepared = await readStoredArtifact();
  if (
    prepared.status !== "READY_TO_TRANSFER" ||
    prepared.transfer.state !== "PREPARED" ||
    prepared.transfer.amount === undefined ||
    prepared.transfer.calldata === undefined ||
    prepared.wallets?.before === undefined ||
    prepared.fxrp === undefined
  ) {
    throw new Error("The saved artifact is not ready for the exact FXRP transfer.");
  }

  const wallets = await readBurnerWallets();
  if (
    wallets.sender.address !== prepared.wallets.sender ||
    wallets.recipient.address !== prepared.wallets.recipient
  ) {
    throw new Error("The owner-only burner wallets do not match the prepared public addresses.");
  }

  const expectedAmount = parseUnits(TRANSFER_AMOUNT_DISPLAY, prepared.fxrp.decimals);
  if (prepared.transfer.amount.atomic !== expectedAmount.toString()) {
    throw new Error("The prepared amount is not exactly 0.001 FXRP.");
  }
  const expectedCalldata = encodeFunctionData({
    abi: erc20Abi,
    functionName: "transfer",
    args: [wallets.recipient.address, expectedAmount],
  });
  if (prepared.transfer.calldata !== expectedCalldata) {
    throw new Error("The prepared calldata is not the exact recipient and amount.");
  }

  const observedChainId = await assertCoston2();
  const walletClient = createWalletClient({
    account: wallets.sender,
    chain: coston2,
    transport: http(COSTON2_RPC_URL),
  });
  const walletRpcChainId = await walletClient.getChainId();
  if (walletRpcChainId !== EXPECTED_CHAIN_ID) {
    throw new Error(
      `Coston2 chain guard blocked signing: wallet RPC returned ${walletRpcChainId}.`,
    );
  }

  output.push(
    `Coston2 signing guard passed: chain ID ${observedChainId}.`,
    `Signing sender: ${wallets.sender.address}`,
    `Transfer recipient: ${wallets.recipient.address}`,
    `Transfer amount: ${TRANSFER_AMOUNT_DISPLAY} ${prepared.fxrp.symbol}.`,
  );

  const transactionHash = await walletClient.writeContract({
    address: prepared.fxrp.address,
    abi: erc20Abi,
    functionName: "transfer",
    args: [wallets.recipient.address, expectedAmount],
  });

  const submitted: StoredArtifact = {
    ...prepared,
    status: "TRANSFER_SUBMITTED",
    observedAt,
    transfer: {
      ...prepared.transfer,
      state: "SUBMITTED",
      chainIdGuard: {
        expected: EXPECTED_CHAIN_ID,
        observedBeforeSigning: observedChainId,
        passed: true,
      },
      transactionHash,
      explorerUrl: `${COSTON2_EXPLORER_URL}/tx/${transactionHash}`,
    },
    command: {
      executable: "npm run probe:flare --",
      arguments: safeArguments(options),
      output,
    },
  };
  await saveArtifact(submitted);

  const receipt = await publicClient.waitForTransactionReceipt({
    hash: transactionHash,
    confirmations: 1,
    timeout: 120_000,
  });
  if (receipt.status !== "success") {
    const message = `The submitted FXRP transfer reverted: ${transactionHash}.`;
    const gasFee = receipt.gasUsed * receipt.effectiveGasPrice;
    output.push(
      `Reconciled reverted transaction: ${transactionHash}`,
      `Reverted in block: ${receipt.blockNumber}`,
    );
    submitted.status = "FAIL";
    submitted.transfer.state = "FAILED";
    submitted.transfer.blockNumber = receipt.blockNumber.toString();
    submitted.transfer.gasUsed = receipt.gasUsed.toString();
    submitted.transfer.effectiveGasPrice = receipt.effectiveGasPrice.toString();
    submitted.transfer.gasFee = balanceSnapshot(gasFee, 18);
    submitted.command.output = output;
    submitted.error = message;
    submitted.blocker = message;
    await saveArtifact(submitted);
    throw new Error(message);
  }
  output.push(
    `Submitted transaction: ${transactionHash}`,
    `Confirmed in block: ${receipt.blockNumber}`,
    `Explorer: ${COSTON2_EXPLORER_URL}/tx/${transactionHash}`,
  );
  submitted.command.output = output;
  submitted.transfer.blockNumber = receipt.blockNumber.toString();
  await saveArtifact(submitted);
  return submitted;
}

async function validateTransactionEvidence(
  options: CliOptions,
  observedAt: string,
  output: string[],
): Promise<StoredArtifact> {
  const submitted = await readStoredArtifact();
  if (
    (submitted.status !== "TRANSFER_SUBMITTED" && submitted.status !== "PASS") ||
    (submitted.transfer.state !== "SUBMITTED" && submitted.transfer.state !== "CONFIRMED") ||
    submitted.transfer.transactionHash === undefined ||
    submitted.transfer.amount === undefined ||
    submitted.transfer.calldata === undefined ||
    submitted.transfer.chainIdGuard?.passed !== true ||
    submitted.wallets?.before === undefined ||
    submitted.fxrp === undefined
  ) {
    throw new Error("The saved artifact has no submitted FXRP transfer to validate.");
  }

  const state = await readSponsorState(output);
  const transactionHash = submitted.transfer.transactionHash;
  const [transaction, receipt] = await Promise.all([
    publicClient.getTransaction({ hash: transactionHash }),
    publicClient.getTransactionReceipt({ hash: transactionHash }),
  ]);
  if (receipt.status !== "success") {
    const message = `Transaction ${transactionHash} reverted.`;
    const gasFee = receipt.gasUsed * receipt.effectiveGasPrice;
    output.push(
      `Reconciled reverted transaction: ${transactionHash}`,
      `Reverted in block: ${receipt.blockNumber}`,
    );
    submitted.status = "FAIL";
    submitted.observedAt = observedAt;
    submitted.transfer.state = "FAILED";
    submitted.transfer.blockNumber = receipt.blockNumber.toString();
    submitted.transfer.gasUsed = receipt.gasUsed.toString();
    submitted.transfer.effectiveGasPrice = receipt.effectiveGasPrice.toString();
    submitted.transfer.gasFee = balanceSnapshot(gasFee, 18);
    submitted.command = {
      executable: "npm run probe:flare --",
      arguments: safeArguments(options),
      output,
    };
    submitted.error = message;
    submitted.blocker = message;
    await saveArtifact(submitted);
    throw new Error(message);
  }
  if (state.actualChainId !== EXPECTED_CHAIN_ID || transaction.chainId !== EXPECTED_CHAIN_ID) {
    throw new Error("The transaction was not independently resolved on Coston2 chain 114.");
  }
  if (transaction.to === null || getAddress(transaction.to) !== submitted.fxrp.address) {
    throw new Error("The transaction target is not the currently resolved FXRP token.");
  }
  if (transaction.value !== 0n) {
    throw new Error("The transaction unexpectedly transferred native C2FLR value.");
  }
  if (transaction.input !== submitted.transfer.calldata) {
    throw new Error("The onchain calldata differs from the prepared calldata.");
  }
  if (getAddress(transaction.from) !== submitted.wallets.sender) {
    throw new Error("The onchain sender differs from the disposable sender wallet.");
  }

  const decoded = decodeFunctionData({ abi: erc20Abi, data: transaction.input });
  if (decoded.functionName !== "transfer") {
    throw new Error("The transaction is not an ERC-20 transfer call.");
  }
  const [decodedRecipient, decodedAmount] = decoded.args;
  const expectedAmount = BigInt(submitted.transfer.amount.atomic);
  if (
    getAddress(decodedRecipient) !== submitted.wallets.recipient ||
    decodedAmount !== expectedAmount ||
    formatUnits(decodedAmount, submitted.fxrp.decimals) !== TRANSFER_AMOUNT_DISPLAY
  ) {
    throw new Error("The onchain recipient or amount is not the exact prepared transfer.");
  }

  let matchingFxrpTransferLogs = 0;
  let unrelatedErc20TransferLogs = 0;
  for (const log of receipt.logs) {
    try {
      const event = decodeEventLog({
        abi: erc20Abi,
        data: log.data,
        topics: log.topics,
      });
      if (event.eventName !== "Transfer") {
        continue;
      }
      const matches =
        getAddress(log.address) === submitted.fxrp.address &&
        getAddress(event.args.from) === submitted.wallets.sender &&
        getAddress(event.args.to) === submitted.wallets.recipient &&
        event.args.value === expectedAmount;
      if (matches) {
        matchingFxrpTransferLogs += 1;
      } else {
        unrelatedErc20TransferLogs += 1;
      }
    } catch {
      // Non-ERC-20 logs do not describe token movement.
    }
  }
  if (matchingFxrpTransferLogs !== 1 || unrelatedErc20TransferLogs !== 0) {
    throw new Error("The receipt token-transfer logs do not prove one isolated FXRP movement.");
  }

  if (receipt.blockNumber === 0n) {
    throw new Error("The confirmed transfer cannot have block zero as its predecessor.");
  }
  const beforeBlockNumber = receipt.blockNumber - 1n;
  const afterBlockNumber = receipt.blockNumber;
  const [senderFxrpBefore, recipientFxrpBefore, senderC2flrBefore] = await Promise.all([
    publicClient.readContract({
      address: submitted.fxrp.address,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [submitted.wallets.sender],
      blockNumber: beforeBlockNumber,
    }),
    publicClient.readContract({
      address: submitted.fxrp.address,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [submitted.wallets.recipient],
      blockNumber: beforeBlockNumber,
    }),
    publicClient.getBalance({
      address: submitted.wallets.sender,
      blockNumber: beforeBlockNumber,
    }),
  ]);
  const [senderFxrpAfter, recipientFxrpAfter, senderC2flrAfter, confirmations, block] =
    await Promise.all([
      publicClient.readContract({
        address: submitted.fxrp.address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [submitted.wallets.sender],
        blockNumber: afterBlockNumber,
      }),
      publicClient.readContract({
        address: submitted.fxrp.address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [submitted.wallets.recipient],
        blockNumber: afterBlockNumber,
      }),
      publicClient.getBalance({
        address: submitted.wallets.sender,
        blockNumber: afterBlockNumber,
      }),
      publicClient.getTransactionConfirmations({ hash: transactionHash }),
      publicClient.getBlock({ blockNumber: afterBlockNumber }),
    ]);

  const senderFxrpDelta = senderFxrpAfter - senderFxrpBefore;
  const recipientFxrpDelta = recipientFxrpAfter - recipientFxrpBefore;
  const senderC2flrDelta = senderC2flrAfter - senderC2flrBefore;
  const gasFee = receipt.gasUsed * receipt.effectiveGasPrice;
  const matchExpectedFxrpTransfer =
    senderFxrpDelta === -expectedAmount && recipientFxrpDelta === expectedAmount;
  const matchGasOnlyC2flrChange = senderC2flrDelta === -gasFee;
  if (!matchExpectedFxrpTransfer) {
    throw new Error("Independent block-state reads do not show the exact FXRP balance movement.");
  }
  if (!matchGasOnlyC2flrChange) {
    throw new Error("The sender C2FLR change is not exactly the confirmed transaction gas fee.");
  }

  const preparedBefore = submitted.wallets.before;
  if (
    preparedBefore.senderFxrp.atomic !== senderFxrpBefore.toString() ||
    preparedBefore.recipientFxrp.atomic !== recipientFxrpBefore.toString() ||
    preparedBefore.senderC2flr.atomic !== senderC2flrBefore.toString()
  ) {
    throw new Error("Prepared balances do not match the independently re-read pre-transaction block.");
  }

  const blockTimestampIso = new Date(Number(block.timestamp) * 1_000).toISOString();
  output.push(
    `Validated transaction: ${transactionHash}`,
    `Sender before/after ${submitted.fxrp.symbol}: ${formatUnits(senderFxrpBefore, submitted.fxrp.decimals)} -> ${formatUnits(senderFxrpAfter, submitted.fxrp.decimals)}`,
    `Recipient before/after ${submitted.fxrp.symbol}: ${formatUnits(recipientFxrpBefore, submitted.fxrp.decimals)} -> ${formatUnits(recipientFxrpAfter, submitted.fxrp.decimals)}`,
    `Gas used: ${receipt.gasUsed}; gas fee: ${formatUnits(gasFee, 18)} C2FLR`,
    "Independent Coston2 balance reads and isolated FXRP Transfer log: PASS",
  );

  const artifact = baseArtifact("PASS", observedAt, options, output, state);
  if (submitted.funding !== undefined) {
    artifact.funding = submitted.funding;
  }
  artifact.wallets = {
    ...submitted.wallets,
    before: {
      blockNumber: beforeBlockNumber.toString(),
      senderFxrp: balanceSnapshot(senderFxrpBefore, submitted.fxrp.decimals),
      recipientFxrp: balanceSnapshot(recipientFxrpBefore, submitted.fxrp.decimals),
      senderC2flr: balanceSnapshot(senderC2flrBefore, 18),
    },
    after: {
      blockNumber: afterBlockNumber.toString(),
      senderFxrp: balanceSnapshot(senderFxrpAfter, submitted.fxrp.decimals),
      recipientFxrp: balanceSnapshot(recipientFxrpAfter, submitted.fxrp.decimals),
      senderC2flr: balanceSnapshot(senderC2flrAfter, 18),
    },
  };
  artifact.transfer = {
    ...submitted.transfer,
    state: "CONFIRMED",
    blockNumber: receipt.blockNumber.toString(),
    blockTimestamp: block.timestamp.toString(),
    blockTimestampIso,
    confirmations: confirmations.toString(),
    gasUsed: receipt.gasUsed.toString(),
    effectiveGasPrice: receipt.effectiveGasPrice.toString(),
    gasFee: balanceSnapshot(gasFee, 18),
    transactionValue: balanceSnapshot(transaction.value, 18),
    balanceDeltas: {
      senderFxrpAtomic: senderFxrpDelta.toString(),
      recipientFxrpAtomic: recipientFxrpDelta.toString(),
      senderC2flrAtomic: senderC2flrDelta.toString(),
      matchExpectedFxrpTransfer,
      matchGasOnlyC2flrChange,
    },
    validation: {
      officialRpcChainId: EXPECTED_CHAIN_ID,
      transactionChainId: EXPECTED_CHAIN_ID,
      transactionTargetMatchesFxrp: true,
      calldataMatchesExactTransfer: true,
      matchingFxrpTransferLogs: 1,
      unrelatedErc20TransferLogs: 0,
      unrelatedTokenMoved: false,
      balancesReReadAtTransactionBlocks: true,
      noRealValueNetworkOrWallet: true,
    },
  };
  return artifact;
}

async function main(): Promise<void> {
  const options = parseCli(process.argv.slice(2));
  const output: string[] = [];
  const observedAt = new Date().toISOString();

  try {
    const existingArtifact = await readStoredArtifactIfExists();
    if (options.mode === "read-only" && hasPreparedOrSubmittedEvidence(existingArtifact)) {
      throw new Error(
        "Refusing to overwrite prepared or transaction evidence with a read-only snapshot.",
      );
    }
    if (options.mode === "prepare" && hasTransactionEvidence(existingArtifact)) {
      throw new Error(
        "Refusing to prepare another transfer while saved transaction evidence exists.",
      );
    }

    if (options.mode === "provision-wallets") {
      const wallets = await provisionBurnerWallets(output);
      output.push(
        `Sender: ${wallets.sender.address}`,
        `Recipient: ${wallets.recipient.address}`,
        `Secret storage: ${SECRET_PATH} (owner-only; secret values not displayed)`,
      );
      console.log(output.join("\n"));
      return;
    }

    if (options.mode === "prepare") {
      const artifact = await prepareTransfer(options, observedAt, output);
      await saveArtifact(artifact);
      console.log(output.join("\n"));
      console.log(`Status: ${artifact.status}`);
      console.log(`Evidence saved: ${ARTIFACT_PATH}`);
      return;
    }

    if (options.mode === "transfer") {
      const artifact = await signAndSubmitTransfer(options, observedAt, output);
      console.log(output.join("\n"));
      console.log(`Status: ${artifact.status}`);
      console.log(`Evidence saved: ${ARTIFACT_PATH}`);
      return;
    }

    if (options.mode === "validate") {
      const artifact = await validateTransactionEvidence(options, observedAt, output);
      await saveArtifact(artifact);
      console.log(output.join("\n"));
      console.log(`Status: ${artifact.status}`);
      console.log(`Evidence saved: ${ARTIFACT_PATH}`);
      return;
    }

    const state = await readSponsorState(output);
    const artifact = baseArtifact("READ_ONLY_PASS", observedAt, options, output, state);
    await saveArtifact(artifact);
    console.log(output.join("\n"));
    console.log(`Status: ${artifact.status}`);
    console.log(`Evidence saved: ${ARTIFACT_PATH}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    let existingArtifact: StoredArtifact | undefined;
    try {
      existingArtifact = await readStoredArtifactIfExists();
    } catch {
      // Preserve an unreadable artifact for manual recovery instead of replacing it.
      throw error;
    }
    if (hasPreparedOrSubmittedEvidence(existingArtifact)) {
      // A prepared request or submitted hash is a durable recovery point. Never erase
      // it on a timeout, RPC failure, validation error, or repeated command.
      throw error;
    }
    const failure: StoredArtifact = {
      schemaVersion: 2,
      phase: 1,
      status: "FAIL",
      observedAt,
      network: {
        name: "Flare Testnet Coston2",
        rpcUrl: COSTON2_RPC_URL,
        expectedChainId: EXPECTED_CHAIN_ID,
        testnet: true,
      },
      transfer: { state: "FAILED" },
      sourceReferences: SOURCE_REFERENCES,
      command: {
        executable: "npm run probe:flare --",
        arguments: safeArguments(options),
        output,
      },
      error: message,
      blocker: message,
    };
    await saveArtifact(failure);
    throw error;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
