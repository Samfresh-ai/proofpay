import type { Metadata } from "next";

import { EmptyDocument, MilestoneDocument } from "@/components/proofpay";
import { getInvoiceView, parseInvoiceId, ProofPayDataError } from "@/lib/proofpay";

export const metadata: Metadata = {
  title: "Milestone invoice",
};

function normalizePositiveId(value: string): string | null {
  try {
    return parseInvoiceId(value).toString();
  } catch {
    return null;
  }
}

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = normalizePositiveId(rawId);

  if (id === null) {
    return (
      <EmptyDocument
        eyebrow="Invalid invoice ID"
        heading="This invoice ID is not valid"
        message="ProofPay invoice IDs are positive whole numbers."
        nextStep="Check the address and use an invoice ID greater than zero."
      />
    );
  }

  let invoice;
  try {
    invoice = await getInvoiceView(id);
  } catch (error) {
    const isRpcFailure = error instanceof ProofPayDataError && error.code === "RPC_FAILURE";
    return (
      <EmptyDocument
        eyebrow={`Invoice #${id}`}
        heading={isRpcFailure ? "Coston2 data could not be read" : "Coston2 evidence could not be verified"}
        message={
          isRpcFailure
            ? "The contract or its current state did not respond. No stored artifact has been substituted for the live result."
            : "The live contract response did not satisfy ProofPay’s evidence checks. No unverified value is shown."
        }
        nextStep="Try again when the public Coston2 RPC and evidence sources are available."
        retryHref={`/invoice/${id}`}
        status="ERROR"
      />
    );
  }

  if (!invoice.exists) {
    return (
      <EmptyDocument
        eyebrow={`Invoice #${invoice.id}`}
        heading="This invoice does not exist"
        message={invoice.summary}
        nextStep={invoice.nextStep}
      />
    );
  }
  return <MilestoneDocument invoice={invoice} />;
}
