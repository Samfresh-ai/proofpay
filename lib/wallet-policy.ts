import type { InvoiceStatus } from "./proofpay";
import { PROOFPAY_CHAIN_ID } from "./proofpay-contract";

export const invoiceWalletActions = [
  "fund",
  "cancel",
  "submit_evidence",
  "refund",
  "top_up",
  "release",
] as const;

export type InvoiceWalletAction = (typeof invoiceWalletActions)[number];
export type WalletRole = "disconnected" | "client" | "freelancer" | "unrelated";
export type ChainGuardState = "no_wallet" | "wrong_network" | "ready";

export interface ActionPolicyInput {
  account?: string | null;
  client?: string | null;
  freelancer?: string | null;
  status: InvoiceStatus;
  deliveryDeadline: bigint;
  now: bigint;
  quoteTopUpAtomic?: bigint | null;
}

export interface ActionPolicyResult {
  role: WalletRole;
  actions: readonly InvoiceWalletAction[];
  explanation: string;
}

function sameAccount(left?: string | null, right?: string | null): boolean {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

export function getWalletRole(
  account?: string | null,
  client?: string | null,
  freelancer?: string | null,
): WalletRole {
  if (!account) return "disconnected";
  if (sameAccount(account, client)) return "client";
  if (sameAccount(account, freelancer)) return "freelancer";
  return "unrelated";
}

export function getChainGuardState(
  connected: boolean,
  chainId?: number | null,
): ChainGuardState {
  if (!connected) return "no_wallet";
  return chainId === PROOFPAY_CHAIN_ID ? "ready" : "wrong_network";
}

export function deriveInvoiceActions(input: ActionPolicyInput): ActionPolicyResult {
  const role = getWalletRole(input.account, input.client, input.freelancer);
  if (role === "disconnected") {
    return {
      role,
      actions: [],
      explanation: "Connect a wallet to check its authority for this milestone.",
    };
  }
  if (role === "unrelated") {
    return {
      role,
      actions: [],
      explanation: "This wallet is not a party to the milestone. The invoice remains read-only.",
    };
  }
  if (["RELEASED", "CANCELLED", "REFUNDED"].includes(input.status)) {
    return {
      role,
      actions: [],
      explanation: "This milestone is terminal. No further wallet action is available.",
    };
  }

  if (input.status === "CREATED") {
    if (role === "freelancer") {
      return {
        role,
        actions: ["cancel"],
        explanation: "The freelancer can cancel while the milestone is still unfunded.",
      };
    }
    if (input.now < input.deliveryDeadline) {
      return {
        role,
        actions: ["fund"],
        explanation: "The client can preview and fund this milestone before its deadline.",
      };
    }
    return {
      role,
      actions: [],
      explanation: "The delivery deadline has passed, so this milestone can no longer be funded.",
    };
  }

  if (input.status === "FUNDED") {
    if (role === "freelancer" && input.now <= input.deliveryDeadline) {
      return {
        role,
        actions: ["submit_evidence"],
        explanation: "The freelancer can commit delivery evidence before or at the deadline.",
      };
    }
    if (role === "client" && input.now > input.deliveryDeadline) {
      return {
        role,
        actions: ["refund"],
        explanation: "The client can recover the full lock because no evidence was submitted by the deadline.",
      };
    }
    return {
      role,
      actions: [],
      explanation: role === "client"
        ? "The FXRP remains locked while the delivery window is open."
        : "The evidence window has closed; only the client can request the missed-deadline refund.",
    };
  }

  if (input.status === "SUBMITTED" && role === "client") {
    if (input.quoteTopUpAtomic === null || input.quoteTopUpAtomic === undefined) {
      return {
        role,
        actions: [],
        explanation: "Refresh the release preview before choosing a settlement action.",
      };
    }
    return input.quoteTopUpAtomic > 0n
      ? {
          role,
          actions: ["top_up"],
          explanation: "The latest preview shows an FXRP shortfall. Nothing can be released until it is covered.",
        }
      : {
          role,
          actions: ["release"],
          explanation: "The current lock covers the previewed payout, so the client can release it.",
        };
  }

  return {
    role,
    actions: [],
    explanation: role === "freelancer"
      ? "Delivery evidence is already committed. Release authority belongs to the client."
      : "No wallet action is available for this invoice state.",
  };
}
