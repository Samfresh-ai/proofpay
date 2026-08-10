import type { Metadata } from "next";

import { ProofPayWalletProvider } from "@/components/wallet-provider";
import {
  PROOFPAY_PUBLIC_DESCRIPTION,
  PROOFPAY_PUBLIC_TITLE,
  resolveDeploymentOrigin,
} from "@/lib/site-metadata";

import "./globals.css";

const deploymentOrigin = resolveDeploymentOrigin({
  publicSiteUrl: process.env.NEXT_PUBLIC_SITE_URL,
  vercelUrl: process.env.VERCEL_URL,
});

export const metadata: Metadata = {
  metadataBase: deploymentOrigin,
  applicationName: "ProofPay",
  title: {
    default: PROOFPAY_PUBLIC_TITLE,
    template: "%s — ProofPay",
  },
  description: PROOFPAY_PUBLIC_DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "ProofPay",
    title: PROOFPAY_PUBLIC_TITLE,
    description: PROOFPAY_PUBLIC_DESCRIPTION,
    url: "/",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        <ProofPayWalletProvider>{children}</ProofPayWalletProvider>
        <footer aria-label="Public deployment notice" className="public-site-footer" data-testid="public-trust-notice">
          <strong>ProofPay by Paysmat</strong>
          <span>Coston2 testnet · Test assets only · Not audited · Not legal or fiat escrow</span>
        </footer>
      </body>
    </html>
  );
}
