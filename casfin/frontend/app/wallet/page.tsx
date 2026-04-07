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
      {/* ── Balance hero ── */}
      <GlassCard className="wallet-hero" stagger={1}>
        <p className="wallet-balance-label">Your Balance</p>
        <h1 className="wallet-balance-value">{availableBalanceLabel}</h1>
        <p className="wallet-balance-subtitle">
          Locked: {lockedBalanceLabel}
          {isConnected ? ` · ${formatAddress(account)}` : " · Connect wallet to begin"}
        </p>

        <div className="wallet-hero-actions" style={{ marginTop: "1.5rem", display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}>
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
          <p>{casinoLoadError}</p>
        </GlassCard>
      ) : null}

      {/* ── Main layout ── */}
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

            <div style={{ marginTop: "1rem" }}>
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
