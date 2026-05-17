"use client";

import { useState } from "react";
import { buildExplorerUrl, CASFIN_CONFIG } from "@/lib/casfin-config";
import { formatAddress, formatEth, formatMultiplier } from "@/lib/casfin-client";
import { getCasinoGameMeta, type CasinoGameSlug } from "@/lib/casino-games";

const TABS = ["All Bets", "My Bets", "Players", "Analytics", "Game Details"] as const;

type TabName = (typeof TABS)[number];

function describeCoinBet(latestBet: any) {
  if (!latestBet) return "No coin toss bet submitted yet.";
  if (latestBet.resolved) return `Bet #${latestBet.id?.toString() ?? "0"} ${latestBet.won ? "won" : "lost"}.`;
  if (latestBet.resolutionPending) return `Bet #${latestBet.id?.toString() ?? "0"} is pending keeper finalization.`;
  return `Bet #${latestBet.id?.toString() ?? "0"} is waiting for resolution.`;
}

function describeDiceBet(latestBet: any) {
  if (!latestBet) return "No dice bet submitted yet.";
  if (latestBet.resolved) {
    const rolledCopy = latestBet.rolled ? ` Rolled ${latestBet.rolled}.` : "";
    return `Bet #${latestBet.id?.toString() ?? "0"} ${latestBet.won ? "won" : "lost"}.${rolledCopy}`;
  }
  if (latestBet.resolutionPending) return `Bet #${latestBet.id?.toString() ?? "0"} is pending keeper finalization.`;
  return `Bet #${latestBet.id?.toString() ?? "0"} is waiting for resolution.`;
}

function describeCrashRound(latestRound: any) {
  if (!latestRound) return "No crash round has been opened yet.";
  if (latestRound.closed) {
    return `Round #${latestRound.id?.toString() ?? "0"} closed at ${formatMultiplier(latestRound.crashMultiplierBps)}.`;
  }
  return `Round #${latestRound.id?.toString() ?? "0"} is live.`;
}

function describeActiveGame(game: CasinoGameSlug, casinoState: any) {
  if (game === "coin-toss") return describeCoinBet(casinoState.coin.latestBet);
  if (game === "dice") return describeDiceBet(casinoState.dice.latestBet);
  if (game === "crash") return describeCrashRound(casinoState.crash.latestRound);
  return "Encrypted poker hands move from deal to draw, then keeper resolution and final claim.";
}

interface Props {
  account: string;
  activeGame: CasinoGameSlug;
  casinoState: any;
  sessionAddress: string | null;
}

export default function BetHistoryTabs({ account, activeGame, casinoState, sessionAddress }: Props) {
  const [activeTab, setActiveTab] = useState<TabName>("All Bets");
  const meta = getCasinoGameMeta(activeGame);

  const allBets = [
    { label: "Coin Toss", value: describeCoinBet(casinoState.coin.latestBet) },
    { label: "Dice", value: describeDiceBet(casinoState.dice.latestBet) },
    { label: "Crash", value: describeCrashRound(casinoState.crash.latestRound) },
    { label: "Poker", value: "Encrypted poker uses deal, draw, and keeper resolution on the same player wallet." }
  ];

  const analyticsRows = [
    { label: "Vault TVL", value: `${formatEth(casinoState.vaultBalance)} ETH` },
    { label: "Player Balance", value: casinoState.isFhe ? "Encrypted" : `${formatEth(casinoState.playerBalance)} ETH` },
    { label: "Crash Ceiling", value: formatMultiplier(casinoState.crash.maxCashOutMultiplierBps) },
    { label: "Dice House Edge", value: `${(casinoState.dice.houseEdgeBps / 100).toFixed(2)}%` }
  ];

  return (
    <section className="bet-data-shell">
      <div className="bet-data-tab-row">
        {TABS.map((tab) => (
          <button
            className={`bet-data-tab ${tab === activeTab ? "is-active" : ""}`}
            key={tab}
            onClick={() => setActiveTab(tab)}
            type="button"
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="bet-data-panel">
        {activeTab === "All Bets" ? (
          <div className="bet-feed-list">
            {allBets.map((item) => (
              <div className="bet-feed-row" key={item.label}>
                <strong>{item.label}</strong>
                <span>{item.value}</span>
              </div>
            ))}
          </div>
        ) : null}

        {activeTab === "My Bets" ? (
          <div className="bet-insight-grid">
            <div className="bet-insight-card">
              <span>Connected wallet</span>
              <strong>{account ? formatAddress(account) : "Not connected"}</strong>
            </div>
            <div className="bet-insight-card">
              <span>Active game</span>
              <strong>{meta.label}</strong>
            </div>
            <div className="bet-insight-card full-span">
              <span>Latest activity</span>
              <strong>{describeActiveGame(activeGame, casinoState)}</strong>
            </div>
          </div>
        ) : null}

        {activeTab === "Players" ? (
          <div className="bet-insight-grid">
            <div className="bet-insight-card">
              <span>Player wallet</span>
              <strong>{account ? formatAddress(account) : "Not connected"}</strong>
            </div>
            <div className="bet-insight-card">
              <span>Operator</span>
              <strong>{formatAddress(CASFIN_CONFIG.operatorAddress)}</strong>
            </div>
            <div className="bet-insight-card">
              <span>Vault owner</span>
              <strong>{formatAddress(casinoState.vaultOwner)}</strong>
            </div>
            <div className="bet-insight-card">
              <span>Session key</span>
              <strong>{sessionAddress ? formatAddress(sessionAddress) : "Not active"}</strong>
            </div>
          </div>
        ) : null}

        {activeTab === "Analytics" ? (
          <div className="bet-insight-grid">
            {analyticsRows.map((item) => (
              <div className="bet-insight-card" key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        ) : null}

        {activeTab === "Game Details" ? (
          <div className="bet-feed-list">
            <div className="bet-feed-row">
              <strong>Game contract</strong>
              <a href={buildExplorerUrl("address", meta.contractAddress)} rel="noreferrer" target="_blank">
                {formatAddress(meta.contractAddress)}
              </a>
            </div>
            <div className="bet-feed-row">
              <strong>Settlement mode</strong>
              <span>Encrypted keeper resolution with on-chain finalization.</span>
            </div>
            <div className="bet-feed-row">
              <strong>Chain</strong>
              <span>{CASFIN_CONFIG.chainName}</span>
            </div>
            <div className="bet-feed-row">
              <strong>Randomness path</strong>
              <span>CasFin router, keeper flow, and contract-level final outcome verification.</span>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
