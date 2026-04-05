"use client";

import { useEffect } from "react";
import CoinFlipCard from "@/components/CoinFlipCard";
import CrashCard from "@/components/CrashCard";
import DiceCard from "@/components/DiceCard";
import GlassButton from "@/components/GlassButton";
import { useWallet } from "@/components/WalletProvider";
import { formatEth, formatMultiplier } from "@/lib/casfin-client";
import VaultCard from "@/components/VaultCard";
import { useState } from "react";

export default function CasinoPage() {
  const {
    account,
    casinoLoadError,
    casinoState,
    connectWallet,
    ensureTargetNetwork,
    isConnected,
    isCorrectChain,
    isOperator,
    loadProtocolState,
    pendingAction,
    runTransaction,
    walletBlocked
  } = useWallet();

  const [vaultForm, setVaultForm] = useState({
    depositAmount: "0.05",
    withdrawAmount: "0.01",
    bankrollAmount: "0.10"
  });
  const playerBalanceLabel = casinoState.isFhe ? "Encrypted" : `${formatEth(casinoState.playerBalance)} ETH`;

  function handleRefresh() {
    if (!isConnected) { connectWallet(); return; }
    if (!isCorrectChain) { ensureTargetNetwork(); return; }
    loadProtocolState(account);
  }

  return (
    <main className="casino-page">
      {/* Top stats bar */}
      <div className="casino-stats-bar">
        <div className="casino-stat">
          <span className="cstat-label">Vault TVL</span>
          <span className="cstat-value">{formatEth(casinoState.vaultBalance)} ETH</span>
        </div>
        <div className="casino-stat">
          <span className="cstat-label">Your Balance</span>
          <span className="cstat-value accent">{playerBalanceLabel}</span>
        </div>
        <div className="casino-stat">
          <span className="cstat-label">Crash Ceiling</span>
          <span className="cstat-value">{formatMultiplier(casinoState.crash.maxCashOutMultiplierBps)}</span>
        </div>
        <div className="casino-stat">
          <span className="cstat-label">VRF Status</span>
          <span className={`cstat-value ${casinoState.router.latestRequest?.fulfilled ? "text-success" : "text-muted"}`}>
            {casinoState.router.latestRequest ? (casinoState.router.latestRequest.fulfilled ? "Fulfilled" : "Pending") : "Idle"}
          </span>
        </div>
        <GlassButton disabled={Boolean(pendingAction)} onClick={handleRefresh} variant="secondary">
          {!isConnected ? "Connect" : !isCorrectChain ? "Switch Network" : "Refresh"}
        </GlassButton>
      </div>

      {casinoLoadError && (
        <div className="casino-error-bar">
          ⚠ {casinoLoadError}
        </div>
      )}

      {casinoState.isFhe && (
        <div className="casino-error-bar">
          Per-player casino balances and bet amounts are encrypted on-chain. This frontend can read handles and keeper status, but it cannot decrypt balances or submit encrypted bet payloads yet.
        </div>
      )}

      {/* Vault compact strip */}
      <div className="casino-vault-strip">
        <VaultCard
          casinoState={casinoState}
          isOperator={isOperator}
          pendingAction={pendingAction}
          runTransaction={runTransaction}
          setVaultForm={setVaultForm}
          vaultForm={vaultForm}
          walletBlocked={walletBlocked}
        />
      </div>

      {/* Game floor grid */}
      <div className="game-floor">
        <div className="game-floor-top">
          <CoinFlipCard
            casinoState={casinoState}
            pendingAction={pendingAction}
            runTransaction={runTransaction}
            walletBlocked={walletBlocked}
          />
          <DiceCard
            casinoState={casinoState}
            pendingAction={pendingAction}
            runTransaction={runTransaction}
            walletBlocked={walletBlocked}
          />
        </div>
        <div className="game-floor-bottom">
          <CrashCard
            casinoState={casinoState}
            isOperator={isOperator}
            pendingAction={pendingAction}
            runTransaction={runTransaction}
            walletBlocked={walletBlocked}
          />
        </div>
      </div>
    </main>
  );
}
