"use client";

import { EmptyDocument } from "@/components/proofpay";

export default function InvoiceError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <EmptyDocument
      eyebrow="Invoice read"
      heading="Coston2 data could not be read"
      message="The contract or its current-state reads did not respond. No stored artifact has been substituted for the live result."
      nextStep="Try the read again."
      onRetry={reset}
      status="ERROR"
    />
  );
}
