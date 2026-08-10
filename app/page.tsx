import type { Metadata } from "next";

import { LandingPage } from "@/components/landing-page";
import { getReceiptView, type ReceiptView } from "@/lib/proofpay";
import { PROOFPAY_PUBLIC_DESCRIPTION, PROOFPAY_PUBLIC_TITLE } from "@/lib/site-metadata";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dollar-priced FXRP milestones",
  description: PROOFPAY_PUBLIC_DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "ProofPay",
    title: PROOFPAY_PUBLIC_TITLE,
    description: PROOFPAY_PUBLIC_DESCRIPTION,
    url: "/",
  },
};

export default async function HomePage() {
  let receipt: ReceiptView | null = null;
  try {
    receipt = await getReceiptView(2);
  } catch {
    receipt = null;
  }
  return <LandingPage receipt={receipt} />;
}
