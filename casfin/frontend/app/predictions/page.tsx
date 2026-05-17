"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import GlassButton from "@/components/GlassButton";
import GlassCard from "@/components/GlassCard";
import GlassInput from "@/components/GlassInput";
import MarketCard from "@/components/MarketCard";
import PredictionFactory from "@/components/PredictionFactory";
import StatCard from "@/components/StatCard";
import { useWallet } from "@/components/WalletProvider";
import {
  formatBps,
  formatEth,
  getMarketPhase,
  toLocalDateTimeValue
} from "@/lib/casfin-client";
import { CASFIN_CONFIG } from "@/lib/casfin-config";

function compareBigIntDesc(left: bigint, right: bigint) {
  if (left === right) return 0;
  return left > right ? -1 : 1;
}

function compareBigIntAsc(left: bigint, right: bigint) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

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
  const [marketForms, setMarketForms] = useState<Record<string, any>>({});
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("volume");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    setCreateMarketForm((current) => {
      if (current.resolveAt) return current;
      return { ...current, resolveAt: toLocalDateTimeValue(48) };
    });
  }, []);

  function getMarketForm(address: string) {
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

  function updateMarketForm(address: string, patch: Record<string, string>) {
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
      void connectWallet();
      return;
    }

    if (!isCorrectChain) {
      void ensureTargetNetwork().catch((error) => console.warn("[PredictionsPage]", error));
      return;
    }

    void loadProtocolState(account).catch((error) => console.warn("[PredictionsPage]", error));
  }

  const allMarkets = predictionState.markets;
  const totalLiquidity = allMarkets.reduce((sum, market) => sum + market.collateralPool, 0n);
  const resolvingCount = allMarkets.filter((market) => getMarketPhase(market) === "Awaiting Resolution").length;
  const finalizedCount = allMarkets.filter((market) => market.finalized).length;

  const visibleMarkets = [...allMarkets]
    .filter((market) => {
      const phase = getMarketPhase(market);
      const matchesStatus = statusFilter === "all"
        || (statusFilter === "open" && phase === "Open")
        || (statusFilter === "resolving" && phase === "Awaiting Resolution")
        || (statusFilter === "resolved" && (phase === "Resolved" || phase === "Finalized"));

      const searchHaystack = `${market.question} ${market.description}`.toLowerCase();
      const matchesSearch = searchHaystack.includes(searchQuery.trim().toLowerCase());

      return matchesStatus && matchesSearch;
    })
    .sort((left, right) => {
      if (sortBy === "volume") {
        return compareBigIntDesc(left.collateralPool, right.collateralPool);
      }

      if (sortBy === "expiry") {
        return compareBigIntAsc(left.resolvesAt, right.resolvesAt);
      }

      return compareBigIntDesc(left.meta.createdAt, right.meta.createdAt);
    });

  return (
    <main className="page-shell">
      <section className="page-hero">
        <div className="hero-copy-cluster">
          <p className="hero-kicker">Prediction Markets</p>
          <h1>Filterable market discovery with creator tooling built in.</h1>
          <p className="hero-description">
            The market rail now separates creation, discovery, and trade execution. Creator access,
            fees, liquidity, and resolver state stay visible without burying the transaction controls.
          </p>
        </div>

        <div className="hero-actions-cluster">
          <GlassButton disabled={Boolean(pendingAction)} onClick={handlePageAction}>
            {!isConnected ? "Connect Wallet" : !isCorrectChain ? "Switch Network" : "Refresh Markets"}
          </GlassButton>
          <Link href="/predictions/sports">
            <GlassButton variant="secondary">Sports View</GlassButton>
          </Link>
        </div>
      </section>

      <section className="overview-grid">
        <StatCard detail="Markets currently loaded from the protocol state." label="Live Markets" value={String(predictionState.totalMarkets)} />
        <StatCard detail="Direct factory deployment rights for this connected wallet." label="Creator Access" value={predictionState.approvedCreator ? "Approved" : "Restricted"} />
        <StatCard detail="Combined collateral pool across visible markets." label="Liquidity" value={`${formatEth(totalLiquidity)} ETH`} />
        <StatCard detail={`${finalizedCount} finalized market(s) on this rail.`} label="Awaiting Resolution" value={String(resolvingCount)} />
      </section>

      <section className="prediction-filter-grid">
        <GlassCard className="prediction-filter-card">
          <GlassInput
            label="Search"
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Question or description"
            type="text"
            value={searchQuery}
          />
        </GlassCard>

        <GlassCard className="prediction-filter-card">
          <GlassInput
            as="select"
            label="Status"
            onChange={(event) => setStatusFilter(event.target.value)}
            value={statusFilter}
          >
            <option value="all">All markets</option>
            <option value="open">Open</option>
            <option value="resolving">Awaiting resolution</option>
            <option value="resolved">Resolved or finalized</option>
          </GlassInput>
        </GlassCard>

        <GlassCard className="prediction-filter-card">
          <GlassInput
            as="select"
            label="Sort"
            onChange={(event) => setSortBy(event.target.value)}
            value={sortBy}
          >
            <option value="volume">Highest liquidity</option>
            <option value="expiry">Earliest expiry</option>
            <option value="created">Newest first</option>
          </GlassInput>
        </GlassCard>

        <GlassCard className="prediction-filter-card">
          <p className="glass-field-label">Fee route</p>
          <div className="bet-feed-list">
            <div className="bet-feed-row">
              <strong>Platform fee</strong>
              <span>{formatBps(predictionState.feeConfig.platformFeeBps)}</span>
            </div>
            <div className="bet-feed-row">
              <strong>LP fee</strong>
              <span>{formatBps(predictionState.feeConfig.lpFeeBps)}</span>
            </div>
          </div>
        </GlassCard>
      </section>

      {predictionLoadError ? (
        <GlassCard className="notice-card">
          <p>{predictionLoadError}</p>
        </GlassCard>
      ) : null}

      <div className="prediction-layout">
        <section className="prediction-panel-stack">
          <PredictionFactory
            createMarketForm={createMarketForm}
            pendingAction={pendingAction}
            predictionState={predictionState}
            runTransaction={runTransaction}
            setCreateMarketForm={setCreateMarketForm}
            stagger={1}
            walletBlocked={walletBlocked}
          />

          <GlassCard
            description="Search, status filters, and liquidity sorting apply directly to the live state already loaded in the wallet provider."
            eyebrow="Explorer"
            title="Market discovery"
          >
            <div className="bet-insight-grid">
              <div className="bet-insight-card">
                <span>Visible markets</span>
                <strong>{visibleMarkets.length}</strong>
              </div>
              <div className="bet-insight-card">
                <span>Search query</span>
                <strong>{searchQuery.trim() || "None"}</strong>
              </div>
              <div className="bet-insight-card">
                <span>Status filter</span>
                <strong>{statusFilter === "all" ? "All markets" : statusFilter}</strong>
              </div>
            </div>
          </GlassCard>
        </section>

        <section className="prediction-market-grid">
          {visibleMarkets.length === 0 ? (
            <GlassCard
              className="empty-state"
              description="Adjust the filters or create the first market from an approved wallet."
              eyebrow="No Results"
              title="No markets match the current view"
            />
          ) : null}

          {visibleMarkets.map((market, index) => (
            <MarketCard
              account={account}
              key={market.address}
              market={market}
              marketForm={getMarketForm(market.address)}
              pendingAction={pendingAction}
              runTransaction={runTransaction}
              stagger={index + 2}
              updateMarketForm={updateMarketForm}
              walletBlocked={walletBlocked}
            />
          ))}
        </section>
      </div>
    </main>
  );
}
