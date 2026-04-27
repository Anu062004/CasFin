"use client";

import { ethers } from "ethers";
import GlassButton from "@/components/GlassButton";
import GlassCard from "@/components/GlassCard";
import GlassInput from "@/components/GlassInput";
import { MARKET_FACTORY_ABI } from "@/lib/casfin-abis";
import { CASFIN_CONFIG } from "@/lib/casfin-config";
import { EMPTY_ADDRESS, formatAddress, formatBps, parseRequiredEth, parseRequiredInteger } from "@/lib/casfin-client";

export default function PredictionFactory({
  createMarketForm,
  pendingAction,
  predictionState,
  runTransaction,
  setCreateMarketForm,
  stagger = 0,
  walletBlocked
}) {
  return (
    <GlassCard
      action={
        <span className={predictionState.approvedCreator ? "phase-badge phase-success" : "phase-badge phase-muted"}>
          {predictionState.approvedCreator ? "Creator Approved" : "Creator Restricted"}
        </span>
      }
      className="factory-card"
      description="Launch a market directly from the deployed factory with initial liquidity and dispute settings."
      eyebrow="Create Market"
      stagger={stagger}
      title="Manual market deployment"
    >
      <div className="mini-stat-grid">
        <div className="mini-stat">
          <span>Factory Owner</span>
          <strong>{formatAddress(predictionState.factoryOwner)}</strong>
        </div>
        <div className="mini-stat">
          <span>Platform Fee</span>
          <strong>{formatBps(predictionState.feeConfig.platformFeeBps)}</strong>
        </div>
        <div className="mini-stat">
          <span>LP Fee</span>
          <strong>{formatBps(predictionState.feeConfig.lpFeeBps)}</strong>
        </div>
      </div>

      <div className="factory-grid">
        <GlassInput
          label="Question"
          onChange={(event) => setCreateMarketForm((current) => ({ ...current, question: event.target.value }))}
          type="text"
          value={createMarketForm.question}
        />

        <GlassInput
          label="Initial Liquidity"
          min="0"
          onChange={(event) => setCreateMarketForm((current) => ({ ...current, initialLiquidity: event.target.value }))}
          step="0.01"
          type="number"
          value={createMarketForm.initialLiquidity}
        />

        <GlassInput
          as="textarea"
          className="full-span"
          label="Description"
          onChange={(event) => setCreateMarketForm((current) => ({ ...current, description: event.target.value }))}
          rows="4"
          value={createMarketForm.description}
        />

        <GlassInput
          label="Outcomes"
          onChange={(event) => setCreateMarketForm((current) => ({ ...current, outcomes: event.target.value }))}
          placeholder="Yes, No"
          type="text"
          value={createMarketForm.outcomes}
        />

        <GlassInput
          label="Resolve Time"
          onChange={(event) => setCreateMarketForm((current) => ({ ...current, resolveAt: event.target.value }))}
          type="datetime-local"
          value={createMarketForm.resolveAt}
        />

        <GlassInput
          label="Dispute Window (hours)"
          min="1"
          onChange={(event) =>
            setCreateMarketForm((current) => ({ ...current, disputeWindowHours: event.target.value }))
          }
          type="number"
          value={createMarketForm.disputeWindowHours}
        />
      </div>

      {!predictionState.approvedCreator && (
        <p className="subtle-copy" style={{ color: "var(--color-warning, #f59e0b)", marginBottom: "0.5rem" }}>
          Your wallet is not approved to create markets. Ask the factory owner to whitelist your address.
        </p>
      )}

      <div className="factory-footer">
        <p className="subtle-copy">
          {predictionState.approvedCreator
            ? "This wallet can create markets from the live factory."
            : ""}
        </p>

        <GlassButton
          disabled={walletBlocked || !predictionState.approvedCreator}
          loading={pendingAction === "Create market"}
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
              if (resolvesAt <= Math.floor(Date.now() / 1000) + 3600) {
                throw new Error("Resolve time must be at least 1 hour from now.");
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
          Create Market
        </GlassButton>
      </div>
    </GlassCard>
  );
}
