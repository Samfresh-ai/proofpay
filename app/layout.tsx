import type { Metadata } from "next";

import { ProofPayWalletProvider } from "@/components/wallet-provider";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "ProofPay · Coston2 settlement evidence",
    template: "%s · ProofPay",
  },
  description: "Create, fund, deliver, and settle evidence-backed FXRP milestones on Coston2.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        <ProofPayWalletProvider>{children}</ProofPayWalletProvider>
      </body>
    </html>
  );
}
