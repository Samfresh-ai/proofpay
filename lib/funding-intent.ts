import { getAddress, keccak256, toHex, type Address, type Hash } from "viem";

import { canonicalJson } from "./proofpay-manifests";
import {
  PROOFPAY_CHAIN_ID,
  PROOFPAY_CONTRACT_ADDRESS,
} from "./proofpay-contract";
import type { FundingPlan } from "./transaction-intents";

export const PROOFPAY_FUNDING_INTENT_KEY = "proofpay.funding-intents.v1";

export interface FundingIntentStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface FrozenFundingIntent {
  schemaVersion: 1;
  chainId: typeof PROOFPAY_CHAIN_ID;
  contract: Address;
  invoiceId: string;
  account: Address;
  previewRequiredFxrp: string;
  baseRequiredFxrp: string;
  maximumFxrp: string;
  toleranceBps: string;
  price: string;
  priceDecimals: number;
  priceTimestamp: string;
  quoteDeadline: string;
  intentHash: Hash;
}

export type FundingIntentInvalidationReason =
  | "account_changed"
  | "chain_changed"
  | "invoice_changed"
  | "quote_expired"
  | "requirement_exceeds_maximum";

interface FundingIntentDocument {
  schemaVersion: 1;
  intents: readonly FrozenFundingIntent[];
}

function isUnsignedInteger(value: unknown): value is string {
  return typeof value === "string" && /^(0|[1-9][0-9]*)$/u.test(value);
}

function isHash(value: unknown): value is Hash {
  return typeof value === "string" && /^0x[0-9a-f]{64}$/iu.test(value);
}

function hashPayload(value: Omit<FrozenFundingIntent, "intentHash">): Hash {
  return keccak256(toHex(canonicalJson(value)));
}

function validateIntent(value: unknown): FrozenFundingIntent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.schemaVersion !== 1 || candidate.chainId !== PROOFPAY_CHAIN_ID) return null;
  if (typeof candidate.contract !== "string" || typeof candidate.account !== "string") return null;
  let contract: Address;
  let account: Address;
  try {
    contract = getAddress(candidate.contract);
    account = getAddress(candidate.account);
  } catch {
    return null;
  }
  if (contract.toLowerCase() !== PROOFPAY_CONTRACT_ADDRESS.toLowerCase()) return null;
  if (!isUnsignedInteger(candidate.invoiceId) || BigInt(candidate.invoiceId) <= 0n) return null;
  for (const key of [
    "previewRequiredFxrp",
    "baseRequiredFxrp",
    "maximumFxrp",
    "toleranceBps",
    "price",
    "priceTimestamp",
    "quoteDeadline",
  ] as const) {
    if (!isUnsignedInteger(candidate[key])) return null;
  }
  if (!Number.isInteger(candidate.priceDecimals) || Number(candidate.priceDecimals) < 0 || Number(candidate.priceDecimals) > 18) {
    return null;
  }
  if (!isHash(candidate.intentHash)) return null;
  const intent: FrozenFundingIntent = {
    schemaVersion: 1,
    chainId: PROOFPAY_CHAIN_ID,
    contract,
    invoiceId: candidate.invoiceId as string,
    account,
    previewRequiredFxrp: candidate.previewRequiredFxrp as string,
    baseRequiredFxrp: candidate.baseRequiredFxrp as string,
    maximumFxrp: candidate.maximumFxrp as string,
    toleranceBps: candidate.toleranceBps as string,
    price: candidate.price as string,
    priceDecimals: Number(candidate.priceDecimals),
    priceTimestamp: candidate.priceTimestamp as string,
    quoteDeadline: candidate.quoteDeadline as string,
    intentHash: candidate.intentHash,
  };
  const { intentHash, ...payload } = intent;
  if (hashPayload(payload) !== intentHash) return null;
  if (
    BigInt(intent.baseRequiredFxrp) <= 0n
    || BigInt(intent.previewRequiredFxrp) <= 0n
    || BigInt(intent.maximumFxrp) < BigInt(intent.previewRequiredFxrp)
    || BigInt(intent.price) <= 0n
  ) return null;
  return intent;
}

export function createFrozenFundingIntent(input: {
  account: Address;
  invoiceId: bigint;
  plan: FundingPlan;
  price: bigint;
  priceDecimals: number;
  priceTimestamp: bigint;
  quoteDeadline: bigint;
}): FrozenFundingIntent {
  if (input.invoiceId <= 0n) throw new RangeError("Funding intent requires a positive invoice ID.");
  if (input.quoteDeadline <= 0n) throw new RangeError("Funding intent requires a future quote deadline.");
  const payload: Omit<FrozenFundingIntent, "intentHash"> = {
    schemaVersion: 1,
    chainId: PROOFPAY_CHAIN_ID,
    contract: PROOFPAY_CONTRACT_ADDRESS,
    invoiceId: input.invoiceId.toString(),
    account: getAddress(input.account),
    previewRequiredFxrp: input.plan.protectedRequiredFxrp.toString(),
    baseRequiredFxrp: input.plan.baseRequiredFxrp.toString(),
    maximumFxrp: input.plan.maximumFxrp.toString(),
    toleranceBps: input.plan.toleranceBps.toString(),
    price: input.price.toString(),
    priceDecimals: input.priceDecimals,
    priceTimestamp: input.priceTimestamp.toString(),
    quoteDeadline: input.quoteDeadline.toString(),
  };
  return { ...payload, intentHash: hashPayload(payload) };
}

export function loadFundingIntents(storage: FundingIntentStorage): FrozenFundingIntent[] {
  const serialized = storage.getItem(PROOFPAY_FUNDING_INTENT_KEY);
  if (!serialized) return [];
  try {
    const parsed = JSON.parse(serialized) as Partial<FundingIntentDocument>;
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.intents)) return [];
    return parsed.intents.flatMap((value) => {
      const intent = validateIntent(value);
      return intent ? [intent] : [];
    });
  } catch {
    return [];
  }
}

export function saveFundingIntents(
  storage: FundingIntentStorage,
  intents: readonly FrozenFundingIntent[],
): void {
  const document: FundingIntentDocument = { schemaVersion: 1, intents };
  storage.setItem(PROOFPAY_FUNDING_INTENT_KEY, JSON.stringify(document));
}

export function upsertFundingIntent(
  intents: readonly FrozenFundingIntent[],
  intent: FrozenFundingIntent,
): FrozenFundingIntent[] {
  return [
    ...intents.filter((candidate) => !(
      candidate.chainId === intent.chainId
      && candidate.account.toLowerCase() === intent.account.toLowerCase()
      && candidate.invoiceId === intent.invoiceId
    )),
    intent,
  ];
}

export function removeFundingIntent(
  intents: readonly FrozenFundingIntent[],
  intentHash: Hash,
): FrozenFundingIntent[] {
  return intents.filter((intent) => intent.intentHash !== intentHash);
}

export function fundingIntentInvalidationReason(
  intent: FrozenFundingIntent,
  context: {
    account: Address;
    chainId: number;
    invoiceId: bigint;
    nowSeconds: bigint;
    currentRequiredFxrp?: bigint;
  },
): FundingIntentInvalidationReason | null {
  if (intent.account.toLowerCase() !== context.account.toLowerCase()) return "account_changed";
  if (intent.chainId !== context.chainId) return "chain_changed";
  if (intent.invoiceId !== context.invoiceId.toString()) return "invoice_changed";
  if (BigInt(intent.quoteDeadline) <= context.nowSeconds) return "quote_expired";
  if (
    context.currentRequiredFxrp !== undefined
    && context.currentRequiredFxrp > BigInt(intent.maximumFxrp)
  ) return "requirement_exceeds_maximum";
  return null;
}

export function nextFundingStep(
  intent: FrozenFundingIntent,
  allowanceFxrp: bigint,
): "approve" | "fund" {
  return allowanceFxrp < BigInt(intent.maximumFxrp) ? "approve" : "fund";
}
