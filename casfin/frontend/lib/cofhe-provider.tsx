"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Encryptable, FheTypes } from "@cofhe/sdk";
import { Ethers6Adapter } from "@cofhe/sdk/adapters";
import { arbSepolia } from "@cofhe/sdk/chains";
import { createCofheClient, createCofheConfig } from "@cofhe/sdk/web";
import { ethers } from "ethers";
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

  useEffect(() => {
    if (clientRef.current) {
      return;
    }

    try {
      const config = createCofheConfig({
        supportedChains: [ARBITRUM_SEPOLIA_CHAIN]
      });

      clientRef.current = createCofheClient(config);
      setReady(true);
    } catch (error) {
      console.error("[CofheProvider] Failed to initialize CoFHE client.", error);
    }
  }, []);

  const connect = useCallback(async (ethersProvider, ethersSigner) => {
    if (!clientRef.current) {
      throw new Error("CoFHE client not initialized.");
    }

    const { publicClient, walletClient } = await Ethers6Adapter(ethersProvider, ethersSigner);
    await clientRef.current.connect(publicClient, walletClient);
    setConnected(true);
    return clientRef.current;
  }, []);

  const disconnect = useCallback(() => {
    if (clientRef.current?.connected) {
      clientRef.current.disconnect();
    }

    setConnected(false);
  }, []);

  const encryptUint128 = useCallback(async (value) => {
    if (!clientRef.current?.connected) {
      throw new Error("CoFHE not connected.");
    }

    const [encrypted] = await clientRef.current
      .encryptInputs([Encryptable.uint128(toBigIntValue(value))])
      .execute();

    return toEncryptedInputTuple(encrypted);
  }, []);

  const encryptUint8 = useCallback(async (value) => {
    if (!clientRef.current?.connected) {
      throw new Error("CoFHE not connected.");
    }

    const [encrypted] = await clientRef.current
      .encryptInputs([Encryptable.uint8(toBigIntValue(value))])
      .execute();

    return toEncryptedInputTuple(encrypted);
  }, []);

  const encryptBool = useCallback(async (value) => {
    if (!clientRef.current?.connected) {
      throw new Error("CoFHE not connected.");
    }

    const [encrypted] = await clientRef.current
      .encryptInputs([Encryptable.bool(Boolean(value))])
      .execute();

    return toEncryptedInputTuple(encrypted);
  }, []);

  const encryptMultiple = useCallback(async (encryptables) => {
    if (!clientRef.current?.connected) {
      throw new Error("CoFHE not connected.");
    }

    const encrypted = await clientRef.current.encryptInputs(encryptables).execute();
    return toEncryptedInputTuples(encrypted);
  }, []);

  const decryptForView = useCallback(async (ctHash, fheType) => {
    if (!clientRef.current?.connected) {
      throw new Error("CoFHE not connected.");
    }

    await clientRef.current.permits.getOrCreateSelfPermit();
    return clientRef.current.decryptForView(ctHash, fheType).execute();
  }, []);

  const contextValue = useMemo(
    () => ({
      client: clientRef.current,
      connected,
      ready,
      connect,
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
    [connected, ready, connect, disconnect, encryptUint128, encryptUint8, encryptBool, encryptMultiple, decryptForView]
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
