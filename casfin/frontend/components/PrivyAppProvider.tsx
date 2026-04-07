"use client";

import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo } from "react";
import {
  PrivyProvider,
  useActiveWallet,
  useConnectWallet,
  useLogout,
  usePrivy,
  useWallets,
  type ConnectedWallet,
  type WalletListEntry
} from "@privy-io/react-auth";
import { arbitrumSepolia } from "viem/chains";

type PrivyWalletContextValue = {
  configured: boolean;
  ready: boolean;
  walletsReady: boolean;
  authenticated: boolean;
  wallet: ConnectedWallet | null;
  wallets: ConnectedWallet[];
  openConnectWallet: () => void;
  logout: () => Promise<void>;
};

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID || "";
const PRIVY_CLIENT_ID = process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID || "";
const PRIVY_WALLET_CONNECT_PROJECT_ID = process.env.NEXT_PUBLIC_PRIVY_WALLET_CONNECT_PROJECT_ID || "";

const WALLET_LIST: WalletListEntry[] = PRIVY_WALLET_CONNECT_PROJECT_ID
  ? ["metamask", "coinbase_wallet", "wallet_connect", "detected_wallets"]
  : ["metamask", "coinbase_wallet", "detected_wallets"];

const DEFAULT_PRIVY_WALLET_CONTEXT: PrivyWalletContextValue = {
  configured: false,
  ready: false,
  walletsReady: false,
  authenticated: false,
  wallet: null,
  wallets: [],
  openConnectWallet: () => {},
  logout: async () => {}
};

const PrivyWalletContext = createContext<PrivyWalletContextValue>(DEFAULT_PRIVY_WALLET_CONTEXT);

function PrivyWalletBridge({ children }: { children: ReactNode }) {
  const { ready, authenticated } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const { wallet: activeWallet, setActiveWallet } = useActiveWallet();
  const { connectWallet } = useConnectWallet();
  const { logout } = useLogout();

  const selectedWallet = useMemo(() => {
    if (activeWallet?.type === "ethereum") {
      return activeWallet;
    }

    return wallets.find((wallet): wallet is ConnectedWallet => wallet.type === "ethereum") || null;
  }, [activeWallet, wallets]);

  useEffect(() => {
    if (!activeWallet && selectedWallet) {
      setActiveWallet(selectedWallet);
    }
  }, [activeWallet, selectedWallet, setActiveWallet]);

  const contextValue = useMemo(
    () => ({
      configured: true,
      ready,
      walletsReady,
      authenticated,
      wallet: selectedWallet,
      wallets,
      openConnectWallet: () => connectWallet(),
      logout
    }),
    [authenticated, connectWallet, logout, ready, selectedWallet, wallets, walletsReady]
  );

  return <PrivyWalletContext.Provider value={contextValue}>{children}</PrivyWalletContext.Provider>;
}

export default function PrivyAppProvider({ children }: { children: ReactNode }) {
  if (!PRIVY_APP_ID) {
    return <PrivyWalletContext.Provider value={DEFAULT_PRIVY_WALLET_CONTEXT}>{children}</PrivyWalletContext.Provider>;
  }

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      clientId={PRIVY_CLIENT_ID || undefined}
      config={{
        appearance: {
          theme: "dark",
          accentColor: "#f4bf36",
          showWalletLoginFirst: true,
          walletChainType: "ethereum-only",
          walletList: WALLET_LIST
        },
        loginMethods: ["wallet"],
        embeddedWallets: {
          ethereum: {
            createOnLogin: "off"
          },
          solana: {
            createOnLogin: "off"
          }
        },
        walletConnectCloudProjectId: PRIVY_WALLET_CONNECT_PROJECT_ID || undefined,
        supportedChains: [arbitrumSepolia],
        defaultChain: arbitrumSepolia
      }}
    >
      <PrivyWalletBridge>{children}</PrivyWalletBridge>
    </PrivyProvider>
  );
}

export function usePrivyWallet() {
  return useContext(PrivyWalletContext);
}
