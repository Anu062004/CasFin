"use client";

import { useEffect, useState } from "react";
import GlassButton from "@/components/GlassButton";
import GlassCard from "@/components/GlassCard";
import MarketCard from "@/components/MarketCard";
import PredictionFactory from "@/components/PredictionFactory";
import StatCard from "@/components/StatCard";
import { useWallet } from "@/components/WalletProvider";
import { formatBps, toLocalDateTimeValue } from "@/lib/casfin-client";
import { CASFIN_CONFIG } from "@/lib/casfin-config";

export default function PredictionsPage() {
  const {
    account,
    connectWallet,
    ensureTargetNetwork,
    isConnected,
    isCorrectChain,
    loadProtocolState,
    pendingAction,
    predictionLoadError,
    predictionState,
    runTransaction,
    walletBlocked
  } = useWallet();

  const [createMarketForm, setCreateMarketForm] = useState({
    question: "Will ETH close above $4,000 this week?",
    description: "Manual test market deployed from the CasFin frontend on Arbitrum Sepolia.",
    outcomes: CASFIN_CONFIG.predictionDefaults.outcomes,
    resolveAt: "",
    disputeWindowHours: String(CASFIN_CONFIG.predictionDefaults.disputeWindowHours),
    initialLiquidity: CASFIN_CONFIG.predictionDefaults.initialLiquidity
  });
  const [marketForms, setMarketForms] = useState({});

  useEffect(() => {
    setCreateMarketForm((current) => {
      if (current.resolveAt) {
        return current;
      }

      return { ...current, resolveAt: toLocalDateTimeValue(48) };
    });
  }, []);

  function getMarketForm(address) {
    return (
      marketForms[address] || {
        buyOutcome: "0",
        buyAmount: "0.01",
        buyMinSharesOut: "",
        sellOutcome: "0",
        sellShares: "1",
        resolveOutcome: "0"
      }
    );
  }

  function updateMarketForm(address, patch) {
    setMarketForms((current) => ({
      ...current,
      [address]: {
        buyOutcome: "0",
        buyAmount: "0.01",
        buyMinSharesOut: "",
        sellOutcome: "0",
        sellShares: "1",
        resolveOutcome: "0",
        ...current[address],
        ...patch
      }
    }));
  }

  function handlePageAction() {
    if (!isConnected) {
      connectWallet();
      return;
    }

    if (!isCorrectChain) {
      ensureTargetNetwork();
      return;
    }

    loadProtocolState(account);
  }

  return (
    <main className="page-shell is-narrow">
      <section className="page-header">
        <div>
          <p className="page-eyebrow">Predictions</p>
          <h1 className="page-title">Trade outcome shares inside a cleaner market flow.</h1>
          <p className="page-subtitle">
            Launch markets, buy and sell positions with the live AMM preview, then move through resolution,
            finalization, and claim from a single centered layout.
          </p>
        </div>

        <div className="page-actions">
          <GlassButton disabled={Boolean(pendingAction)} onClick={handlePageAction} variant="secondary">
            {!isConnected ? "Connect Wallet" : !isCorrectChain ? "Switch Network" : "Refresh Live Data"}
          </GlassButton>
        </div>
      </section>

      {predictionLoadError ? (
        <GlassCard className="notice-card tone-danger" stagger={1}>
          <p>Unable to refresh prediction data: {predictionLoadError}</p>
        </GlassCard>
      ) : null}

      <section className="stat-grid">
        <StatCard
          detail="Markets are loaded from the deployed factory in reverse chronological order."
          label="Live Markets"
          stagger={2}
          value={String(predictionState.totalMarkets)}
        />
        <StatCard
          detail="Only approved creator wallets can submit new markets from the UI."
          label="Creator Access"
          stagger={3}
          value={predictionState.approvedCreator ? "Approved" : "Restricted"}
        />
        <StatCard
          detail="Factory-wide platform fee applied to live markets."
          label="Platform Fee"
          stagger={4}
          value={formatBps(predictionState.feeConfig.platformFeeBps)}
        />
        <StatCard
          detail="Liquidity provider fee used by the live market stack."
          label="LP Fee"
          stagger={5}
          value={formatBps(predictionState.feeConfig.lpFeeBps)}
        />
      </section>

      <div className="prediction-stack">
        <PredictionFactory
          createMarketForm={createMarketForm}
          pendingAction={pendingAction}
          predictionState={predictionState}
          runTransaction={runTransaction}
          setCreateMarketForm={setCreateMarketForm}
          stagger={6}
          walletBlocked={walletBlocked}
        />

        {predictionState.markets.length === 0 ? (
          <GlassCard
            className="empty-state"
            description="Create a market from an approved wallet and it will appear here automatically after the next refresh."
            eyebrow="No Live Markets"
            stagger={7}
            title="The predictions surface is ready for its first launch."
          />
        ) : null}

        {predictionState.markets.map((market, index) => (
          <MarketCard
            account={account}
            key={market.address}
            market={market}
            marketForm={getMarketForm(market.address)}
            pendingAction={pendingAction}
            runTransaction={runTransaction}
            stagger={index + 7}
            updateMarketForm={updateMarketForm}
            walletBlocked={walletBlocked}
          />
        ))}
      </div>
    </main>
  );
}
