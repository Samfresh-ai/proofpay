import type { Metadata } from "next";

import { EmptyDocument, SettlementReceipt } from "@/components/proofpay";
import { getInvoiceView, getReceiptView, parseInvoiceId, ProofPayDataError } from "@/lib/proofpay";

export const metadata: Metadata = {
  title: "Settlement receipt",
};

function normalizePositiveId(value: string): string | null {
  try {
    return parseInvoiceId(value).toString();
  } catch {
    return null;
  }
}

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = normalizePositiveId(rawId);

  if (id === null) {
    return (
      <EmptyDocument
        eyebrow="Invalid receipt ID"
        heading="This receipt ID is not valid"
        message="ProofPay invoice IDs are positive whole numbers."
        nextStep="Check the address and use an invoice ID greater than zero."
      />
    );
  }

  let receipt;
  try {
    receipt = await getReceiptView(id);
  } catch (error) {
    const isRpcFailure = error instanceof ProofPayDataError && error.code === "RPC_FAILURE";
    return (
      <EmptyDocument
        eyebrow={`Receipt #${id}`}
        heading={isRpcFailure ? "Coston2 data could not be read" : "Settlement evidence could not be verified"}
        message={
          isRpcFailure
            ? "The contract or its events did not respond. No stored artifact has been substituted for the live result."
            : "The live contract and decoded receipt evidence did not reconcile. No unverified payout or refund is shown."
        }
        nextStep="Try again when the public Coston2 RPC and evidence sources are available."
        retryHref={`/receipt/${id}`}
        status="ERROR"
      />
    );
  }

  if (receipt) return <SettlementReceipt receipt={receipt} />;

  let invoice;
  try {
    invoice = await getInvoiceView(id);
  } catch (error) {
    const isRpcFailure = error instanceof ProofPayDataError && error.code === "RPC_FAILURE";
    return (
      <EmptyDocument
        eyebrow={`Receipt #${id}`}
        heading={isRpcFailure ? "Coston2 data could not be read" : "Settlement evidence could not be verified"}
        message={
          isRpcFailure
            ? "The current-state read did not respond. No stored artifact has been substituted for the live result."
            : "The live contract response did not reconcile. No unverified payout or refund is shown."
        }
        nextStep="Try again when the public Coston2 RPC is available."
        retryHref={`/receipt/${id}`}
        status="ERROR"
      />
    );
  }

  if (!invoice.exists) {
    return (
      <EmptyDocument
        eyebrow={`Receipt #${invoice.id}`}
        heading="This invoice does not exist"
        message={invoice.summary}
        nextStep={invoice.nextStep}
      />
    );
  }

  return (
    <EmptyDocument
      eyebrow={`Receipt #${invoice.id}`}
      heading={invoice.status === "RELEASED" ? "No verified settlement receipt is available" : "No settlement receipt exists yet"}
      message={
        invoice.status === "RELEASED"
          ? "The invoice is released, but its complete decoded settlement evidence is not available to this receipt reader. No payout or refund is inferred."
          : `The invoice is ${invoice.status}. No confirmed payout or refund is available.`
      }
      nextStep="Read the invoice for its current contract state."
    />
  );
}
