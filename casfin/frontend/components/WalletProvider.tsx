"use client";

import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { ethers } from "ethers";
import { CASFIN_CONFIG } from "@/lib/casfin-config";
import {
  EMPTY_CASINO_STATE,
  EMPTY_PREDICTION_STATE,
  extractError,
  formatAddress,
  formatEth,
  loadCasinoState,
  loadPredictionState
} from "@/lib/casfin-client";
import type {
  LastTransactionState,
  StatusTone,
  SyncWalletOptions,
  WalletContextValue,
  WalletSnapshot,
  WalletType
} from "@/lib/casfin-types";

const WalletContext = createContext<WalletContextValue | null>(null);

export default function WalletProvider({ children }: { children: ReactNode }) {
  const mountedRef = useRef(true);
  const activeProviderRef = useRef<InjectedEthereumProvider | null>(null);
  const providerListenersRef = useRef<{
    provider: InjectedEthereumProvider | null;
    handleAccountsChanged: ((accounts: string[]) => Promise<void>) | null;
    handleChainChanged: (() => Promise<void>) | null;
  }>({
    provider: null,
    handleAccountsChanged: null,
    handleChainChanged: null
  });
  const [walletAvailable, setWalletAvailable] = useState(false);
  const [account, setAccount] = useState("");
  const [walletBalance, setWalletBalance] = useState(0n);
  const [chainId, setChainId] = useState<number | null>(null);
  const [pendingAction, setPendingAction] = useState("");
  const [statusMessage, setStatusMessage] = useState("Read-only data is live from Arbitrum Sepolia.");
  const [statusTone, setStatusTone] = useState<StatusTone>("info");
  const [statusEventId, setStatusEventId] = useState(0);
  const [lastTransaction, setLastTransaction] = useState<LastTransactionState | null>(null);
  const [casinoLoadError, setCasinoLoadError] = useState("");
  const [predictionLoadError, setPredictionLoadError] = useState("");
  const [casinoState, setCasinoState] = useState(EMPTY_CASINO_STATE);
  const [predictionState, setPredictionState] = useState(EMPTY_PREDICTION_STATE);

  function pushStatus(message: string, tone: StatusTone = "info") {
    if (!mountedRef.current) {
      return;
    }

    setStatusMessage(message);
    setStatusTone(tone);
    setStatusEventId((current) => current + 1);
  }

  function getInjectedProvider(walletType: WalletType = "injected") {
    if (typeof window === "undefined" || !window.ethereum) {
      return null;
    }

    const providers = Array.isArray(window.ethereum.providers)
      ? window.ethereum.providers
      : [window.ethereum];

    if (walletType === "coinbase") {
      return providers.find((provider) => provider.isCoinbaseWallet) || null;
    }

    if (walletType === "metamask") {
      return providers.find((provider) => provider.isMetaMask && !provider.isCoinbaseWallet) || null;
    }

    return (
      activeProviderRef.current ||
      providers.find((provider) => provider.isMetaMask && !provider.isCoinbaseWallet) ||
      providers[0] ||
      null
    );
  }

  function clearWalletState() {
    if (!mountedRef.current) {
      return;
    }

    setWalletAvailable(false);
    setAccount("");
    setWalletBalance(0n);
    setChainId(null);
  }

  function detachProviderListeners() {
    const { provider, handleAccountsChanged, handleChainChanged } = providerListenersRef.current;

    if (provider?.removeListener) {
      if (handleAccountsChanged) {
        provider.removeListener("accountsChanged", handleAccountsChanged);
      }

      if (handleChainChanged) {
        provider.removeListener("chainChanged", handleChainChanged);
      }
    }

    providerListenersRef.current = {
      provider: null,
      handleAccountsChanged: null,
      handleChainChanged: null
    };
  }

  function attachProviderListeners(provider: InjectedEthereumProvider) {
    if (!provider?.on || providerListenersRef.current.provider === provider) {
      return;
    }

    detachProviderListeners();

    const handleAccountsChanged = async (accounts) => {
      const snapshot = await syncWallet({ provider, providedAccounts: accounts });
      await loadProtocolState(snapshot.account);
    };

    const handleChainChanged = async () => {
      const snapshot = await syncWallet({ provider });
      await loadProtocolState(snapshot.account);
    };

    provider.on("accountsChanged", handleAccountsChanged);
    provider.on("chainChanged", handleChainChanged);
    providerListenersRef.current = {
      provider,
      handleAccountsChanged,
      handleChainChanged
    };
  }

  async function syncWallet({
    provider,
    providedAccounts,
    requestAccounts = false,
    walletType = "injected"
  }: SyncWalletOptions = {}): Promise<WalletSnapshot> {
    const nextProvider = provider || getInjectedProvider(walletType);

    if (!nextProvider) {
      activeProviderRef.current = null;
      clearWalletState();
      return {
        provider: null,
        account: "",
        balance: 0n,
        chainId: null
      };
    }

    activeProviderRef.current = nextProvider;
    attachProviderListeners(nextProvider);
    setWalletAvailable(true);

    const [accounts, currentChainId] = await Promise.all([
      providedAccounts
        ? Promise.resolve(providedAccounts)
        : nextProvider.request({ method: requestAccounts ? "eth_requestAccounts" : "eth_accounts" }),
      nextProvider.request({ method: "eth_chainId" })
    ]);

    const nextAccount = accounts[0] || "";
    const parsedChainId = parseInt(currentChainId, 16);
    let nextBalance = 0n;

    if (nextAccount) {
      const browserProvider = new ethers.BrowserProvider(nextProvider);
      nextBalance = await browserProvider.getBalance(nextAccount);
    }

    if (!mountedRef.current) {
      return {
        provider: nextProvider,
        account: nextAccount,
        balance: nextBalance,
        chainId: parsedChainId
      };
    }

    setWalletAvailable(true);
    setAccount(nextAccount);
    setWalletBalance(nextBalance);
    setChainId(parsedChainId);

    return {
      provider: nextProvider,
      account: nextAccount,
      balance: nextBalance,
      chainId: parsedChainId
    };
  }

  async function refreshWalletState(options: SyncWalletOptions = {}): Promise<WalletSnapshot> {
    const snapshot = await syncWallet(options);

    if (options.loadProtocol === false) {
      return snapshot;
    }

    await loadProtocolState(snapshot.account);
    return snapshot;
  }

  async function ensureWalletBalance(provider, currentAccount) {
    if (!provider || !currentAccount) {
      return 0n;
    }

    const browserProvider = new ethers.BrowserProvider(provider);
    const nextBalance = await browserProvider.getBalance(currentAccount);

    if (mountedRef.current) {
      setWalletBalance(nextBalance);
    }

    return nextBalance;
  }

  async function getEstimatedFeePerGas(provider, transactionRequest) {
    if (transactionRequest.maxFeePerGas != null) {
      return ethers.toBigInt(transactionRequest.maxFeePerGas);
    }

    if (transactionRequest.gasPrice != null) {
      return ethers.toBigInt(transactionRequest.gasPrice);
    }

    try {
      const gasPrice = await provider.send("eth_gasPrice", []);
      return ethers.toBigInt(gasPrice);
    } catch {
      const latestBlock = await provider.getBlock("latest");
      if (latestBlock?.baseFeePerGas != null) {
        return latestBlock.baseFeePerGas * 2n;
      }
    }

    return 0n;
  }

  async function applySafeFeeOverrides(provider, transactionRequest) {
    const nextRequest = { ...transactionRequest };

    if (nextRequest.gasPrice != null || nextRequest.maxFeePerGas != null) {
      return nextRequest;
    }

    try {
      const gasPrice = ethers.toBigInt(await provider.send("eth_gasPrice", []));
      const {
        type: _type,
        maxFeePerGas: _maxFeePerGas,
        maxPriorityFeePerGas: _maxPriorityFeePerGas,
        ...rest
      } = nextRequest;

      return {
        ...rest,
        gasPrice
      };
    } catch {
      const latestBlock = await provider.getBlock("latest");
      const baseFeePerGas = latestBlock?.baseFeePerGas ?? 0n;

      if (baseFeePerGas > 0n) {
        return {
          ...nextRequest,
          maxFeePerGas: baseFeePerGas * 2n,
          maxPriorityFeePerGas: 0n
        };
      }

      return nextRequest;
    }
  }

  async function validateTransactionRequest(label, signer, transactionRequest) {
    const currentAccount = await signer.getAddress();
    const provider = signer.provider;

    if (!provider) {
      return;
    }

    const currentBalance = await provider.getBalance(currentAccount);

    if (mountedRef.current) {
      setWalletBalance(currentBalance);
    }

    const transferValue = ethers.toBigInt(transactionRequest.value ?? 0);
    const feePerGas = await getEstimatedFeePerGas(provider, transactionRequest);
    let gasLimit = transactionRequest.gasLimit != null ? ethers.toBigInt(transactionRequest.gasLimit) : 0n;

    if (gasLimit === 0n) {
      try {
        gasLimit = await signer.estimateGas({ ...transactionRequest, from: currentAccount });
      } catch {
        gasLimit = transferValue > 0n ? 21_000n : 0n;
      }
    }

    const estimatedNetworkFee = gasLimit > 0n && feePerGas > 0n ? gasLimit * feePerGas : 0n;
    const estimatedTotal = transferValue + estimatedNetworkFee;

    if (currentBalance >= estimatedTotal) {
      return;
    }

    const balanceText = `${formatEth(currentBalance, 6)} ETH`;
    const requiredText = `${formatEth(estimatedTotal, 6)} ETH`;
    const valueText = transferValue > 0n ? `${formatEth(transferValue, 6)} ETH` : "0 ETH";
    const connectedWallet = formatAddress(currentAccount);

    throw new Error(
      `Insufficient ETH in ${connectedWallet}. Available: ${balanceText}. ${label} needs about ${requiredText} including gas (${valueText} value). Switch MetaMask to a funded account or reduce the amount.`
    );
  }

  function createValidatedSigner(signer, label) {
    return new Proxy(signer, {
      get(target, property, receiver) {
        if (property === "sendTransaction") {
          return async (transactionRequest) => {
            await validateTransactionRequest(label, target, transactionRequest);
            const nextRequest = await applySafeFeeOverrides(target.provider, transactionRequest);
            return target.sendTransaction(nextRequest);
          };
        }

        const value = Reflect.get(target, property, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      }
    });
  }

  async function ensureTargetNetwork(): Promise<WalletSnapshot> {
    const provider = activeProviderRef.current || getInjectedProvider();

    if (!provider) {
      setWalletAvailable(false);
      throw new Error("A wallet is required for write actions.");
    }

    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: CASFIN_CONFIG.chainIdHex }]
      });
    } catch (error) {
      if (error?.code !== 4902) {
        throw error;
      }

      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: CASFIN_CONFIG.chainIdHex,
            chainName: CASFIN_CONFIG.chainName,
            rpcUrls: [CASFIN_CONFIG.publicRpcUrl],
            nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
            blockExplorerUrls: [CASFIN_CONFIG.explorerBaseUrl]
          }
        ]
      });
    }

    return syncWallet({ provider });
  }

  async function connectWallet(walletType: WalletType = "injected"): Promise<void> {
    if (typeof window === "undefined" || !window.ethereum) {
      pushStatus("No wallet detected. Install MetaMask or Coinbase Wallet and try again.", "warning");
      window.open(
        walletType === "coinbase"
          ? "https://www.coinbase.com/wallet"
          : "https://metamask.io/download/",
        "_blank"
      );
      return;
    }

    const provider = getInjectedProvider(walletType);

    if (!provider) {
      pushStatus("The requested wallet is not available in this browser.", "warning");
      return;
    }

    try {
      const { account: nextAccount } = await refreshWalletState({
        loadProtocol: true,
        provider,
        requestAccounts: true,
        walletType
      });

      pushStatus(nextAccount ? "Wallet connected. Write actions unlocked." : "Connection cancelled.", "info");
    } catch (error) {
      pushStatus(extractError(error), "error");
    }
  }

  function disconnectWallet() {
    activeProviderRef.current = null;
    detachProviderListeners();
    setAccount("");
    setWalletBalance(0n);
    setChainId(null);
    setCasinoLoadError("");
    setPredictionLoadError("");
    setCasinoState(EMPTY_CASINO_STATE);
    setPredictionState(EMPTY_PREDICTION_STATE);
    pushStatus("Wallet disconnected.", "info");
  }

  async function loadProtocolState(currentAccount = account) {
    const [casinoResult, predictionResult] = await Promise.allSettled([
      loadCasinoState(currentAccount),
      loadPredictionState(currentAccount)
    ]);

    if (!mountedRef.current) {
      return;
    }

    if (casinoResult.status === "fulfilled") {
      setCasinoState(casinoResult.value);
      setCasinoLoadError("");
    } else {
      setCasinoLoadError(extractError(casinoResult.reason));
    }

    if (predictionResult.status === "fulfilled") {
      setPredictionState(predictionResult.value);
      setPredictionLoadError("");
    } else {
      setPredictionLoadError(extractError(predictionResult.reason));
    }
  }

  async function runTransaction(label, handler) {
    if (!walletAvailable) {
      pushStatus("Connect a wallet before sending transactions.", "warning");
      return;
    }

    setPendingAction(label);
    pushStatus(`${label} is waiting for wallet confirmation.`, "info");

    try {
      const walletSnapshot = await refreshWalletState({ loadProtocol: false, requestAccounts: true });

      if (!walletSnapshot.account) {
        throw new Error("No wallet account is connected in MetaMask.");
      }

      const nextAccount = (await ensureTargetNetwork()).account || walletSnapshot.account;
      const provider = activeProviderRef.current;

      if (!provider) {
        throw new Error("No injected wallet is available for this transaction.");
      }

      await ensureWalletBalance(provider, nextAccount);

      const browserProvider = new ethers.BrowserProvider(provider);
      const signer = await browserProvider.getSigner(nextAccount);
      const transaction = await handler(createValidatedSigner(signer, label));

      setLastTransaction({
        label,
        hash: transaction.hash,
        status: "submitted",
        timestamp: Date.now()
      });
      pushStatus(`${label} submitted to Arbitrum Sepolia.`, "info");

      await transaction.wait();

      setLastTransaction({
        label,
        hash: transaction.hash,
        status: "confirmed",
        timestamp: Date.now()
      });
      pushStatus(`${label} confirmed.`, "success");
      await loadProtocolState(nextAccount);
    } catch (error) {
      pushStatus(extractError(error), "error");
    } finally {
      if (mountedRef.current) {
        setPendingAction("");
      }
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    let disposed = false;

    async function boot() {
      const defaultProvider = getInjectedProvider();
      const snapshot = await syncWallet({ provider: defaultProvider });
      if (!disposed) {
        await loadProtocolState(snapshot.account);
      }
    }

    boot();

    return () => {
      disposed = true;
      mountedRef.current = false;
      detachProviderListeners();
    };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      refreshWalletState({ loadProtocol: false });
      loadProtocolState(account);
    }, 20000);

    return () => {
      window.clearInterval(interval);
    };
  }, [account]);

  const isConnected = Boolean(account);
  const isCorrectChain = chainId === CASFIN_CONFIG.chainId;
  const isOperator = Boolean(account) && account.toLowerCase() === CASFIN_CONFIG.operatorAddress.toLowerCase();
  const walletBlocked = Boolean(pendingAction) || !isConnected || !isCorrectChain;

  return (
    <WalletContext.Provider
      value={{
        walletAvailable,
        account,
        walletBalance,
        chainId,
        isConnected,
        isCorrectChain,
        isOperator,
        walletBlocked,
        connectWallet,
        disconnectWallet,
        ensureTargetNetwork,
        refreshWalletState,
        syncWallet,
        runTransaction,
        pendingAction,
        statusMessage,
        statusTone,
        statusEventId,
        lastTransaction,
        loadError: casinoLoadError || predictionLoadError,
        casinoLoadError,
        predictionLoadError,
        casinoState,
        predictionState,
        loadProtocolState
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletContextValue {
  const context = useContext(WalletContext);

  if (!context) {
    throw new Error("useWallet must be used within WalletProvider.");
  }

  return context;
}
