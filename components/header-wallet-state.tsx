"use client";

import { useAccount } from "wagmi";

import { useHydrated } from "./use-hydrated";

function shortAddress(value: string): string {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

export function HeaderWalletState() {
  const hydrated = useHydrated();
  const { address, chainId, isConnected } = useAccount();

  const label = !hydrated
    ? "Checking wallet"
    : !isConnected
      ? "Wallet not connected"
      : chainId !== 114
        ? `Wallet on chain ${chainId ?? "unknown"}`
        : address
          ? shortAddress(address)
          : "Wallet connected";

  return <span className="wallet-state-label" data-testid="header-wallet-state">{label}</span>;
}
