import type { Metadata } from "next";

import { CreateMilestoneWorkspace } from "@/components/create-milestone";
import { PROOFPAY_PUBLIC_DESCRIPTION, PROOFPAY_PUBLIC_TITLE } from "@/lib/site-metadata";

export const metadata: Metadata = {
  title: { absolute: PROOFPAY_PUBLIC_TITLE },
  description: PROOFPAY_PUBLIC_DESCRIPTION,
  alternates: { canonical: "/app" },
  openGraph: {
    type: "website",
    siteName: "ProofPay",
    title: PROOFPAY_PUBLIC_TITLE,
    description: PROOFPAY_PUBLIC_DESCRIPTION,
    url: "/app",
  },
};

export default function AppPage() {
  return <CreateMilestoneWorkspace />;
}
