"use client";

import { useState } from "react";
import { ethers } from "ethers";
import GlassButton from "@/components/GlassButton";
import GlassCard from "@/components/GlassCard";
import GlassInput from "@/components/GlassInput";
import { MARKET_RESOLVER_ABI, PREDICTION_MARKET_ABI } from "@/lib/casfin-abis";
import {
  formatAddress,
  formatDate,
  formatEth,
  formatShares,
  getMarketPhase,
  parseRequiredEth,
  parseRequiredInteger
} from "@/lib/casfin-client";
import { useCofhe } from "@/lib/cofhe-provider";

const OUTCOME_COLORS = ["#00d4ff", "#ffd700", "#00e68a", "#ff7c43", "#ff4d6a"];

function getOutcomeShare(totalShares, index) {
  const total = totalShares.reduce((sum, current) => sum + current, 0n);

  if (total === 0n) {
    return 0;
  }

  return Number((totalShares[index] * 10_000n) / total) / 100;
}

function getPhaseClass(phase) {
  if (phase === "Open") {
    return "phase-open";
  }

  if (phase === "Awaiting Resolution") {
    return "phase-warning";
  }

  if (phase === "Resolved") {
    return "phase-gold";
  }

  if (phase === "Finalized") {
    return "phase-success";
  }

  return "phase-muted";
}

export default function MarketCard({
  account,
  market,
  marketForm,
  pendingAction,
  runTransaction,
  stagger = 0,
  updateMarketForm,
  walletBlocked
}) {
  const [activeTab, setActiveTab] = useState("buy");
  const { encryptUint128, connected: cofheConnected } = useCofhe();
  const phase = getMarketPhase(market);
  const canResolveManually =
    Boolean(account) && market.resolver.manualResolver.toLowerCase() === account.toLowerCase();

  return (
    <GlassCard
      action={<span className={`phase-badge ${getPhaseClass(phase)}`}>{phase}</span>}
      className="market-card"
      description={market.description}
      eyebrow="Market"
      stagger={stagger}
      title={market.question}
    >
      <div className="market-meta-grid">
        <div className="info-pair">
          <span>Creator</span>
          <strong>{formatAddress(market.creator)}</strong>
        </div>
        <div className="info-pair">
          <span>Resolver</span>
          <strong>{formatAddress(market.resolver.manualResolver)}</strong>
        </div>
        <div className="info-pair">
          <span>Resolve Time</span>
          <strong>{formatDate(market.resolvesAt)}</strong>
        </div>
        <div className="info-pair">
          <span>Collateral Pool</span>
          <strong>{formatEth(market.collateralPool)} ETH</strong>
        </div>
        <div className="info-pair">
          <span>Your LP Balance</span>
          <strong>{formatShares(market.poolBalance)} LP</strong>
        </div>
        <div className="info-pair">
          <span>Claim Status</span>
          <strong>{market.hasClaimed ? "Claimed" : "Open"}</strong>
        </div>
      </div>

      <div className="outcome-stack">
        {market.outcomeLabels.map((label, index) => {
          const outcomeShare = getOutcomeShare(market.totalShares, index);
          const isWinningOutcome = market.resolved && market.winningOutcome === index;

          return (
            <div className="outcome-row" key={`${market.address}-${label}`}>
              <div className="outcome-row-head">
                <span>{label}</span>
                <strong>{outcomeShare.toFixed(1)}%</strong>
              </div>
              <div className="outcome-bar">
                <span
                  className="outcome-bar-fill"
                  style={{
                    width: `${Math.max(outcomeShare, outcomeShare > 0 ? 8 : 0)}%`,
                    "--outcome-color": OUTCOME_COLORS[index % OUTCOME_COLORS.length]
                  } as React.CSSProperties}
                />
              </div>
              <p className="outcome-copy">
                {formatShares(market.totalShares[index])} total shares • You hold{" "}
                {formatShares(market.userShares[index] || 0n)}
                {isWinningOutcome ? " • winning outcome" : ""}
              </p>
            </div>
          );
        })}
      </div>

      <div className="pill-grid market-tabs">
        <GlassButton active={activeTab === "buy"} onClick={() => setActiveTab("buy")} variant="pill">
          Buy
        </GlassButton>
        <GlassButton active={activeTab === "sell"} onClick={() => setActiveTab("sell")} variant="pill">
          Sell
        </GlassButton>
        <GlassButton active={activeTab === "resolve"} onClick={() => setActiveTab("resolve")} variant="pill">
          Resolve
        </GlassButton>
      </div>

      {activeTab === "buy" ? (
        <div className="market-tab-panel">
          <div className="field-grid-two">
            <GlassInput
              as="select"
              label="Outcome"
              onChange={(event) => updateMarketForm(market.address, { buyOutcome: event.target.value })}
              value={marketForm.buyOutcome}
            >
              {market.outcomeLabels.map((label, index) => (
                <option key={`${market.address}-buy-${label}`} value={String(index)}>
                  {label}
                </option>
              ))}
            </GlassInput>

            <GlassInput
              label="Amount"
              min="0"
              onChange={(event) => updateMarketForm(market.address, { buyAmount: event.target.value })}
              step="0.01"
              type="number"
              value={marketForm.buyAmount}
            />
          </div>

          <GlassInput
            hint="Leave empty to use a 2% slippage buffer from the current AMM preview."
            label="Min Shares Out"
            min="0"
            onChange={(event) => updateMarketForm(market.address, { buyMinSharesOut: event.target.value })}
            placeholder="Optional"
            step="0.0001"
            type="number"
            value={marketForm.buyMinSharesOut}
          />

          <GlassButton
            disabled={walletBlocked || market.resolved || !cofheConnected}
            loading={pendingAction === "Buy market shares"}
            onClick={() =>
              runTransaction("Buy market shares", async (signer) => {
                const predictionMarket = new ethers.Contract(market.address, PREDICTION_MARKET_ABI, signer);
                const outcomeIndex = parseRequiredInteger(marketForm.buyOutcome, "Outcome");
                const collateralIn = parseRequiredEth(marketForm.buyAmount, "Buy amount");
                const encAmount = await encryptUint128(collateralIn);

                return predictionMarket.buyShares(outcomeIndex, encAmount, {
                  value: collateralIn,
                  gasLimit: 1_500_000n
                });
              })
            }
          >
            Buy Shares
          </GlassButton>
        </div>
      ) : null}

      {activeTab === "sell" ? (
        <div className="market-tab-panel">
          <p className="info-note">
            Shares cannot be sold before market resolution. After the market is finalized, use
            {" "}<strong>Request Claim</strong> and <strong>Finalize Claim</strong> in the Resolve tab to redeem your winnings.
          </p>
        </div>
      ) : null}

      {activeTab === "resolve" ? (
        <div className="market-tab-panel">
          <GlassInput
            as="select"
            label="Winning Outcome"
            onChange={(event) => updateMarketForm(market.address, { resolveOutcome: event.target.value })}
            value={marketForm.resolveOutcome}
          >
            {market.outcomeLabels.map((label, index) => (
              <option key={`${market.address}-resolve-${label}`} value={String(index)}>
                {label}
              </option>
            ))}
          </GlassInput>

          <div className="action-stack">
            <GlassButton
              disabled={walletBlocked || market.resolved}
              loading={pendingAction === "Request market resolution"}
              onClick={() =>
                runTransaction("Request market resolution", async (signer) => {
                  const resolver = new ethers.Contract(market.resolver.address, MARKET_RESOLVER_ABI, signer);
                  return resolver.requestResolution();
                })
              }
              variant="secondary"
            >
              Request Resolution
            </GlassButton>

            <GlassButton
              disabled={walletBlocked || !canResolveManually || market.resolved}
              loading={pendingAction === "Resolve market manually"}
              onClick={() =>
                runTransaction("Resolve market manually", async (signer) => {
                  const resolver = new ethers.Contract(market.resolver.address, MARKET_RESOLVER_ABI, signer);
                  return resolver.resolveManual(parseRequiredInteger(marketForm.resolveOutcome, "Outcome"));
                })
              }
            >
              Resolve Manually
            </GlassButton>

            <GlassButton
              disabled={walletBlocked || !market.resolved || market.finalized}
              loading={pendingAction === "Finalize market"}
              onClick={() =>
                runTransaction("Finalize market", async (signer) => {
                  const predictionMarket = new ethers.Contract(market.address, PREDICTION_MARKET_ABI, signer);
                  return predictionMarket.finalizeMarket();
                })
              }
              variant="secondary"
            >
              Finalize
            </GlassButton>

            <GlassButton
              disabled={walletBlocked || !market.finalized}
              loading={pendingAction === "Request claim"}
              onClick={() =>
                runTransaction("Request claim", async (signer) => {
                  const predictionMarket = new ethers.Contract(market.address, PREDICTION_MARKET_ABI, signer);
                  return predictionMarket.requestClaim();
                })
              }
            >
              Request Claim
            </GlassButton>

            <GlassButton
              disabled={walletBlocked || !market.finalized}
              loading={pendingAction === "Finalize claim"}
              onClick={() =>
                runTransaction("Finalize claim", async (signer) => {
                  const predictionMarket = new ethers.Contract(market.address, PREDICTION_MARKET_ABI, signer);
                  return predictionMarket.finalizeClaim();
                })
              }
              variant="secondary"
            >
              Finalize Claim
            </GlassButton>
          </div>
        </div>
      ) : null}
    </GlassCard>
  );
}
