"use client";

import { EmptyDocument } from "@/components/proofpay";

export default function ReceiptError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <EmptyDocument
      eyebrow="Receipt read"
      heading="Coston2 data could not be read"
      message="The contract or its events did not respond. No stored artifact has been substituted for the live result."
      nextStep="Try the read again."
      onRetry={reset}
      status="ERROR"
    />
  );
}
