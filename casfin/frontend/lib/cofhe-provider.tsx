"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Encryptable, FheTypes } from "@cofhe/sdk";
import { Ethers6Adapter } from "@cofhe/sdk/adapters";
import { arbSepolia } from "@cofhe/sdk/chains";
import { createCofheClient, createCofheConfig } from "@cofhe/sdk/web";
import { ethers } from "ethers";
import { disableWorkerIfAvailable, initializeTfheRuntime, waitForCofheReady } from "@/lib/cofhe-runtime";
import { toEncryptedInputTuple, toEncryptedInputTuples } from "@/lib/cofhe-utils";

const ARBITRUM_SEPOLIA_CHAIN = arbSepolia;

const CofheContext = createContext(null);

function toBigIntValue(value) {
  if (typeof value === "bigint") {
    return value;
  }

  if (typeof value === "number") {
    return BigInt(value);
  }

  return BigInt(String(value));
}

export function CofheProvider({ children }) {
  const clientRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [ready, setReady] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionInitializing, setSessionInitializing] = useState(false);
  const sessionReadyRef = useRef(false);
  const warmupPromiseRef = useRef<Promise<unknown> | null>(null);
  const connectPromiseRef = useRef<Promise<unknown> | null>(null);
  const connectedAccountRef = useRef("");

  useEffect(() => {
    sessionReadyRef.current = sessionReady;
  }, [sessionReady]);

  useEffect(() => {
    if (clientRef.current) {
      return;
    }

    try {
      const config = createCofheConfig({
        supportedChains: [ARBITRUM_SEPOLIA_CHAIN],
        useWorkers: true
      });

      clientRef.current = createCofheClient(config);
      setReady(true);
      initializeTfheRuntime().catch(() => {});
    } catch (error) {
      console.error("[CofheProvider] Failed to initialize CoFHE client.", error);
    }
  }, []);

  useEffect(() => {
    initializeTfheRuntime().catch((error) => {
      console.error("[CofheProvider] Failed to initialize TFHE runtime.", error);
    });
  }, []);

  const ensureSessionReady = useCallback(async () => {
    if (!clientRef.current) {
      throw new Error("CoFHE client not initialized.");
    }

    await waitForCofheReady(clientRef.current);

    if (sessionReadyRef.current) {
      return clientRef.current;
    }

    if (!warmupPromiseRef.current) {
      warmupPromiseRef.current = (async () => {
        const expectedAccount = connectedAccountRef.current;
        setSessionInitializing(true);
        await initializeTfheRuntime();

        await disableWorkerIfAvailable(clientRef.current.encryptInputs([Encryptable.bool(false)])).execute();

        if (clientRef.current?.connected && connectedAccountRef.current === expectedAccount) {
          setSessionReady(true);
        }

        return clientRef.current;
      })()
        .catch((error) => {
          setSessionReady(false);
          throw error;
        })
        .finally(() => {
          setSessionInitializing(false);
          warmupPromiseRef.current = null;
        });
    }

    await warmupPromiseRef.current;
    return clientRef.current;
  }, []);

  const scheduleSessionWarmup = useCallback(() => {
    window.setTimeout(() => {
      ensureSessionReady().catch(() => {
        // Warmup failed silently — the first encrypt call will retry.
      });
    }, 100);
  }, [ensureSessionReady]);

  const connect = useCallback(async (ethersProvider, ethersSigner) => {
    if (!clientRef.current) {
      throw new Error("CoFHE client not initialized.");
    }

    const nextAccount = await ethersSigner.getAddress();
    const currentAccount = connectedAccountRef.current;

    if (clientRef.current.connected && currentAccount && currentAccount.toLowerCase() === nextAccount.toLowerCase()) {
      setConnected(true);
      scheduleSessionWarmup();
      return clientRef.current;
    }

    if (!connectPromiseRef.current) {
      connectPromiseRef.current = (async () => {
        setSessionReady(false);
        const { publicClient, walletClient } = await Ethers6Adapter(ethersProvider, ethersSigner);
        await clientRef.current.connect(publicClient, walletClient);
        connectedAccountRef.current = nextAccount;
        setConnected(Boolean(clientRef.current.connected));
        scheduleSessionWarmup();
        return clientRef.current;
      })().finally(() => {
        connectPromiseRef.current = null;
      });
    }

    await connectPromiseRef.current;
    return clientRef.current;
  }, [scheduleSessionWarmup]);

  const disconnect = useCallback(() => {
    if (clientRef.current?.connected) {
      clientRef.current.disconnect();
    }

    connectedAccountRef.current = "";
    connectPromiseRef.current = null;
    setSessionReady(false);
    setSessionInitializing(false);
    setConnected(false);
  }, []);

  const encryptUint128 = useCallback(async (value) => {
    await ensureSessionReady();

    const [encrypted] = await disableWorkerIfAvailable(
      clientRef.current.encryptInputs([Encryptable.uint128(toBigIntValue(value))])
    ).execute();

    return toEncryptedInputTuple(encrypted);
  }, [ensureSessionReady]);

  const encryptUint8 = useCallback(async (value) => {
    await ensureSessionReady();

    const [encrypted] = await disableWorkerIfAvailable(
      clientRef.current.encryptInputs([Encryptable.uint8(toBigIntValue(value))])
    ).execute();

    return toEncryptedInputTuple(encrypted);
  }, [ensureSessionReady]);

  const encryptBool = useCallback(async (value) => {
    await ensureSessionReady();

    const [encrypted] = await disableWorkerIfAvailable(
      clientRef.current.encryptInputs([Encryptable.bool(Boolean(value))])
    ).execute();

    return toEncryptedInputTuple(encrypted);
  }, [ensureSessionReady]);

  const encryptMultiple = useCallback(async (encryptables) => {
    await ensureSessionReady();

    const encrypted = await disableWorkerIfAvailable(clientRef.current.encryptInputs(encryptables)).execute();
    return toEncryptedInputTuples(encrypted);
  }, [ensureSessionReady]);

  const decryptForView = useCallback(async (ctHash, fheType) => {
    if (!clientRef.current?.connected) {
      throw new Error("CoFHE not connected.");
    }

    await clientRef.current.permits.getOrCreateSelfPermit();
    return await clientRef.current.decryptForView(ctHash, fheType).execute();
  }, []);

  const contextValue = useMemo(
    () => ({
      client: clientRef.current,
      connected,
      ready,
      sessionReady,
      sessionInitializing,
      connect,
      ensureSessionReady,
      disconnect,
      encryptUint128,
      encryptUint8,
      encryptBool,
      encryptMultiple,
      decryptForView,
      Encryptable,
      FheTypes,
      ethers
    }),
    [
      connected,
      ready,
      sessionReady,
      sessionInitializing,
      connect,
      ensureSessionReady,
      disconnect,
      encryptUint128,
      encryptUint8,
      encryptBool,
      encryptMultiple,
      decryptForView
    ]
  );

  return <CofheContext.Provider value={contextValue}>{children}</CofheContext.Provider>;
}

export function useCofhe() {
  const context = useContext(CofheContext);

  if (!context) {
    throw new Error("useCofhe must be used within CofheProvider.");
  }

  return context;
}
