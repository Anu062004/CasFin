"use client";

import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
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

export type WalletAdapter = {
  address: string;
  chainId: string | number | null;
  source: "privy" | "injected";
  disconnect?: () => Promise<void>;
  getEthereumProvider: () => Promise<InjectedEthereumProvider>;
  switchChain: (chainId: number) => Promise<void>;
};

type PrivyWalletContextValue = {
  configured: boolean;
  usingPrivy: boolean;
  ready: boolean;
  walletsReady: boolean;
  authenticated: boolean;
  wallet: WalletAdapter | null;
  wallets: WalletAdapter[];
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
  usingPrivy: false,
  ready: false,
  walletsReady: false,
  authenticated: false,
  wallet: null,
  wallets: [],
  openConnectWallet: () => {},
  logout: async () => {}
};

const PrivyWalletContext = createContext<PrivyWalletContextValue>(DEFAULT_PRIVY_WALLET_CONTEXT);

function createPrivyWalletAdapter(wallet: ConnectedWallet): WalletAdapter {
  return {
    address: wallet.address,
    chainId: wallet.chainId,
    source: "privy",
    disconnect: wallet.disconnect ? async () => wallet.disconnect?.() : undefined,
    getEthereumProvider: async () => (await wallet.getEthereumProvider()) as InjectedEthereumProvider,
    switchChain: async (chainId) => {
      await wallet.switchChain(chainId);
    }
  };
}

function createInjectedWalletAdapter(
  provider: InjectedEthereumProvider,
  address: string,
  chainId: string | number | null
): WalletAdapter {
  return {
    address,
    chainId,
    source: "injected",
    getEthereumProvider: async () => provider,
    switchChain: async (targetChainId) => {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${targetChainId.toString(16)}` }]
      });
    }
  };
}

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

  const selectedWalletAdapter = useMemo(
    () => (selectedWallet ? createPrivyWalletAdapter(selectedWallet) : null),
    [selectedWallet]
  );
  const walletAdapters = useMemo(
    () => wallets.filter((wallet): wallet is ConnectedWallet => wallet.type === "ethereum").map(createPrivyWalletAdapter),
    [wallets]
  );

  const contextValue = useMemo(
    () => ({
      configured: true,
      usingPrivy: true,
      ready,
      walletsReady,
      authenticated,
      wallet: selectedWalletAdapter,
      wallets: walletAdapters,
      openConnectWallet: () => connectWallet(),
      logout
    }),
    [authenticated, connectWallet, logout, ready, selectedWalletAdapter, walletAdapters, walletsReady]
  );

  return <PrivyWalletContext.Provider value={contextValue}>{children}</PrivyWalletContext.Provider>;
}

function InjectedWalletBridge({ children }: { children: ReactNode }) {
  const [configured, setConfigured] = useState(false);
  const [ready, setReady] = useState(false);
  const [wallet, setWallet] = useState<WalletAdapter | null>(null);

  const syncInjectedWallet = useCallback(async (requestAccounts = false) => {
    if (typeof window === "undefined") {
      return;
    }

    const provider = window.ethereum || null;

    setConfigured(Boolean(provider));

    if (!provider) {
      setWallet(null);
      setReady(true);
      return;
    }

    try {
      const [accounts, chainId] = await Promise.all([
        provider.request({ method: requestAccounts ? "eth_requestAccounts" : "eth_accounts" }),
        provider.request({ method: "eth_chainId" }).catch(() => null)
      ]);
      const nextAccount = Array.isArray(accounts) && typeof accounts[0] === "string" ? accounts[0] : "";

      setWallet(nextAccount ? createInjectedWalletAdapter(provider, nextAccount, chainId) : null);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const provider = window.ethereum || null;

    setConfigured(Boolean(provider));

    if (!provider) {
      setReady(true);
      return;
    }

    void syncInjectedWallet();

    const handleAccountsChanged = () => {
      void syncInjectedWallet();
    };
    const handleChainChanged = () => {
      void syncInjectedWallet();
    };

    provider.on?.("accountsChanged", handleAccountsChanged);
    provider.on?.("chainChanged", handleChainChanged);

    return () => {
      provider.removeListener?.("accountsChanged", handleAccountsChanged);
      provider.removeListener?.("chainChanged", handleChainChanged);
    };
  }, [syncInjectedWallet]);

  const contextValue = useMemo(
    () => ({
      configured,
      usingPrivy: false,
      ready,
      walletsReady: ready,
      authenticated: Boolean(wallet),
      wallet,
      wallets: wallet ? [wallet] : [],
      openConnectWallet: () => {
        void syncInjectedWallet(true);
      },
      logout: async () => {
        setWallet(null);
      }
    }),
    [configured, ready, syncInjectedWallet, wallet]
  );

  return <PrivyWalletContext.Provider value={contextValue}>{children}</PrivyWalletContext.Provider>;
}

export default function PrivyAppProvider({ children }: { children: ReactNode }) {
  if (!PRIVY_APP_ID) {
    return <InjectedWalletBridge>{children}</InjectedWalletBridge>;
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
