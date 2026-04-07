"use client";

import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ethers } from "ethers";
import { CASFIN_CONFIG } from "@/lib/casfin-config";
import { useCofhe } from "@/lib/cofhe-provider";
import {
  EMPTY_CASINO_STATE,
  EMPTY_PREDICTION_STATE,
  extractError,
  formatAddress,
  formatEth,
  loadCasinoState,
  loadPredictionState,
  pollingProvider
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
const SKIPPED_PROTOCOL_LOAD = Symbol("SKIPPED_PROTOCOL_LOAD");

export default function WalletProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const mountedRef = useRef(true);
  const activeProviderRef = useRef<InjectedEthereumProvider | null>(null);
  const cofheReadyRef = useRef(false);
  const cofheConnectedRef = useRef(false);
  const cofheSessionReadyRef = useRef(false);
  const providerListenersRef = useRef<{
    provider: InjectedEthereumProvider | null;
    handleAccountsChanged: ((accounts: string[]) => Promise<void>) | null;
    handleChainChanged: (() => Promise<void>) | null;
  }>({
    provider: null,
    handleAccountsChanged: null,
    handleChainChanged: null
  });
  const {
    connect: connectCofhe,
    disconnect: disconnectCofhe,
    ready: cofheReady,
    connected: cofheConnected,
    sessionReady: cofheSessionReady,
    sessionInitializing: cofheSessionInitializing,
    ensureSessionReady: ensureCofheSessionReady
  } = useCofhe();
  const [walletAvailable, setWalletAvailable] = useState(false);
  const [account, setAccount] = useState("");
  const [walletBalance, setWalletBalance] = useState(0n);
  const [chainId, setChainId] = useState<number | null>(null);
  const [pendingAction, setPendingAction] = useState("");
  const [statusMessage, setStatusMessage] = useState(`Read-only data is live from ${CASFIN_CONFIG.chainName}.`);
  const [statusTone, setStatusTone] = useState<StatusTone>("info");
  const [statusEventId, setStatusEventId] = useState(0);
  const [lastTransaction, setLastTransaction] = useState<LastTransactionState | null>(null);
  const [casinoLoadError, setCasinoLoadError] = useState("");
  const [predictionLoadError, setPredictionLoadError] = useState("");
  const [casinoState, setCasinoState] = useState(EMPTY_CASINO_STATE);
  const [predictionState, setPredictionState] = useState(EMPTY_PREDICTION_STATE);
  const targetChainParams = {
    chainId: CASFIN_CONFIG.chainIdHex,
    chainName: CASFIN_CONFIG.chainName,
    rpcUrls: [CASFIN_CONFIG.walletRpcUrl],
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    blockExplorerUrls: [CASFIN_CONFIG.explorerBaseUrl]
  };

  function getProtocolScope() {
    if (!pathname || pathname === "/") {
      return { shouldLoadCasino: true, shouldLoadPrediction: true };
    }

    if (pathname.startsWith("/casino") || pathname.startsWith("/wallet")) {
      return { shouldLoadCasino: true, shouldLoadPrediction: false };
    }

    if (pathname.startsWith("/predictions")) {
      return { shouldLoadCasino: false, shouldLoadPrediction: true };
    }

    return { shouldLoadCasino: true, shouldLoadPrediction: true };
  }

  function applyProtocolLoadResults(casinoResult, predictionResult) {
    if (!mountedRef.current) {
      return;
    }

    if (casinoResult.status === "fulfilled") {
      if (casinoResult.value !== SKIPPED_PROTOCOL_LOAD) {
        setCasinoState(casinoResult.value);
      }
      setCasinoLoadError("");
    } else {
      setCasinoLoadError(extractError(casinoResult.reason));
    }

    if (predictionResult.status === "fulfilled") {
      if (predictionResult.value !== SKIPPED_PROTOCOL_LOAD) {
        setPredictionState(predictionResult.value);
      }
      setPredictionLoadError("");
    } else {
      setPredictionLoadError(extractError(predictionResult.reason));
    }
  }

  function pushStatus(message: string, tone: StatusTone = "info") {
    if (!mountedRef.current) {
      return;
    }

    setStatusMessage(message);
    setStatusTone(tone);
    setStatusEventId((current) => current + 1);
  }

  function logBackgroundWalletError(context: string, error: unknown) {
    console.warn(`[WalletProvider] ${context}`, error);
  }

  function getBalanceFallback(nextAccount: string) {
    if (!account || account.toLowerCase() !== nextAccount.toLowerCase()) {
      return 0n;
    }

    return walletBalance;
  }

  async function getWalletBalanceWithFallback(provider: InjectedEthereumProvider, nextAccount: string) {
    const browserProvider = new ethers.BrowserProvider(provider);

    try {
      return await browserProvider.getBalance(nextAccount);
    } catch (error) {
      logBackgroundWalletError(`Failed to refresh balance for ${nextAccount}.`, error);
      return getBalanceFallback(nextAccount);
    }
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

    disconnectCofhe();
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
      try {
        const snapshot = await syncWallet({ provider, providedAccounts: accounts });
        await loadProtocolState(snapshot.account);
      } catch (error) {
        logBackgroundWalletError("Failed to handle accountsChanged.", error);
      }
    };

    const handleChainChanged = async () => {
      try {
        const snapshot = await syncWallet({ provider });
        await loadProtocolState(snapshot.account);
      } catch (error) {
        logBackgroundWalletError("Failed to handle chainChanged.", error);
      }
    };

    provider.on("accountsChanged", handleAccountsChanged);
    provider.on("chainChanged", handleChainChanged);
    providerListenersRef.current = {
      provider,
      handleAccountsChanged,
      handleChainChanged
    };
  }

  useEffect(() => {
    cofheReadyRef.current = cofheReady;
    cofheConnectedRef.current = cofheConnected;
    cofheSessionReadyRef.current = cofheSessionReady;
  }, [cofheConnected, cofheReady, cofheSessionReady]);

  const waitForCofheReady = useCallback(async (timeoutMs = 5000) => {
    if (cofheReadyRef.current) {
      return true;
    }

    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      await new Promise((resolve) => window.setTimeout(resolve, 100));

      if (cofheReadyRef.current) {
        return true;
      }
    }

    return cofheReadyRef.current;
  }, []);

  const connectCofheSession = useCallback(
    async (provider: InjectedEthereumProvider, targetAccount?: string) => {
      if (!provider || !targetAccount) {
        return;
      }

      const ready = await waitForCofheReady();

      if (!ready) {
        throw new Error("The encrypted CoFHE session is still loading. Wait a moment and try again.");
      }

      const browserProvider = new ethers.BrowserProvider(provider);
      const signer = await browserProvider.getSigner(targetAccount);
      await connectCofhe(browserProvider, signer);
    },
    [connectCofhe, waitForCofheReady]
  );

  const ensureEncryptedSession = useCallback(
    async (currentAccount?: string) => {
      let nextAccount = currentAccount || account;
      let provider = activeProviderRef.current || getInjectedProvider();

      if (!provider || !nextAccount) {
        throw new Error("Connect a wallet before starting the encrypted session.");
      }

      if (chainId !== CASFIN_CONFIG.chainId) {
        const snapshot = await ensureTargetNetwork();
        nextAccount = snapshot.account || nextAccount;
        provider = activeProviderRef.current || provider;
      }

      if (cofheConnectedRef.current) {
        if (!cofheSessionReadyRef.current) {
          pushStatus("Finalizing the encrypted CoFHE session for this wallet.", "info");
          await ensureCofheSessionReady();
        }

        return;
      }

      pushStatus("Starting the encrypted CoFHE session for this wallet.", "info");
      await connectCofheSession(provider, nextAccount);
      await ensureCofheSessionReady();
    },
    [account, chainId, connectCofheSession, ensureCofheSessionReady]
  );

  async function ensureWalletNetworkConfig(provider: InjectedEthereumProvider) {
    try {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [targetChainParams]
      });
    } catch (error) {
      if (error?.code === 4001) {
        throw error;
      }

      if (error?.code === -32601 || /not supported/i.test(String(error?.message || ""))) {
        return;
      }

      logBackgroundWalletError("Failed to refresh wallet network configuration.", error);
    }
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
      nextBalance = await getWalletBalanceWithFallback(nextProvider, nextAccount);
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

    const nextBalance = await getWalletBalanceWithFallback(provider, currentAccount);

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
      try {
        const latestBlock = await provider.getBlock("latest");
        if (latestBlock?.baseFeePerGas != null) {
          return latestBlock.baseFeePerGas * 2n;
        }
      } catch (error) {
        logBackgroundWalletError("Failed to estimate fee per gas from wallet provider.", error);
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
      try {
        const latestBlock = await provider.getBlock("latest");
        const baseFeePerGas = latestBlock?.baseFeePerGas ?? 0n;

        if (baseFeePerGas > 0n) {
          return {
            ...nextRequest,
            maxFeePerGas: baseFeePerGas * 2n,
            maxPriorityFeePerGas: 0n
          };
        }
      } catch (error) {
        logBackgroundWalletError("Failed to apply wallet fee overrides.", error);
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

    let currentBalance = 0n;

    try {
      currentBalance = await provider.getBalance(currentAccount);
    } catch (error) {
      logBackgroundWalletError(`Skipping balance precheck for ${label}.`, error);
      return;
    }

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

    pushStatus(`Approve the ${CASFIN_CONFIG.chainName} network change in your wallet if prompted.`, "info");

    try {
      await ensureWalletNetworkConfig(provider);
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: CASFIN_CONFIG.chainIdHex }]
      });
    } catch (error) {
      if (error?.code !== 4902) {
        throw error;
      }

      await ensureWalletNetworkConfig(provider);
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: CASFIN_CONFIG.chainIdHex }]
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

    activeProviderRef.current = provider;
    attachProviderListeners(provider);
    setWalletAvailable(true);

    try {
      pushStatus("Approve the wallet connection request in MetaMask or Coinbase Wallet.", "info");

      if (walletType === "metamask") {
        try {
          await provider.request({
            method: "wallet_requestPermissions",
            params: [{ eth_accounts: {} }]
          });
        } catch (error) {
          if (error?.code === 4001) {
            throw error;
          }

          if (error?.code !== -32601) {
            logBackgroundWalletError("MetaMask permission prompt could not be opened.", error);
          }
        }
      }

      const snapshot = await syncWallet({
        provider,
        requestAccounts: true,
        walletType
      });

      let readySnapshot = snapshot;

      if (snapshot.account && snapshot.chainId !== CASFIN_CONFIG.chainId) {
        readySnapshot = await ensureTargetNetwork();
      }

      await loadProtocolState(readySnapshot.account);

      if (readySnapshot.account && readySnapshot.chainId === CASFIN_CONFIG.chainId) {
        await ensureEncryptedSession(readySnapshot.account);
      }

      pushStatus(
        readySnapshot.account
          ? `Wallet connected on ${CASFIN_CONFIG.chainName}. Encrypted actions are ready.`
          : "Connection cancelled.",
        readySnapshot.account ? "success" : "warning"
      );
    } catch (error) {
      pushStatus(extractError(error), "error");
    }
  }

  function disconnectWallet() {
    activeProviderRef.current = null;
    detachProviderListeners();
    disconnectCofhe();
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
    const { shouldLoadCasino, shouldLoadPrediction } = getProtocolScope();
    const [casinoResult, predictionResult] = await Promise.allSettled([
      shouldLoadCasino ? loadCasinoState(currentAccount) : Promise.resolve(SKIPPED_PROTOCOL_LOAD),
      shouldLoadPrediction ? loadPredictionState(currentAccount) : Promise.resolve(SKIPPED_PROTOCOL_LOAD)
    ]);

    applyProtocolLoadResults(casinoResult, predictionResult);
  }

  async function loadPolledProtocolState(currentAccount = account) {
    const { shouldLoadCasino, shouldLoadPrediction } = getProtocolScope();
    const [casinoResult, predictionResult] = await Promise.allSettled([
      shouldLoadCasino ? loadCasinoState(currentAccount, pollingProvider) : Promise.resolve(SKIPPED_PROTOCOL_LOAD),
      shouldLoadPrediction ? loadPredictionState(currentAccount, pollingProvider) : Promise.resolve(SKIPPED_PROTOCOL_LOAD)
    ]);

    applyProtocolLoadResults(casinoResult, predictionResult);
  }

  async function runTransaction(label, handler) {
    if (!walletAvailable && !getInjectedProvider()) {
      pushStatus("Connect a wallet before sending transactions.", "warning");
      return;
    }

    pushStatus(`Preparing ${label.toLowerCase()} on ${CASFIN_CONFIG.chainName}.`, "info");

    try {
      const walletSnapshot = await refreshWalletState({ loadProtocol: false, requestAccounts: true });

      if (!walletSnapshot.account) {
        throw new Error("No wallet account is connected in MetaMask.");
      }

      const networkSnapshot =
        walletSnapshot.chainId === CASFIN_CONFIG.chainId ? walletSnapshot : await ensureTargetNetwork();
      const nextAccount = networkSnapshot.account || walletSnapshot.account;
      const provider = activeProviderRef.current;

      if (!provider) {
        throw new Error("No injected wallet is available for this transaction.");
      }

      await ensureWalletBalance(provider, nextAccount);
      await ensureEncryptedSession(nextAccount);

      setPendingAction(label);
      pushStatus(`${label} is ready. Approve it in MetaMask when prompted.`, "info");
      const browserProvider = new ethers.BrowserProvider(provider);
      const signer = await browserProvider.getSigner(nextAccount);
      const transaction = await handler(createValidatedSigner(signer, label));

      setLastTransaction({
        label,
        hash: transaction.hash,
        status: "submitted",
        timestamp: Date.now()
      });
      pushStatus(`${label} submitted to ${CASFIN_CONFIG.chainName}.`, "info");

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

    boot().catch((error) => {
      logBackgroundWalletError("Initial wallet boot failed.", error);
    });

    return () => {
      disposed = true;
      mountedRef.current = false;
      detachProviderListeners();
    };
  }, []);

  useEffect(() => {
    if (!cofheReady) {
      return;
    }

    if (!account || chainId !== CASFIN_CONFIG.chainId || !activeProviderRef.current) {
      if (cofheConnected) {
        disconnectCofhe();
      }

      return;
    }

    if (cofheSessionReady || cofheSessionInitializing) {
      return;
    }

    ensureEncryptedSession(account).catch((error) => {
      console.error("[WalletProvider] Failed to connect CoFHE session.", error);
      pushStatus("Wallet connected, but the encrypted session could not start. Refresh the wallet connection and try again.", "warning");
    });
  }, [
    account,
    chainId,
    cofheConnected,
    cofheReady,
    cofheSessionInitializing,
    cofheSessionReady,
    disconnectCofhe,
    ensureEncryptedSession
  ]);

  useEffect(() => {
    loadProtocolState(account).catch((error) => {
      logBackgroundWalletError("Route-specific protocol refresh failed.", error);
    });
  }, [account, pathname]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.hidden) {
        return;
      }

      refreshWalletState({ loadProtocol: false }).catch((error) => {
        logBackgroundWalletError("Periodic wallet refresh failed.", error);
      });
      loadPolledProtocolState(account).catch((error) => {
        logBackgroundWalletError("Periodic protocol refresh failed.", error);
      });
    }, 45000);

    return () => {
      window.clearInterval(interval);
    };
  }, [account]);

  const isConnected = Boolean(account);
  const isCorrectChain = chainId === CASFIN_CONFIG.chainId;
  const isOperator = Boolean(account) && account.toLowerCase() === CASFIN_CONFIG.operatorAddress.toLowerCase();
  const walletBlocked =
    Boolean(pendingAction)
    || (isConnected && isCorrectChain && (!cofheSessionReady || cofheSessionInitializing));

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
        cofheSessionReady,
        cofheSessionInitializing,
        connectWallet,
        disconnectWallet,
        ensureTargetNetwork,
        ensureEncryptedSession,
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
