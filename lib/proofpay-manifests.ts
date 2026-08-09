import { getAddress, keccak256, toHex, type Address, type Hash } from "viem";

import { PROOFPAY_CHAIN_ID, PROOFPAY_CONTRACT_ADDRESS } from "./proofpay-contract";

type CanonicalValue = null | boolean | number | string | readonly CanonicalValue[] | {
  readonly [key: string]: CanonicalValue;
};

export interface CanonicalManifest<T> {
  value: T;
  canonicalJson: string;
  hash: Hash;
}

export interface EvidenceManifestInput {
  deliveryUrls: readonly string[];
  milestoneTitle?: string;
  createTransaction?: string;
  approvalTransaction?: string;
  fundingTransaction?: string;
  walletActionsCommit?: string;
  completionNote: string;
}

export interface EvidenceManifest {
  approvalTransaction: Hash | null;
  completionNote: string;
  createTransaction: Hash | null;
  deliveryUrls: readonly string[];
  fundingTransaction: Hash | null;
  milestoneTitle: string | null;
  schemaVersion: 1;
  walletActionsCommit: string | null;
}

export interface ScopeManifestInput {
  client: string;
  freelancer: string;
  milestoneTitle: string;
  scope: readonly string[];
  usdTargetAtomic: bigint;
  deliveryDeadline: bigint;
}

export interface ScopeManifest {
  chainId: 114;
  client: Address;
  contractAddress: Address;
  deliveryDeadline: string;
  freelancer: Address;
  milestoneTitle: string;
  schemaVersion: 1;
  scope: readonly string[];
  usdTargetAtomic: string;
}

function normalizeText(value: string, label: string, maximumLength: number): string {
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  if (!normalized) throw new Error(`${label} is required.`);
  if (normalized.length > maximumLength) {
    throw new Error(`${label} must be ${maximumLength} characters or fewer.`);
  }
  return normalized;
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [first, second] = parts as [number, number, number, number];
  return first === 10
    || first === 127
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168);
}

export function normalizePublicUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Each delivery reference must be a valid public URL.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Delivery references must use HTTPS or HTTP.");
  }
  if (url.username || url.password) {
    throw new Error("Delivery references must not contain credentials.");
  }
  const hostname = url.hostname.toLowerCase();
  if (
    hostname === "localhost"
    || hostname === "[::1]"
    || hostname.endsWith(".local")
    || isPrivateIpv4(hostname)
  ) {
    throw new Error("Delivery references must be publicly reachable URLs.");
  }
  url.hash = "";
  url.searchParams.sort();
  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/u, "");
  return url.toString();
}

function canonicalize(value: unknown): CanonicalValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Canonical JSON does not accept non-finite numbers.");
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (typeof value === "object") {
    const sorted: Record<string, CanonicalValue> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right))) {
      if (child !== undefined) sorted[key] = canonicalize(child);
    }
    return sorted;
  }
  throw new Error("Canonical JSON accepts only null, booleans, finite numbers, strings, arrays, and objects.");
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function commitManifest<T>(value: T): CanonicalManifest<T> {
  const serialized = canonicalJson(value);
  return {
    value,
    canonicalJson: serialized,
    hash: keccak256(toHex(serialized)),
  };
}

export function buildEvidenceManifest(
  input: EvidenceManifestInput,
): CanonicalManifest<EvidenceManifest> & { primaryEvidenceUri: string } {
  const deliveryUrls = [...new Set(input.deliveryUrls.map(normalizePublicUrl))].sort();
  if (deliveryUrls.length === 0) throw new Error("Add at least one public delivery URL.");
  if (deliveryUrls.length > 8) throw new Error("Use no more than eight delivery URLs.");

  const commit = input.walletActionsCommit?.trim() || null;
  if (commit !== null && !/^[0-9a-f]{7,64}$/iu.test(commit)) {
    throw new Error("Wallet-actions commit must contain 7 to 64 hexadecimal characters.");
  }
  const transaction = (candidate: string | undefined, label: string): Hash | null => {
    const normalized = candidate?.trim() || null;
    if (normalized !== null && !/^0x[0-9a-f]{64}$/iu.test(normalized)) {
      throw new Error(`${label} must be a 32-byte transaction hash.`);
    }
    return normalized?.toLowerCase() as Hash | null;
  };
  const value: EvidenceManifest = {
    approvalTransaction: transaction(input.approvalTransaction, "Approval transaction"),
    completionNote: normalizeText(input.completionNote, "Completion note", 280),
    createTransaction: transaction(input.createTransaction, "Create transaction"),
    deliveryUrls,
    fundingTransaction: transaction(input.fundingTransaction, "Funding transaction"),
    milestoneTitle: input.milestoneTitle
      ? normalizeText(input.milestoneTitle, "Milestone title", 120)
      : null,
    schemaVersion: 1,
    walletActionsCommit: commit?.toLowerCase() ?? null,
  };
  const committed = commitManifest(value);
  const primaryEvidenceUri = deliveryUrls[0];
  if (!primaryEvidenceUri) throw new Error("A primary evidence URL is required.");
  if (new TextEncoder().encode(primaryEvidenceUri).length > 256) {
    throw new Error("The first delivery URL exceeds the contract’s 256-byte evidence URI limit.");
  }
  return { ...committed, primaryEvidenceUri };
}

export function buildScopeManifest(input: ScopeManifestInput): CanonicalManifest<ScopeManifest> {
  if (input.usdTargetAtomic <= 0n) throw new Error("Milestone target must be greater than zero.");
  if (input.deliveryDeadline <= 0n) throw new Error("Delivery deadline is required.");
  const scope = input.scope
    .map((line) => normalizeText(line, "Scope line", 240))
    .filter((line, index, lines) => lines.indexOf(line) === index);
  if (scope.length === 0) throw new Error("Add at least one milestone scope line.");
  if (scope.length > 12) throw new Error("Use no more than twelve milestone scope lines.");
  const value: ScopeManifest = {
    chainId: PROOFPAY_CHAIN_ID,
    client: getAddress(input.client),
    contractAddress: PROOFPAY_CONTRACT_ADDRESS,
    deliveryDeadline: input.deliveryDeadline.toString(),
    freelancer: getAddress(input.freelancer),
    milestoneTitle: normalizeText(input.milestoneTitle, "Milestone title", 120),
    schemaVersion: 1,
    scope,
    usdTargetAtomic: input.usdTargetAtomic.toString(),
  };
  if (value.client.toLowerCase() === value.freelancer.toLowerCase()) {
    throw new Error("Client and freelancer must use different wallet addresses.");
  }
  return commitManifest(value);
}
