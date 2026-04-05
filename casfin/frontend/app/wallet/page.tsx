"use client";

import { useState } from "react";
import GlassButton from "@/components/GlassButton";
import GlassCard from "@/components/GlassCard";
import VaultCard from "@/components/VaultCard";
import { useWallet } from "@/components/WalletProvider";
import { buildExplorerUrl, CASFIN_CONFIG } from "@/lib/casfin-config";
import { formatAddress, formatEth } from "@/lib/casfin-client";

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
    refreshWalletState,
    runTransaction,
    statusMessage,
    walletBalance,
    walletBlocked
  } = useWallet();

  const [vaultForm, setVaultForm] = useState({
    depositAmount: "0.05",
    withdrawAmount: "0.01",
    bankrollAmount: "0.10"
  });
  const availableBalanceLabel = casinoState.isFhe ? "Encrypted" : `${formatEth(casinoState.playerBalance)} ETH`;
  const lockedBalanceLabel = casinoState.isFhe ? "Encrypted" : `${formatEth(casinoState.playerLockedBalance)} ETH`;

  function handlePrimaryAction() {
    if (!isConnected) {
      connectWallet();
      return;
    }

    if (!isCorrectChain) {
      ensureTargetNetwork();
      return;
    }

    refreshWalletState({ loadProtocol: true, requestAccounts: true });
  }

  return (
    <main className="page-shell is-narrow">
      <GlassCard className="wallet-hero" stagger={1}>
        <p className="wallet-balance-label">Your Balance</p>
        <h1 className="wallet-balance-value">{availableBalanceLabel}</h1>
        <p className="wallet-balance-subtitle">
          Locked balance: {lockedBalanceLabel}
          {isConnected ? ` • ${formatAddress(account)}` : " • Connect a wallet to unlock live transactions"}
        </p>
        {casinoState.isFhe ? (
          <p className="wallet-balance-subtitle">This encrypted vault exposes per-player balance handles, not plaintext ETH values, to the frontend.</p>
        ) : null}
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

      {casinoLoadError ? (
        <GlassCard className="notice-card tone-danger" stagger={2}>
          <p>Unable to refresh wallet data: {casinoLoadError}</p>
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
          stagger={3}
          vaultForm={vaultForm}
          walletBlocked={walletBlocked}
        />

        <div className="wallet-side-column">
          <GlassCard eyebrow="Network" stagger={4} title="Current connection">
            <div className="info-pairs">
              <div className="info-pair">
                <span>Account</span>
                <strong>{isConnected ? formatAddress(account) : "Not connected"}</strong>
              </div>
              <div className="info-pair">
                <span>Wallet ETH</span>
                <strong>{isConnected ? `${formatEth(walletBalance)} ETH` : "0 ETH"}</strong>
              </div>
              <div className="info-pair">
                <span>Chain</span>
                <strong>{isConnected ? CASFIN_CONFIG.chainName : "Not connected"}</strong>
              </div>
              <div className="info-pair">
                <span>Chain ID</span>
                <strong>{chainId === null ? "None" : String(chainId)}</strong>
              </div>
              <div className="info-pair">
                <span>Mode</span>
                <strong>{isCorrectChain ? "Write Enabled" : "Read Only"}</strong>
              </div>
            </div>

            <GlassButton disabled={Boolean(pendingAction)} onClick={handlePrimaryAction} variant="secondary">
              {!isConnected ? "Connect" : !isCorrectChain ? "Switch Network" : "Refresh"}
            </GlassButton>
          </GlassCard>

          <GlassCard eyebrow="History" stagger={5} title="Latest transaction status">
            <div className="history-list">
              <div className="history-row">
                <span>Status</span>
                <strong>{statusMessage}</strong>
              </div>
              <div className="history-row">
                <span>Pending Action</span>
                <strong>{pendingAction || "None"}</strong>
              </div>
              <div className="history-row">
                <span>Last Tx</span>
                {lastTransaction?.hash ? (
                  <a href={buildExplorerUrl("tx", lastTransaction.hash)} rel="noreferrer" target="_blank">
                    {lastTransaction.label}
                  </a>
                ) : (
                  <strong>No transaction submitted yet</strong>
                )}
              </div>
            </div>
          </GlassCard>
        </div>
      </div>
    </main>
  );
}
