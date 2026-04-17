"use client";

import { ethers } from "ethers";
import { CASFIN_CONFIG } from "@/lib/casfin-config";
import {
  EMPTY_ADDRESS,
  formatAddress,
  formatBps,
  formatDate,
  formatEth,
  formatShares,
  getMarketPhase,
  parseRequiredEth,
  parseRequiredInteger,
  parseRequiredShares
} from "@/lib/casfin-client";
import { MARKET_FACTORY_ABI, MARKET_RESOLVER_ABI, PREDICTION_MARKET_ABI } from "@/lib/casfin-abis";
import { ActionButton, AddressLink } from "@/components/ProtocolBits";
import { useCofhe } from "@/lib/cofhe-provider";

export default function PredictionRail({
  account,
  createMarketForm,
  getMarketForm,
  pendingAction,
  predictionState,
  runTransaction,
  setCreateMarketForm,
  updateMarketForm,
  walletBlocked
}) {
  const { encryptUint128, connected: cofheConnected } = useCofhe();

  return (
    <div className="rail-grid">
      <section className="stack-column">
        <article className="panel-card">
          <div className="panel-head">
            <div>
              <p className="section-kicker">Factory</p>
              <h3>Live market factory with creator gating and fee routing.</h3>
            </div>
            <AddressLink address={CASFIN_CONFIG.addresses.marketFactory} label="Factory contract" />
          </div>

          <div className="info-grid">
            <div className="info-block">
              <span>Factory owner</span>
              <strong>{formatAddress(predictionState.factoryOwner)}</strong>
            </div>
            <div className="info-block">
              <span>Approved creator</span>
              <strong>{predictionState.approvedCreator ? "Yes" : "No"}</strong>
            </div>
            <div className="info-block">
              <span>Platform fee</span>
              <strong>{formatBps(predictionState.feeConfig.platformFeeBps)}</strong>
            </div>
            <div className="info-block">
              <span>LP fee</span>
              <strong>{formatBps(predictionState.feeConfig.lpFeeBps)}</strong>
            </div>
          </div>
        </article>

        <article className="panel-card">
          <div className="panel-head">
            <div>
              <p className="section-kicker">Create Market</p>
              <h3>Launch a manual market directly from the deployed factory.</h3>
            </div>
          </div>

          <div className="action-grid two-up">
            <label className="field-card">
              <span>Question</span>
              <input
                onChange={(event) => setCreateMarketForm((current) => ({ ...current, question: event.target.value }))}
                type="text"
                value={createMarketForm.question}
              />
            </label>

            <label className="field-card">
              <span>Initial liquidity in ETH</span>
              <input
                onChange={(event) =>
                  setCreateMarketForm((current) => ({ ...current, initialLiquidity: event.target.value }))
                }
                type="number"
                value={createMarketForm.initialLiquidity}
              />
            </label>

            <label className="field-card full-span">
              <span>Description</span>
              <textarea
                onChange={(event) =>
                  setCreateMarketForm((current) => ({ ...current, description: event.target.value }))
                }
                rows={4}
                value={createMarketForm.description}
              />
            </label>

            <label className="field-card">
              <span>Outcomes</span>
              <input
                onChange={(event) => setCreateMarketForm((current) => ({ ...current, outcomes: event.target.value }))}
                placeholder="Yes, No"
                type="text"
                value={createMarketForm.outcomes}
              />
            </label>

            <label className="field-card">
              <span>Resolve at</span>
              <input
                onChange={(event) => setCreateMarketForm((current) => ({ ...current, resolveAt: event.target.value }))}
                type="datetime-local"
                value={createMarketForm.resolveAt}
              />
            </label>

            <label className="field-card">
              <span>Dispute window in hours</span>
              <input
                onChange={(event) =>
                  setCreateMarketForm((current) => ({ ...current, disputeWindowHours: event.target.value }))
                }
                type="number"
                value={createMarketForm.disputeWindowHours}
              />
            </label>

            <label className="field-card">
              <span>Creator status</span>
              <p className="field-copy">
                {predictionState.approvedCreator
                  ? "This connected wallet can create markets from the live factory."
                  : "This wallet is not approved by the factory owner yet."}
              </p>
              <ActionButton
                disabled={walletBlocked || !predictionState.approvedCreator}
                onClick={() =>
                  runTransaction("Create market", async (signer) => {
                    const factory = new ethers.Contract(CASFIN_CONFIG.addresses.marketFactory, MARKET_FACTORY_ABI, signer);
                    const outcomeLabels = createMarketForm.outcomes
                      .split(",")
                      .map((item) => item.trim())
                      .filter(Boolean);

                    if (outcomeLabels.length < 2) {
                      throw new Error("At least two outcomes are required.");
                    }

                    const resolvesAt = Math.floor(new Date(createMarketForm.resolveAt).getTime() / 1000);
                    if (!Number.isFinite(resolvesAt) || resolvesAt <= 0) {
                      throw new Error("Choose a valid resolve time.");
                    }

                    const initialLiquidity = parseRequiredEth(createMarketForm.initialLiquidity, "Initial liquidity");

                    return factory.createMarket(
                      [
                        createMarketForm.question,
                        createMarketForm.description,
                        outcomeLabels,
                        resolvesAt,
                        BigInt(parseRequiredInteger(createMarketForm.disputeWindowHours, "Dispute window")) * 3600n,
                        0,                  // oracleType: Manual
                        EMPTY_ADDRESS,      // oracleAddress
                        "0x",               // oracleParams
                        initialLiquidity
                      ],
                      { value: initialLiquidity }
                    );
                  })
                }
              >
                {pendingAction === "Create market" ? "Creating..." : "Create market"}
              </ActionButton>
            </label>
          </div>
        </article>

        {predictionState.markets.length === 0 ? (
          <article className="panel-card empty-card">
            <p className="section-kicker">No Live Markets</p>
            <h3>The market rail is ready but still waiting for its first launch.</h3>
            <p>Create a manual market above from an approved wallet and the grid below will populate automatically.</p>
          </article>
        ) : null}

        {predictionState.markets.map((market) => {
          const marketForm = getMarketForm(market.address);
          const canResolveManually =
            Boolean(account) && market.resolver.manualResolver.toLowerCase() === account.toLowerCase();

          return (
            <article className="panel-card market-card" key={market.address}>
              <div className="panel-head">
                <div>
                  <p className="section-kicker">Market</p>
                  <h3>{market.question}</h3>
                  <p className="market-phase">{getMarketPhase(market)}</p>
                </div>
                <AddressLink address={market.address} label="Market contract" />
              </div>

              <p className="market-description">{market.description}</p>

              <div className="info-grid">
                <div className="info-block">
                  <span>Creator</span>
                  <strong>{formatAddress(market.creator)}</strong>
                </div>
                <div className="info-block">
                  <span>Resolver</span>
                  <strong>{formatAddress(market.resolver.manualResolver)}</strong>
                </div>
                <div className="info-block">
                  <span>Resolve time</span>
                  <strong>{formatDate(market.resolvesAt)}</strong>
                </div>
                <div className="info-block">
                  <span>Collateral pool</span>
                  <strong>{formatEth(market.collateralPool)} ETH</strong>
                </div>
                <div className="info-block">
                  <span>Your LP balance</span>
                  <strong>{formatShares(market.poolBalance)} LP</strong>
                </div>
              </div>

              <div className="outcome-grid">
                {market.outcomeLabels.map((label, index) => (
                  <div className="outcome-card" key={`${market.address}-${label}`}>
                    <span>{label}</span>
                    <strong>{formatShares(market.totalShares[index])} shares</strong>
                    <p>Your shares: {formatShares(market.userShares[index] || 0n)}</p>
                    {market.resolved && market.winningOutcome === index ? <em className="winner-pill">Winning outcome</em> : null}
                  </div>
                ))}
              </div>

              <div className="action-grid three-up">
                <label className="field-card">
                  <span>Buy shares</span>
                  <select
                    onChange={(event) => updateMarketForm(market.address, { buyOutcome: event.target.value })}
                    value={marketForm.buyOutcome}
                  >
                    {market.outcomeLabels.map((label, index) => (
                      <option key={`${market.address}-buy-${label}`} value={String(index)}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <input
                    onChange={(event) => updateMarketForm(market.address, { buyAmount: event.target.value })}
                    type="number"
                    value={marketForm.buyAmount}
                  />
                  <input
                    onChange={(event) => updateMarketForm(market.address, { buyMinSharesOut: event.target.value })}
                    placeholder="Optional min shares out"
                    type="number"
                    value={marketForm.buyMinSharesOut}
                  />
                  <p className="field-hint">Leave min shares blank to use a 2% buffer from the current AMM quote.</p>
                  <ActionButton
                    disabled={walletBlocked || market.resolved || !cofheConnected}
                    onClick={() =>
                      runTransaction("Buy market shares", async (signer) => {
                        const predictionMarket = new ethers.Contract(market.address, PREDICTION_MARKET_ABI, signer);
                        const outcomeIndex = parseRequiredInteger(marketForm.buyOutcome, "Outcome");
                        const collateralIn = parseRequiredEth(marketForm.buyAmount, "Buy amount");
                        const encAmount = await encryptUint128(collateralIn);

                        return predictionMarket.buyShares(outcomeIndex, encAmount, {
                          value: collateralIn
                        });
                      })
                    }
                  >
                    {pendingAction === "Buy market shares" ? "Buying..." : "Buy shares"}
                  </ActionButton>
                </label>

                <label className="field-card">
                  <span>Sell shares</span>
                  <select
                    onChange={(event) => updateMarketForm(market.address, { sellOutcome: event.target.value })}
                    value={marketForm.sellOutcome}
                  >
                    {market.outcomeLabels.map((label, index) => (
                      <option key={`${market.address}-sell-${label}`} value={String(index)}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <input
                    onChange={(event) => updateMarketForm(market.address, { sellShares: event.target.value })}
                    type="number"
                    value={marketForm.sellShares}
                  />
                  <p className="field-hint">Shares use 18 decimals, so values like 1.5 are valid.</p>
                  <ActionButton
                    disabled={walletBlocked || market.resolved || !cofheConnected}
                    onClick={() =>
                      runTransaction("Sell market shares", async (signer) => {
                        const predictionMarket = new ethers.Contract(market.address, PREDICTION_MARKET_ABI, signer);
                        const encShares = await encryptUint128(parseRequiredShares(marketForm.sellShares, "Shares"));
                        return predictionMarket.sell(
                          parseRequiredInteger(marketForm.sellOutcome, "Sell outcome"),
                          encShares
                        );
                      })
                    }
                    variant="secondary"
                  >
                    {pendingAction === "Sell market shares" ? "Selling..." : "Sell shares"}
                  </ActionButton>
                </label>

                <label className="field-card">
                  <span>Resolve and claim</span>
                  <select
                    onChange={(event) => updateMarketForm(market.address, { resolveOutcome: event.target.value })}
                    value={marketForm.resolveOutcome}
                  >
                    {market.outcomeLabels.map((label, index) => (
                      <option key={`${market.address}-resolve-${label}`} value={String(index)}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <div className="stacked-actions">
                    <ActionButton
                      disabled={walletBlocked || market.resolved}
                      onClick={() =>
                        runTransaction("Request market resolution", async (signer) => {
                          const resolver = new ethers.Contract(market.resolver.address, MARKET_RESOLVER_ABI, signer);
                          return resolver.requestResolution();
                        })
                      }
                      variant="secondary"
                    >
                      {pendingAction === "Request market resolution" ? "Requesting..." : "Request resolution"}
                    </ActionButton>
                    <ActionButton
                      disabled={walletBlocked || !canResolveManually || market.resolved}
                      onClick={() =>
                        runTransaction("Resolve market manually", async (signer) => {
                          const resolver = new ethers.Contract(market.resolver.address, MARKET_RESOLVER_ABI, signer);
                          return resolver.resolveManual(parseRequiredInteger(marketForm.resolveOutcome, "Outcome"));
                        })
                      }
                    >
                      {pendingAction === "Resolve market manually" ? "Resolving..." : "Resolve manually"}
                    </ActionButton>
                    <ActionButton
                      disabled={walletBlocked || !market.resolved || market.finalized}
                      onClick={() =>
                        runTransaction("Finalize market", async (signer) => {
                          const predictionMarket = new ethers.Contract(market.address, PREDICTION_MARKET_ABI, signer);
                          return predictionMarket.finalizeMarket();
                        })
                      }
                      variant="secondary"
                    >
                      {pendingAction === "Finalize market" ? "Finalizing..." : "Finalize"}
                    </ActionButton>
                    <ActionButton
                      disabled={walletBlocked || !market.finalized}
                      onClick={() =>
                        runTransaction("Request claim", async (signer) => {
                          const predictionMarket = new ethers.Contract(market.address, PREDICTION_MARKET_ABI, signer);
                          return predictionMarket.requestClaim();
                        })
                      }
                    >
                      {pendingAction === "Request claim" ? "Requesting..." : "Request Claim"}
                    </ActionButton>
                    <ActionButton
                      disabled={walletBlocked || !market.finalized}
                      onClick={() =>
                        runTransaction("Finalize claim", async (signer) => {
                          const predictionMarket = new ethers.Contract(market.address, PREDICTION_MARKET_ABI, signer);
                          return predictionMarket.finalizeClaim();
                        })
                      }
                      variant="secondary"
                    >
                      {pendingAction === "Finalize claim" ? "Finalizing..." : "Finalize Claim"}
                    </ActionButton>
                  </div>
                </label>
              </div>
            </article>
          );
        })}
      </section>

      <aside className="stack-column sidebar-column">
        <article className="panel-card">
          <div className="panel-head">
            <div>
              <p className="section-kicker">Flow</p>
              <h3>Prediction rail in five steps.</h3>
            </div>
          </div>

          <div className="timeline-list">
            <div className="timeline-step">
              <span>01</span>
              <p>Create a market from an approved creator wallet and seed its first liquidity.</p>
            </div>
            <div className="timeline-step">
              <span>02</span>
              <p>Buy shares with slippage protection, or sell directly before the market expires.</p>
            </div>
            <div className="timeline-step">
              <span>03</span>
              <p>After the resolve time, request resolution or resolve manually from the market resolver.</p>
            </div>
            <div className="timeline-step">
              <span>04</span>
              <p>Finalize the market after the dispute window closes.</p>
            </div>
            <div className="timeline-step">
              <span>05</span>
              <p>Claim winnings directly once the market is finalized.</p>
            </div>
          </div>
        </article>

        <article className="panel-card">
          <div className="panel-head">
            <div>
              <p className="section-kicker">Infrastructure</p>
              <h3>Prediction endpoints already deployed.</h3>
            </div>
          </div>

          <div className="console-list">
            <div className="console-row">
              <span>Factory</span>
              <AddressLink address={CASFIN_CONFIG.addresses.marketFactory} />
            </div>
            <div className="console-row">
              <span>Fee Distributor</span>
              <AddressLink address={CASFIN_CONFIG.addresses.feeDistributor} />
            </div>
            <div className="console-row">
              <span>Dispute Registry</span>
              <AddressLink address={CASFIN_CONFIG.addresses.disputeRegistry} />
            </div>
          </div>

          <div className="state-callout">
            <p>Current fee route</p>
            <span>
              Platform {formatBps(predictionState.feeConfig.platformFeeBps)}, LP{" "}
              {formatBps(predictionState.feeConfig.lpFeeBps)}, resolver{" "}
              {formatBps(predictionState.feeConfig.resolverFeeBps)}.
            </span>
          </div>
        </article>
      </aside>
    </div>
  );
}
