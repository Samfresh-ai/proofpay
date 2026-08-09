"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createConfig, http, WagmiProvider } from "wagmi";
import { injected } from "wagmi/connectors";

import { coston2, PROOFPAY_RPC_URL } from "@/lib/proofpay-contract";

const walletConfig = createConfig({
  chains: [coston2],
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    [coston2.id]: http(PROOFPAY_RPC_URL),
  },
  multiInjectedProviderDiscovery: false,
  ssr: true,
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: 5_000,
    },
  },
});

export function ProofPayWalletProvider({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={walletConfig} reconnectOnMount>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
