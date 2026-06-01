"use client";

import { useEffect, useState } from "react";
import { ethers } from "ethers";
import GlassButton from "@/components/GlassButton";
import GlassCard from "@/components/GlassCard";
import VaultCard from "@/components/VaultCard";
import UserProfileCard from "@/components/UserProfileCard";
import { useWallet } from "@/components/WalletProvider";
import { buildExplorerUrl, CASFIN_CONFIG } from "@/lib/casfin-config";
import { formatAddress, formatEth } from "@/lib/casfin-client";
import { useCofhe } from "@/lib/cofhe-provider";

function isZeroHandle(handle) {
  if (!handle) {
    return true;
  }

  try {
    return ethers.toBigInt(handle) === 0n;
  } catch {
    return false;
  }
}

export default function WalletPage() {
  const {
    account,
    casinoState,
    chainId,
    casinoLoadError,
    connectWallet,
    ensureTargetNetwork,
    isConnected,
    isCorrectChain,
    isOperator,
    lastTransaction,
    pendingAction,
    refreshUserProfile,
    refreshWalletState,
    runTransaction,
    statusMessage,
    userProfile,
    walletBalance,
    walletBlocked
  } = useWallet();
  const { decryptForView, FheTypes, connected: cofheConnected } = useCofhe();

  const [vaultForm, setVaultForm] = useState({
    depositAmount: "0.05",
    withdrawAmount: "0.01",
    bankrollAmount: "0.10"
  });
  const [decryptedBalance, setDecryptedBalance] = useState(null);
  const [decryptedLockedBalance, setDecryptedLockedBalance] = useState(null);
  const [balanceDecryptionFailed, setBalanceDecryptionFailed] = useState(false);

  const availableBalanceLabel = casinoState.isFhe
    ? decryptedBalance !== null
      ? `${ethers.formatEther(decryptedBalance)} ETH`
      : cofheConnected && casinoState.playerBalanceHandle
        ? balanceDecryptionFailed
          ? "Encrypted"
          : "Decrypting..."
        : "Encrypted"
    : `${formatEth(casinoState.playerBalance)} ETH`;
  const lockedBalanceLabel = casinoState.isFhe
    ? decryptedLockedBalance !== null
      ? `${ethers.formatEther(decryptedLockedBalance)} ETH`
      : "Encrypted"
    : `${formatEth(casinoState.playerLockedBalance)} ETH`;

  useEffect(() => {
    let cancelled = false;

    async function loadDecryptedBalances() {
      if (!casinoState.isFhe || !cofheConnected) {
        if (!cancelled) {
          setDecryptedBalance(null);
          setDecryptedLockedBalance(null);
          setBalanceDecryptionFailed(false);
        }
        return;
      }

      if (isZeroHandle(casinoState.playerBalanceHandle)) {
        if (!cancelled) {
          setDecryptedBalance(0n);
          setDecryptedLockedBalance(isZeroHandle(casinoState.playerLockedBalanceHandle) ? 0n : null);
          setBalanceDecryptionFailed(false);
        }
        return;
      }

      try {
        const [balance, lockedBalance] = await Promise.all([
          decryptForView(casinoState.playerBalanceHandle, FheTypes.Uint128),
          isZeroHandle(casinoState.playerLockedBalanceHandle)
            ? Promise.resolve(0n)
            : decryptForView(casinoState.playerLockedBalanceHandle, FheTypes.Uint128)
        ]);

        if (!cancelled) {
          setDecryptedBalance(balance);
          setDecryptedLockedBalance(lockedBalance);
          setBalanceDecryptionFailed(false);
        }
      } catch (error) {
        if (!cancelled) {
          setDecryptedBalance(null);
          setDecryptedLockedBalance(null);
          setBalanceDecryptionFailed(true);
        }

        console.warn("[WalletPage] Balance decryption failed.", error);
      }
    }

    loadDecryptedBalances();

    return () => {
      cancelled = true;
    };
  }, [
    casinoState.isFhe,
    casinoState.playerBalanceHandle,
    casinoState.playerLockedBalanceHandle,
    cofheConnected,
    decryptForView,
    FheTypes.Uint128
  ]);

  function handlePrimaryAction() {
    if (!isConnected) { void connectWallet(); return; }
    if (!isCorrectChain) {
      void ensureTargetNetwork().catch((e) => console.warn("[WalletPage]", e));
      return;
    }
    void refreshWalletState({ loadProtocol: true, requestAccounts: true }).catch((e) =>
      console.warn("[WalletPage]", e)
    );
  }

  return (
    <main className="page-shell is-narrow">
      <GlassCard className="wallet-hero" stagger={1}>
        <p className="wallet-balance-label">Your Balance</p>
        <h1 className="wallet-balance-value">{availableBalanceLabel}</h1>
        <p className="wallet-balance-subtitle">
          Locked: {lockedBalanceLabel}
          {isConnected ? ` - ${formatAddress(account)}` : " - Connect wallet to begin"}
        </p>

        <div className="wallet-hero-actions">
          <GlassButton disabled={Boolean(pendingAction)} onClick={handlePrimaryAction}>
            {!isConnected ? "Connect Wallet" : !isCorrectChain ? "Switch Network" : "Refresh Wallet"}
          </GlassButton>
          {lastTransaction?.hash ? (
            <a
              className="wallet-inline-link"
              href={buildExplorerUrl("tx", lastTransaction.hash)}
              rel="noreferrer"
              target="_blank"
            >
              View Last Transaction
            </a>
          ) : null}
        </div>
      </GlassCard>

      <UserProfileCard
        onProfileUpdated={(p) => void refreshUserProfile()}
        profile={userProfile}
        stagger={2}
      />

      {casinoLoadError ? (
        <GlassCard className="notice-card tone-danger" stagger={3}>
          <p>{casinoLoadError}</p>
        </GlassCard>
      ) : null}

      <div className="wallet-layout">
        <VaultCard
          casinoState={casinoState}
          className="wallet-main-card"
          isOperator={isOperator}
          large
          pendingAction={pendingAction}
          runTransaction={runTransaction}
          setVaultForm={setVaultForm}
          stagger={4}
          vaultForm={vaultForm}
          walletBlocked={walletBlocked}
        />

        <div className="wallet-side-column">
          <GlassCard eyebrow="Network" stagger={4} title="Connection">
            <div className="info-pairs">
              {[
                ["Account", isConnected ? formatAddress(account) : "Not connected"],
                ["Wallet ETH", isConnected ? `${formatEth(walletBalance)} ETH` : "0 ETH"],
                ["Chain", isConnected ? CASFIN_CONFIG.chainName : "Not connected"],
                ["Chain ID", chainId === null ? "None" : String(chainId)],
                ["Mode", isCorrectChain ? "Write Enabled" : "Read Only"]
              ].map(([label, value]) => (
                <div className="info-pair" key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>

            <div className="wallet-card-action">
              <GlassButton disabled={Boolean(pendingAction)} onClick={handlePrimaryAction} variant="secondary">
                {!isConnected ? "Connect" : !isCorrectChain ? "Switch Network" : "Refresh"}
              </GlassButton>
            </div>
          </GlassCard>

          <GlassCard eyebrow="History" stagger={5} title="Last Transaction">
            <div className="history-list">
              {[
                ["Status", statusMessage],
                ["Pending", pendingAction || "None"]
              ].map(([label, value]) => (
                <div className="history-row" key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
              <div className="history-row">
                <span>Last Tx</span>
                {lastTransaction?.hash ? (
                  <a href={buildExplorerUrl("tx", lastTransaction.hash)} rel="noreferrer" target="_blank">
                    {lastTransaction.label}
                  </a>
                ) : (
                  <strong>None</strong>
                )}
              </div>
            </div>
          </GlassCard>
        </div>
      </div>
    </main>
  );
}
