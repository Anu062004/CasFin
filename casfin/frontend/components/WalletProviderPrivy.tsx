"use client";

import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ethers } from "ethers";
import { usePrivyWallet, type WalletAdapter } from "@/components/PrivyAppProvider";
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
  pollingProvider,
  publicProvider
} from "@/lib/casfin-client";
import type {
  LastTransactionState,
  StatusTone,
  SyncWalletOptions,
  WalletContextValue,
  WalletSnapshot
} from "@/lib/casfin-types";

type WalletRpcProvider = InjectedEthereumProvider;

const WalletContext = createContext<WalletContextValue | null>(null);
const SKIPPED_PROTOCOL_LOAD = Symbol("SKIPPED_PROTOCOL_LOAD");
const DEFAULT_WRITE_GAS_LIMIT = 800_000n;
const ENCRYPTED_WRITE_GAS_LIMIT = 1_500_000n;
const MIN_GAS_HEADROOM = 50_000n;

const ENCRYPTED_WRITE_TARGETS = new Set(
  [
    CASFIN_CONFIG.addresses.casinoVault,
    CASFIN_CONFIG.addresses.coinFlipGame,
    CASFIN_CONFIG.addresses.diceGame,
    CASFIN_CONFIG.addresses.crashGame,
    CASFIN_CONFIG.addresses.marketFactory,
    CASFIN_CONFIG.addresses.encryptedMarketFactory
  ]
    .filter((address) => address && address !== ethers.ZeroAddress)
    .map((address) => address.toLowerCase())
);

function parseChainId(value: string | number | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string" || !value) {
    return null;
  }

  if (value.startsWith("eip155:")) {
    const parsed = Number(value.slice("eip155:".length));
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (value.startsWith("0x")) {
    const parsed = Number.parseInt(value, 16);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getErrorCode(error: unknown) {
  if (typeof error === "object" && error !== null && "code" in error) {
    return (error as { code?: number }).code;
  }

  return undefined;
}

export default function WalletProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const privyWallet = usePrivyWallet();
  const mountedRef = useRef(true);
  const activeWalletRef = useRef<WalletAdapter | null>(null);
  const activeProviderRef = useRef<WalletRpcProvider | null>(null);
  const cofheReadyRef = useRef(false);
  const cofheConnectedRef = useRef(false);
  const cofheSessionReadyRef = useRef(false);
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
  const walletConnectorReady = privyWallet.configured && privyWallet.ready && privyWallet.walletsReady;

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

  async function getWalletBalanceWithFallback(provider: WalletRpcProvider, nextAccount: string) {
    const browserProvider = new ethers.BrowserProvider(provider);

    try {
      return await browserProvider.getBalance(nextAccount);
    } catch (error) {
      logBackgroundWalletError(`Failed to refresh balance for ${nextAccount}.`, error);
      return getBalanceFallback(nextAccount);
    }
  }

  function resetWalletConnectionState() {
    activeProviderRef.current = null;
    disconnectCofhe();
    setAccount("");
    setWalletBalance(0n);
    setChainId(null);
  }

  async function getActiveWalletProvider(wallet: WalletAdapter | null = activeWalletRef.current) {
    if (!wallet) {
      activeProviderRef.current = null;
      return null;
    }

    const provider = (await wallet.getEthereumProvider()) as WalletRpcProvider;
    activeProviderRef.current = provider;
    return provider;
  }

  async function ensureWalletNetworkConfig(provider: WalletRpcProvider) {
    try {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [targetChainParams]
      });
    } catch (error) {
      const errorCode = getErrorCode(error);

      if (errorCode === 4001) {
        throw error;
      }

      if (errorCode !== -32601 && !/already exists|user rejected/i.test(String((error as { message?: string })?.message || ""))) {
        logBackgroundWalletError("Failed to refresh wallet network configuration.", error);
      }
    }
  }

  useEffect(() => {
    activeWalletRef.current = privyWallet.wallet;
  }, [privyWallet.wallet]);

  useEffect(() => {
    cofheReadyRef.current = cofheReady;
    cofheConnectedRef.current = cofheConnected;
    cofheSessionReadyRef.current = cofheSessionReady;
  }, [cofheConnected, cofheReady, cofheSessionReady]);

  useEffect(() => {
    if (!mountedRef.current) {
      return;
    }

    setWalletAvailable(walletConnectorReady);
  }, [walletConnectorReady]);

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
    async (provider: WalletRpcProvider, targetAccount?: string) => {
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
      let provider = activeProviderRef.current || (await getActiveWalletProvider());

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

  async function syncWallet({
    provider,
    providedAccounts
  }: SyncWalletOptions = {}): Promise<WalletSnapshot> {
    const currentWallet = activeWalletRef.current || privyWallet.wallet;

    if (!walletConnectorReady || !currentWallet) {
      resetWalletConnectionState();
      return {
        provider: null,
        account: "",
        balance: 0n,
        chainId: null
      };
    }

    const nextProvider = provider || (await getActiveWalletProvider(currentWallet));

    if (!nextProvider) {
      resetWalletConnectionState();
      return {
        provider: null,
        account: "",
        balance: 0n,
        chainId: null
      };
    }

    const accounts = providedAccounts || [currentWallet.address];
    const currentChainId =
      await nextProvider.request({ method: "eth_chainId" }).catch(() => currentWallet.chainId);

    const nextAccount = accounts[0] || currentWallet.address || "";
    const parsedChainId = parseChainId(currentChainId) ?? parseChainId(currentWallet.chainId);
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

  async function ensureWalletBalance(provider: WalletRpcProvider, currentAccount: string) {
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

  function withGasHeadroom(estimatedGas: bigint) {
    const headroom = estimatedGas / 5n;
    return estimatedGas + (headroom > MIN_GAS_HEADROOM ? headroom : MIN_GAS_HEADROOM);
  }

  function normalizeTargetAddress(target: unknown) {
    return typeof target === "string" ? target.toLowerCase() : "";
  }

  function isEncryptedWriteRequest(transactionRequest) {
    return ENCRYPTED_WRITE_TARGETS.has(normalizeTargetAddress(transactionRequest?.to));
  }

  function getFallbackGasLimit(transactionRequest) {
    return isEncryptedWriteRequest(transactionRequest)
      ? ENCRYPTED_WRITE_GAS_LIMIT
      : DEFAULT_WRITE_GAS_LIMIT;
  }

  function extractRpcRevertData(error: unknown): string | null {
    const typedError = error as {
      data?: unknown;
      error?: { data?: unknown; error?: { data?: unknown } };
      info?: { error?: { data?: unknown; error?: { data?: unknown } } };
    };
    const candidates = [
      typedError?.data,
      typedError?.error?.data,
      typedError?.error?.error?.data,
      typedError?.info?.error?.data,
      typedError?.info?.error?.error?.data
    ];

    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.startsWith("0x")) {
        return candidate;
      }

      const nestedCandidate = candidate as { data?: unknown } | null;

      if (
        nestedCandidate
        && typeof nestedCandidate === "object"
        && typeof nestedCandidate.data === "string"
        && nestedCandidate.data.startsWith("0x")
      ) {
        return nestedCandidate.data;
      }
    }

    return null;
  }

  function shouldUseStaticGasFallback(error: unknown) {
    if (extractRpcRevertData(error)) {
      return false;
    }

    const message = extractError(error);

    return (
      message === "Transaction failed."
      || /Internal JSON-RPC error/i.test(message)
      || /RPC endpoint returned too many errors|rate limit|too many requests|429|missing response for request|failed to detect network|cannot start up/i.test(
        message
      )
    );
  }

  async function applySafeGasOverrides(provider, signer, transactionRequest, label) {
    const nextRequest = { ...transactionRequest };

    if (nextRequest.gasLimit != null) {
      return nextRequest;
    }

    if (isEncryptedWriteRequest(nextRequest)) {
      return {
        ...nextRequest,
        gasLimit: ENCRYPTED_WRITE_GAS_LIMIT
      };
    }

    const currentAccount = await signer.getAddress();
    const estimationRequest = { ...nextRequest, from: currentAccount };
    const estimationProviders = [provider, publicProvider].filter(
      (candidate, index, providers) => candidate && providers.indexOf(candidate) === index
    );
    let lastError: unknown;

    for (const [index, estimationProvider] of estimationProviders.entries()) {
      try {
        const estimatedGas = await estimationProvider.estimateGas(estimationRequest);
        return {
          ...nextRequest,
          gasLimit: withGasHeadroom(estimatedGas)
        };
      } catch (error) {
        lastError = error;

        if (!shouldUseStaticGasFallback(error)) {
          throw new Error(extractError(error));
        }

        logBackgroundWalletError(
          `${label} gas estimation failed on provider candidate ${index + 1}; trying the next fallback.`,
          error
        );
      }
    }

    if (shouldUseStaticGasFallback(lastError)) {
      const fallbackGasLimit = getFallbackGasLimit(nextRequest);

      logBackgroundWalletError(
        `${label} is using fallback gas limit ${fallbackGasLimit.toString()} after wallet preflight failed.`,
        lastError
      );

      return {
        ...nextRequest,
        gasLimit: fallbackGasLimit
      };
    }

    throw lastError;
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
      `Insufficient ETH in ${connectedWallet}. Available: ${balanceText}. ${label} needs about ${requiredText} including gas (${valueText} value). Fund the connected wallet or reduce the amount.`
    );
  }

  function createValidatedSigner(signer, label) {
    return new Proxy(signer, {
      get(target, property, receiver) {
        if (property === "sendTransaction") {
          return async (transactionRequest) => {
            const gasReadyRequest = await applySafeGasOverrides(target.provider, target, transactionRequest, label);
            await validateTransactionRequest(label, target, gasReadyRequest);
            const nextRequest = await applySafeFeeOverrides(target.provider, gasReadyRequest);
            return target.sendTransaction(nextRequest);
          };
        }

        const value = Reflect.get(target, property, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      }
    });
  }

  async function ensureTargetNetwork(): Promise<WalletSnapshot> {
    const currentWallet = activeWalletRef.current || privyWallet.wallet;

    if (!currentWallet) {
      throw new Error(
        privyWallet.configured
          ? "A wallet is required for write actions."
          : "No supported wallet was detected. Install MetaMask or set NEXT_PUBLIC_PRIVY_APP_ID and redeploy."
      );
    }

    pushStatus(`Approve the ${CASFIN_CONFIG.chainName} network change in your wallet if prompted.`, "info");

    const provider = activeProviderRef.current || (await getActiveWalletProvider(currentWallet));

    if (provider) {
      await ensureWalletNetworkConfig(provider);
    }

    try {
      await currentWallet.switchChain(CASFIN_CONFIG.chainId);
    } catch (switchError) {
      const refreshedProvider = provider || (await getActiveWalletProvider(currentWallet));

      if (!refreshedProvider) {
        throw switchError;
      }

      await ensureWalletNetworkConfig(refreshedProvider);

      await refreshedProvider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: CASFIN_CONFIG.chainIdHex }]
      });
    }

    return syncWallet();
  }

  async function connectWallet(): Promise<void> {
    if (!privyWallet.configured) {
      pushStatus("No supported wallet was detected. Install MetaMask or add NEXT_PUBLIC_PRIVY_APP_ID to the frontend environment.", "warning");
      return;
    }

    if (!walletConnectorReady) {
      pushStatus("Wallet connect is still loading. Wait a moment and try again.", "info");
      return;
    }

    pushStatus(
      privyWallet.usingPrivy
        ? `Continue in Privy to connect a wallet on ${CASFIN_CONFIG.chainName}.`
        : `Approve the connection request in your wallet extension for ${CASFIN_CONFIG.chainName}.`,
      "info"
    );
    privyWallet.openConnectWallet();
  }

  function disconnectWallet() {
    const currentWallet = activeWalletRef.current;

    activeWalletRef.current = null;
    resetWalletConnectionState();
    setCasinoLoadError("");
    setPredictionLoadError("");
    setCasinoState(EMPTY_CASINO_STATE);
    setPredictionState(EMPTY_PREDICTION_STATE);
    pushStatus("Wallet disconnected.", "info");

    Promise.resolve(currentWallet?.disconnect?.()).catch((error) => {
      logBackgroundWalletError("Wallet client could not be disconnected cleanly.", error);
    });

    void privyWallet.logout().catch((error) => {
      logBackgroundWalletError("Privy logout failed.", error);
    });
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
    if (!activeWalletRef.current) {
      pushStatus("Connect a wallet before sending transactions.", "warning");
      return;
    }

    pushStatus(`Preparing ${label.toLowerCase()} on ${CASFIN_CONFIG.chainName}.`, "info");

    try {
      const walletSnapshot = await refreshWalletState({ loadProtocol: false });

      if (!walletSnapshot.account) {
        throw new Error("No wallet account is connected.");
      }

      const networkSnapshot =
        walletSnapshot.chainId === CASFIN_CONFIG.chainId ? walletSnapshot : await ensureTargetNetwork();
      const nextAccount = networkSnapshot.account || walletSnapshot.account;
      const provider = activeProviderRef.current || (await getActiveWalletProvider());

      if (!provider) {
        throw new Error("No wallet provider is available for this transaction.");
      }

      await ensureWalletNetworkConfig(provider);
      await ensureWalletBalance(provider, nextAccount);
      await ensureEncryptedSession(nextAccount);

      setPendingAction(label);
      pushStatus(`${label} is ready. Approve it in your wallet when prompted.`, "info");
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

    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!privyWallet.configured || !walletConnectorReady) {
      if (!privyWallet.configured) {
        resetWalletConnectionState();
      }
      return;
    }

    let disposed = false;

    async function boot() {
      const snapshot = await syncWallet();

      if (!disposed) {
        await loadProtocolState(snapshot.account);
      }
    }

    boot().catch((error) => {
      logBackgroundWalletError("Wallet boot failed.", error);
    });

    return () => {
      disposed = true;
    };
  }, [walletConnectorReady, privyWallet.configured, privyWallet.wallet?.address, privyWallet.wallet?.chainId]);

  useEffect(() => {
    if (!walletConnectorReady && !privyWallet.wallet) {
      return;
    }

    if (walletConnectorReady && !privyWallet.wallet && (account || chainId !== null)) {
      resetWalletConnectionState();
      loadProtocolState("").catch((error) => {
        logBackgroundWalletError("Failed to refresh read-only protocol state after disconnect.", error);
      });
    }
  }, [account, chainId, walletConnectorReady, privyWallet.wallet]);

  useEffect(() => {
    if (!cofheReady) {
      return;
    }

    if (!account || chainId !== CASFIN_CONFIG.chainId || !activeWalletRef.current) {
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
