"use client";

import { useMemo } from "react";
import { publicActions } from "viem";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useSwitchChain,
  useWalletClient,
} from "wagmi";

import { PROOFPAY_CHAIN_ID } from "@/lib/proofpay-contract";
import { getChainGuardState } from "@/lib/wallet-policy";

export function useProofPayWallet() {
  const account = useAccount();
  const chainId = account.chainId;
  const connect = useConnect();
  const disconnect = useDisconnect();
  const switchChain = useSwitchChain();
  const walletClient = useWalletClient({ chainId: PROOFPAY_CHAIN_ID });
  const actionClient = useMemo(
    () => walletClient.data?.extend(publicActions),
    [walletClient.data],
  );
  const injectedConnector = connect.connectors.find((connector) => connector.type === "injected")
    ?? connect.connectors[0];

  return {
    account: account.address,
    actionClient,
    chainId,
    chainState: getChainGuardState(account.isConnected, chainId),
    connectError: connect.error,
    connectPending: connect.isPending,
    connectWallet: async () => {
      if (!injectedConnector) throw new Error("No injected EVM wallet is available in this browser.");
      await connect.connectAsync({ connector: injectedConnector });
    },
    disconnectWallet: () => disconnect.disconnect(),
    isConnected: account.isConnected,
    switchError: switchChain.error,
    switchPending: switchChain.isPending,
    switchToCoston2: async () => {
      await switchChain.switchChainAsync({ chainId: PROOFPAY_CHAIN_ID });
    },
  };
}
