"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
      if (current.resolveAt) return current;
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
    if (!isConnected) { void connectWallet(); return; }
    if (!isCorrectChain) {
      void ensureTargetNetwork().catch((e) => console.warn("[PredictionsPage]", e));
      return;
    }
    void loadProtocolState(account).catch((e) => console.warn("[PredictionsPage]", e));
  }

  return (
    <main className="page-shell is-narrow">
      {/* ── Header ── */}
      <section className="page-header">
        <div>
          <p className="page-eyebrow">Markets</p>
          <h1 className="page-title">Predictions</h1>
        </div>

        <div className="page-actions">
          <GlassButton disabled={Boolean(pendingAction)} onClick={handlePageAction} variant="secondary">
            {!isConnected ? "Connect Wallet" : !isCorrectChain ? "Switch Network" : "Refresh"}
          </GlassButton>
        </div>
      </section>

      {/* ── Tab strip ── */}
      <div className="pill-grid" style={{ marginBottom: "8px" }}>
        <Link href="/predictions">
          <GlassButton active variant="pill">Markets</GlassButton>
        </Link>
        <Link href="/predictions/sports">
          <GlassButton variant="pill">Sports</GlassButton>
        </Link>
      </div>

      {predictionLoadError ? (
        <GlassCard className="notice-card tone-danger" stagger={1}>
          <p>{predictionLoadError}</p>
        </GlassCard>
      ) : null}

      {/* ── Stats ── */}
      <section className="stat-grid">
        <StatCard
          label="Live Markets"
          stagger={2}
          value={String(predictionState.totalMarkets)}
        />
        <StatCard
          label="Creator Access"
          stagger={3}
          value={predictionState.approvedCreator ? "Approved" : "Restricted"}
        />
        <StatCard
          label="Platform Fee"
          stagger={4}
          value={formatBps(predictionState.feeConfig.platformFeeBps)}
        />
        <StatCard
          label="LP Fee"
          stagger={5}
          value={formatBps(predictionState.feeConfig.lpFeeBps)}
        />
      </section>

      {/* ── Factory + markets ── */}
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
            eyebrow="No Live Markets"
            stagger={7}
            title="Waiting for first market"
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
