import { EmptyDocument } from "@/components/proofpay";

export default function NotFound() {
  return (
    <EmptyDocument
      eyebrow="ProofPay"
      heading="This evidence page does not exist"
      message="No ProofPay invoice or receipt route matches this address."
      nextStep="Use /invoice/ID or /receipt/ID with a positive invoice ID."
    />
  );
}
