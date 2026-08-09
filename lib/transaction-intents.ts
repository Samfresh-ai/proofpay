import {
  decodeErrorResult,
  keccak256,
  toHex,
  type Address,
  type Hash,
} from "viem";

import { canonicalJson } from "./proofpay-manifests";
import {
  PROOFPAY_BPS_DENOMINATOR,
  PROOFPAY_CHAIN_ID,
  PROOFPAY_CHAIN_NAME,
  PROOFPAY_CONTRACT_ADDRESS,
  PROOFPAY_FUNDING_PROTECTION_BPS,
  PROOFPAY_FXRP_ADDRESS,
  PROOFPAY_FXRP_DECIMALS,
  PROOFPAY_MAX_TOLERANCE_BPS,
  proofPayAbi,
} from "./proofpay-contract";

export const proofPayTransactionActions = [
  "create",
  "approve",
  "fund",
  "submit_evidence",
  "top_up",
  "release",
  "cancel",
  "refund",
] as const;

export type ProofPayTransactionAction = (typeof proofPayTransactionActions)[number];

export interface TransactionIntent {
  action: ProofPayTransactionAction;
  actionLabel: string;
  network: typeof PROOFPAY_CHAIN_NAME;
  chainId: typeof PROOFPAY_CHAIN_ID;
  contract: Address;
  account: Address;
  invoiceId: string;
  token: "FXRP" | "None";
  tokenAddress: Address | null;
  amountAtomic: string | null;
  amountDisplay: string;
  recipientDisplay: string;
  contractDeadline: string | null;
  quoteDeadline: string | null;
  maximumAtomic: string | null;
  maximumDisplay: string;
  changeBeforeConfirmation: string;
  completionProof: string;
  expectedResult: string;
  intentHash: Hash;
}

export interface FundingPlan {
  baseRequiredFxrp: bigint;
  protectedRequiredFxrp: bigint;
  maximumFxrp: bigint;
  toleranceBps: bigint;
  allowanceFxrp: bigint;
  approvalRequired: boolean;
  exactApprovalFxrp: bigint;
}

export interface ReleaseQuote {
  payoutFxrp: bigint;
  refundFxrp: bigint;
  topUpFxrp: bigint;
  price: bigint;
  priceDecimals: number;
  priceTimestamp: bigint;
}

export function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  if (numerator < 0n || denominator <= 0n) throw new RangeError("ceilDiv requires nonnegative input and a positive denominator");
  return numerator === 0n ? 0n : ((numerator - 1n) / denominator) + 1n;
}

export function applyTolerance(amount: bigint, toleranceBps: bigint): bigint {
  if (amount <= 0n) throw new RangeError("Protected amount must be positive.");
  if (toleranceBps < 0n || toleranceBps > PROOFPAY_MAX_TOLERANCE_BPS) {
    throw new RangeError("Transaction tolerance must be between 0% and 5%.");
  }
  return ceilDiv(amount * (PROOFPAY_BPS_DENOMINATOR + toleranceBps), PROOFPAY_BPS_DENOMINATOR);
}

export function buildFundingPlan(input: {
  usdTargetAtomic: bigint;
  quoteRequiredFxrp: bigint;
  price: bigint;
  priceDecimals: number;
  toleranceBps: bigint;
  allowanceFxrp: bigint;
}): FundingPlan {
  if (input.usdTargetAtomic <= 0n || input.price <= 0n) throw new RangeError("Funding quote values must be positive.");
  if (!Number.isInteger(input.priceDecimals) || input.priceDecimals < 0 || input.priceDecimals > 18) {
    throw new RangeError("Funding quote decimals must be between zero and eighteen.");
  }
  const baseRequiredFxrp = ceilDiv(
    input.usdTargetAtomic * (10n ** BigInt(input.priceDecimals)),
    input.price,
  );
  const protectedRequiredFxrp = ceilDiv(
    baseRequiredFxrp * (PROOFPAY_BPS_DENOMINATOR + PROOFPAY_FUNDING_PROTECTION_BPS),
    PROOFPAY_BPS_DENOMINATOR,
  );
  if (protectedRequiredFxrp !== input.quoteRequiredFxrp) {
    throw new Error("The funding quote does not match ProofPay’s upward-rounded 10% protection rule.");
  }
  const maximumFxrp = applyTolerance(protectedRequiredFxrp, input.toleranceBps);
  return {
    baseRequiredFxrp,
    protectedRequiredFxrp,
    maximumFxrp,
    toleranceBps: input.toleranceBps,
    allowanceFxrp: input.allowanceFxrp,
    approvalRequired: input.allowanceFxrp < maximumFxrp,
    exactApprovalFxrp: maximumFxrp,
  };
}

export function formatAtomicUnits(value: bigint, decimals: number = PROOFPAY_FXRP_DECIMALS): string {
  if (value < 0n) throw new RangeError("Atomic amount cannot be negative.");
  const digits = value.toString().padStart(decimals + 1, "0");
  if (decimals === 0) return digits;
  const whole = digits.slice(0, -decimals);
  const fraction = digits.slice(-decimals).replace(/0+$/u, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

export function formatFxrpAmount(value: bigint): string {
  return `${formatAtomicUnits(value)} FXRP`;
}

export function formatUsdAmount(value: bigint): string {
  return `$${formatAtomicUnits(value, 6).replace(/(?:\.0+)?$/u, "")}`;
}

export function formatQuoteTimestamp(value: bigint): string {
  return new Date(Number(value) * 1_000).toISOString();
}

export function buildTransactionIntent(
  input: Omit<
    TransactionIntent,
    | "chainId"
    | "contract"
    | "intentHash"
    | "network"
    | "recipientDisplay"
    | "contractDeadline"
    | "changeBeforeConfirmation"
    | "completionProof"
  > & {
    contract?: Address;
    recipientDisplay?: string;
    contractDeadline?: string | null;
    changeBeforeConfirmation?: string;
    completionProof?: string;
  },
): TransactionIntent {
  const payload = {
    account: input.account,
    action: input.action,
    actionLabel: input.actionLabel,
    amountAtomic: input.amountAtomic,
    amountDisplay: input.amountDisplay,
    chainId: PROOFPAY_CHAIN_ID,
    changeBeforeConfirmation: input.changeBeforeConfirmation
      ?? "A changed account, chain, invoice state, or expired quote invalidates this prepared intent.",
    completionProof: input.completionProof
      ?? "A successful Coston2 receipt and the resulting contract state.",
    contract: input.contract ?? PROOFPAY_CONTRACT_ADDRESS,
    contractDeadline: input.contractDeadline ?? null,
    expectedResult: input.expectedResult,
    invoiceId: input.invoiceId,
    maximumAtomic: input.maximumAtomic,
    maximumDisplay: input.maximumDisplay,
    network: PROOFPAY_CHAIN_NAME,
    quoteDeadline: input.quoteDeadline,
    recipientDisplay: input.recipientDisplay ?? "No token recipient",
    token: input.token,
    tokenAddress: input.tokenAddress,
  };
  return {
    ...payload,
    intentHash: keccak256(toHex(canonicalJson(payload))),
  };
}

export function buildApprovalIntent(input: {
  account: Address;
  invoiceId: bigint;
  maximumFxrp: bigint;
}): TransactionIntent {
  return buildTransactionIntent({
    action: "approve",
    actionLabel: `Approve up to ${formatFxrpAmount(input.maximumFxrp)} for this milestone`,
    account: input.account,
    invoiceId: input.invoiceId.toString(),
    token: "FXRP",
    tokenAddress: PROOFPAY_FXRP_ADDRESS,
    amountAtomic: input.maximumFxrp.toString(),
    amountDisplay: formatFxrpAmount(input.maximumFxrp),
    quoteDeadline: null,
    maximumAtomic: input.maximumFxrp.toString(),
    maximumDisplay: formatFxrpAmount(input.maximumFxrp),
    expectedResult: "The FXRP contract may spend only this milestone’s accepted maximum. No escrow funding occurs in this approval.",
    recipientDisplay: "ProofPay escrow contract · allowance only",
    changeBeforeConfirmation: "The accepted maximum is frozen. No live quote refresh occurs while this funding intent remains valid.",
    completionProof: "A successful FXRP approval receipt and an onchain allowance at or above this exact maximum.",
  });
}

export function buildFundingIntent(input: {
  account: Address;
  invoiceId: bigint;
  usdTargetAtomic: bigint;
  requiredFxrp: bigint;
  maximumFxrp: bigint;
  quoteDeadline: bigint;
}): TransactionIntent {
  return buildTransactionIntent({
    action: "fund",
    actionLabel: `Fund this ${formatUsdAmount(input.usdTargetAtomic)} milestone`,
    account: input.account,
    invoiceId: input.invoiceId.toString(),
    token: "FXRP",
    tokenAddress: PROOFPAY_FXRP_ADDRESS,
    amountAtomic: input.requiredFxrp.toString(),
    amountDisplay: formatFxrpAmount(input.requiredFxrp),
    quoteDeadline: input.quoteDeadline.toString(),
    maximumAtomic: input.maximumFxrp.toString(),
    maximumDisplay: formatFxrpAmount(input.maximumFxrp),
    expectedResult: `Lock the current required amount, up to ${formatFxrpAmount(input.maximumFxrp)}, and move the invoice to FUNDED.`,
    recipientDisplay: "ProofPay escrow contract",
    changeBeforeConfirmation: "The contract may pull less than the maximum as the live price moves. It cannot pull more.",
    completionProof: "An InvoiceFunded event, FUNDED contract state, and the confirmed FXRP lock.",
  });
}

export function buildTopUpIntent(input: {
  account: Address;
  invoiceId: bigint;
  shortfallFxrp: bigint;
  maximumFxrp: bigint;
  quoteDeadline: bigint;
}): TransactionIntent {
  return buildTransactionIntent({
    action: "top_up",
    actionLabel: `Top up ${formatFxrpAmount(input.shortfallFxrp)} before payment can be released`,
    account: input.account,
    invoiceId: input.invoiceId.toString(),
    token: "FXRP",
    tokenAddress: PROOFPAY_FXRP_ADDRESS,
    amountAtomic: input.shortfallFxrp.toString(),
    amountDisplay: formatFxrpAmount(input.shortfallFxrp),
    quoteDeadline: input.quoteDeadline.toString(),
    maximumAtomic: input.maximumFxrp.toString(),
    maximumDisplay: formatFxrpAmount(input.maximumFxrp),
    expectedResult: "Increase the stored FXRP lock by only the current shortfall. Nothing is released.",
    recipientDisplay: "ProofPay escrow contract",
    changeBeforeConfirmation: "The contract may pull less than the accepted maximum if the shortfall falls. It cannot pull more.",
    completionProof: "A successful top-up receipt and the increased onchain FXRP lock.",
  });
}

export function buildReleaseIntent(input: {
  account: Address;
  invoiceId: bigint;
  payoutFxrp: bigint;
  refundFxrp: bigint;
  maximumFxrp: bigint;
  quoteDeadline: bigint;
}): TransactionIntent {
  return buildTransactionIntent({
    action: "release",
    actionLabel: "Release payment",
    account: input.account,
    invoiceId: input.invoiceId.toString(),
    token: "FXRP",
    tokenAddress: PROOFPAY_FXRP_ADDRESS,
    amountAtomic: input.payoutFxrp.toString(),
    amountDisplay: formatFxrpAmount(input.payoutFxrp),
    quoteDeadline: input.quoteDeadline.toString(),
    maximumAtomic: input.maximumFxrp.toString(),
    maximumDisplay: formatFxrpAmount(input.maximumFxrp),
    expectedResult: `Pay ${formatFxrpAmount(input.payoutFxrp)} to the freelancer, return ${formatFxrpAmount(input.refundFxrp)} to the client, and move the invoice to RELEASED.`,
    recipientDisplay: "Freelancer payout and client refund",
    changeBeforeConfirmation: "The live price may change the final split within the accepted payout maximum; otherwise the contract rejects the transaction.",
    completionProof: "An InvoiceReleased event, RELEASED contract state, party balances, and zero active liabilities.",
  });
}

function extractRevertData(error: unknown, depth = 0): `0x${string}` | null {
  if (depth > 6) return null;
  if (typeof error === "string" && /^0x[0-9a-f]+$/iu.test(error)) return error as `0x${string}`;
  if (!error || typeof error !== "object") return null;
  const object = error as Record<string, unknown>;
  for (const key of ["data", "cause", "error", "details"]) {
    const found = extractRevertData(object[key], depth + 1);
    if (found) return found;
  }
  return null;
}

function extractErrorCode(error: unknown, depth = 0): number | null {
  if (depth > 6 || !error || typeof error !== "object") return null;
  const object = error as Record<string, unknown>;
  if (typeof object.code === "number") return object.code;
  for (const key of ["cause", "error", "details"]) {
    const found = extractErrorCode(object[key], depth + 1);
    if (found !== null) return found;
  }
  return null;
}

function argumentAt(args: readonly unknown[] | undefined, index: number): bigint | null {
  const value = args?.[index];
  return typeof value === "bigint" ? value : null;
}

export function decodeProofPayError(error: unknown): string {
  const code = extractErrorCode(error);
  if (code === 4001) return "Wallet request rejected. Nothing was submitted.";

  const data = extractRevertData(error);
  if (!data) return "The simulation failed. Refresh the milestone state and try again.";
  try {
    const decoded = decodeErrorResult({ abi: proofPayAbi, data });
    const args = decoded.args as readonly unknown[] | undefined;
    switch (decoded.errorName) {
      case "ExpiredQuote": return "The price quote expired. Refresh it before continuing.";
      case "StalePrice": return "The XRP / USD observation is stale. Refresh the quote before continuing.";
      case "PriceReadFailed": return "Coston2 could not return the XRP / USD observation. Nothing was submitted.";
      case "InvalidPrice": return "The XRP / USD observation is invalid. Nothing was submitted.";
      case "UnsupportedFtsoFee": return "The price feed now requires an unsupported fee. ProofPay stopped before signing.";
      case "UnauthorizedCaller": return "This wallet is not authorized for this milestone.";
      case "InvalidState": return "This milestone is no longer in the required state. Refresh it before continuing.";
      case "AmountAboveClientMaximum": return "The current FXRP requirement exceeds the maximum you accepted. Refresh the quote.";
      case "TopUpRequired": {
        const shortfall = argumentAt(args, 2);
        return shortfall === null
          ? "The escrow is short. No payment was released."
          : `The escrow is short by ${formatFxrpAmount(shortfall)}. No payment was released.`;
      }
      case "NoTopUpRequired": return "The escrow already covers the payout. Refresh the release preview.";
      case "DeadlineNotReached": return "The delivery deadline has not passed, so the missed-delivery refund is unavailable.";
      case "DeliveryDeadlinePassed": return "The delivery deadline has passed. This action is no longer available.";
      case "DuplicateRelease": return "This milestone has already been released.";
      case "InsufficientFXRP": return "The connected client wallet does not hold enough FXRP for this action.";
      case "InvoiceNotFound": return "This invoice does not exist at the ProofPay contract.";
      case "InvalidEvidenceURI": return "The primary evidence URL is empty or exceeds the contract limit.";
      case "InvalidHash": return "The commitment hash is invalid.";
      case "InvalidAddress": return "One of the wallet addresses is invalid for this action.";
      case "InvalidAmount": return "The transaction amount must be greater than zero.";
      case "UnexpectedFXRPReceived": return "The FXRP transfer behavior did not match the requested amount. Nothing was completed.";
      default: return "The contract rejected this simulation. Refresh the milestone state before continuing.";
    }
  } catch {
    return "The simulation failed. Refresh the milestone state and try again.";
  }
}

export function transactionStateCopy(
  state: "prepared" | "awaiting_wallet" | "submitted" | "confirmed" | "reverted",
): string {
  switch (state) {
    case "prepared": return "Simulation passed. Review the exact intent before asking the wallet to sign.";
    case "awaiting_wallet": return "Signature request opened in the connected wallet.";
    case "submitted": return "Transaction submitted. ProofPay is waiting for the Coston2 receipt.";
    case "confirmed": return "Transaction confirmed on Coston2. Refreshing the milestone state is now safe.";
    case "reverted": return "The transaction reverted on Coston2. No completion is claimed.";
  }
}
