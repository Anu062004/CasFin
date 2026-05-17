"use client";

import Link from "next/link";
import { useState } from "react";
import CleanPokerCard from "@/components/casino/CleanPokerCard";
import BetHistoryTabs from "@/components/casino/BetHistoryTabs";
import ProvablyFairBadge from "@/components/casino/ProvablyFairBadge";
import CoinFlipCard from "@/components/CoinFlipCard";
import CrashCard from "@/components/CrashCard";
import DiceCard from "@/components/DiceCard";
import GameTabs from "@/components/layout/GameTabs";
import { useWallet } from "@/components/WalletProvider";
import { formatEth, formatMultiplier } from "@/lib/casfin-client";
import { useCofhe } from "@/lib/cofhe-provider";
import { getCasinoGameMeta, type CasinoGameSlug } from "@/lib/casino-games";

const GAME_COMPONENTS = {
  "coin-toss": CoinFlipCard,
  "dice": DiceCard,
  "crash": CrashCard,
  "poker": CleanPokerCard
} as const;

interface Props {
  activeGame: CasinoGameSlug;
}

function getCanvasValue(activeGame: CasinoGameSlug, casinoState: any) {
  if (activeGame === "coin-toss") return "1.96x";
  if (activeGame === "dice") return "6.00x";
  if (activeGame === "crash") return formatMultiplier(casinoState.crash.maxCashOutMultiplierBps);
  return "250x";
}

function getCanvasLabel(activeGame: CasinoGameSlug, casinoState: any) {
  if (activeGame === "coin-toss") {
    return casinoState.coin.latestBet?.resolved ? "Last flip settled" : "Heads or tails";
  }
  if (activeGame === "dice") {
    return casinoState.dice.latestBet?.resolved ? "Last roll settled" : "Choose your face";
  }
  if (activeGame === "crash") {
    return casinoState.crash.latestRound?.closed ? "Latest crash closed" : "Live multiplier ceiling";
  }
  return "Draw and hold flow";
}

function getCanvasNarrative(activeGame: CasinoGameSlug, casinoState: any) {
  if (activeGame === "coin-toss") {
    if (!casinoState.coin.latestBet) return "Submit a binary wager and wait for the keeper to resolve the encrypted guess.";
    return casinoState.coin.latestBet.resolved
      ? `Latest coin toss ${casinoState.coin.latestBet.won ? "won" : "lost"} on-chain.`
      : "Latest coin toss is still in the randomness pipeline.";
  }

  if (activeGame === "dice") {
    if (!casinoState.dice.latestBet) return "Pick one face from one to six and send an encrypted stake to the dice contract.";
    return casinoState.dice.latestBet.resolved
      ? `Latest dice roll resolved with ${casinoState.dice.latestBet.rolled || "an encrypted value"}.`
      : "Latest dice wager is waiting for keeper settlement.";
  }

  if (activeGame === "crash") {
    if (!casinoState.crash.latestRound) return "The crash rail is waiting for the next operator round to open.";
    return casinoState.crash.latestRound.closed
      ? `Latest round ended at ${formatMultiplier(casinoState.crash.latestRound.crashMultiplierBps)}.`
      : "Round is live. Cash out before the multiplier collapses.";
  }

  return "Deal five encrypted cards, hold the positions you want, and request resolution after the draw.";
}

export default function CasinoShell({ activeGame }: Props) {
  const ActiveGameComponent = GAME_COMPONENTS[activeGame];
  const meta = getCasinoGameMeta(activeGame);
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
    walletBlocked,
    sessionActive,
    sessionExpiry,
    sessionAddress,
    startSession,
    endSession
  } = useWallet();
  const {
    connected: cofheConnected,
    ready: cofheReady,
    sessionReady: cofheSessionReady,
    sessionInitializing: cofheSessionInitializing
  } = useCofhe();

  const [sessionStarting, setSessionStarting] = useState(false);
  const [sessionEnding, setSessionEnding] = useState(false);

  const playerBalanceLabel = casinoState.isFhe
    ? "Encrypted"
    : `${formatEth(casinoState.playerBalance)} ETH`;

  const lockedBalanceLabel = casinoState.isFhe
    ? "Encrypted"
    : `${formatEth(casinoState.playerLockedBalance)} ETH`;

  const sessionMinutesRemaining = sessionActive && sessionExpiry
    ? Math.max(0, Math.floor((sessionExpiry - Date.now()) / 60000))
    : 0;

  const encryptedSessionLabel = !isConnected
    ? "Wallet not connected"
    : !isCorrectChain
      ? "Switch network"
      : cofheSessionReady
        ? "Ready for encrypted wagers"
        : cofheSessionInitializing
          ? "Initializing CoFHE"
          : cofheConnected
            ? "Warming session"
            : cofheReady
              ? "Start session"
              : "Loading encryption engine";

  async function handleStartSession() {
    setSessionStarting(true);
    try {
      await startSession(60);
    } catch {
      // surfaced via toast
    } finally {
      setSessionStarting(false);
    }
  }

  async function handleEndSession() {
    setSessionEnding(true);
    try {
      await endSession();
    } catch {
      // surfaced via toast
    } finally {
      setSessionEnding(false);
    }
  }

  function handleRefresh() {
    if (!isConnected) {
      void connectWallet();
      return;
    }

    if (!isCorrectChain) {
      void ensureTargetNetwork().catch((error) => console.warn("[CasinoShell]", error));
      return;
    }

    void loadProtocolState(account).catch((error) => console.warn("[CasinoShell]", error));
  }

  return (
    <main className="casino-route-shell">
      <section className="page-hero casino-page-hero">
        <div className="hero-copy-cluster">
          <p className="hero-kicker">Casino Rail</p>
          <h1>{meta.label}</h1>
          <p className="hero-description">
            {meta.summary}
          </p>
        </div>

        <div className="hero-actions-cluster">
          <button className="glass-button is-primary" onClick={handleRefresh} type="button">
            {!isConnected ? "Connect Wallet" : !isCorrectChain ? "Switch Network" : "Refresh State"}
          </button>
          <Link className="glass-button is-secondary" href="/wallet">
            Open Wallet
          </Link>
        </div>
      </section>

      <section className="overview-grid casino-overview-grid">
        <article className="overview-card">
          <span>Vault TVL</span>
          <strong>{formatEth(casinoState.vaultBalance)} ETH</strong>
          <p>Shared bankroll across the encrypted casino rail.</p>
        </article>
        <article className="overview-card">
          <span>Player Balance</span>
          <strong>{playerBalanceLabel}</strong>
          <p>Locked balance: {lockedBalanceLabel}</p>
        </article>
        <article className="overview-card">
          <span>Session State</span>
          <strong>{encryptedSessionLabel}</strong>
          <p>One session key can cover multiple bets without repeated prompts.</p>
        </article>
        <article className="overview-card">
          <span>Selected Game</span>
          <strong>{meta.multiplier}</strong>
          <p>{meta.kicker}</p>
        </article>
      </section>

      <GameTabs activeGame={activeGame} />

      {casinoLoadError ? (
        <div className="callout-banner is-danger">{casinoLoadError}</div>
      ) : null}

      <div className="callout-banner">
        <span className="callout-pill">{casinoState.isFhe ? "Encrypted Rail" : "Transparent Rail"}</span>
        <p>All active casino flows settle against live contracts on Arbitrum Sepolia with keeper-assisted randomness.</p>
      </div>

      {isConnected && isCorrectChain ? (
        <section className="casino-session-banner">
          <div className="casino-session-copy">
            <span className={`session-dot ${sessionActive ? "is-active" : ""}`} />
            <div>
              <strong>{sessionActive ? "Session active" : "No session key loaded"}</strong>
              <p>
                {sessionActive
                  ? `${sessionMinutesRemaining} minute(s) remaining${sessionAddress ? ` · ${sessionAddress.slice(0, 6)}...${sessionAddress.slice(-4)}` : ""}`
                  : "Start a one-hour encrypted session to reuse the same key across bets."}
              </p>
            </div>
          </div>

          {sessionActive ? (
            <button
              className="glass-button is-secondary"
              disabled={sessionEnding || Boolean(pendingAction)}
              onClick={() => void handleEndSession()}
              type="button"
            >
              {sessionEnding ? "Ending..." : "End Session"}
            </button>
          ) : (
            <button
              className="glass-button is-primary"
              disabled={sessionStarting || Boolean(pendingAction) || !cofheSessionReady}
              onClick={() => void handleStartSession()}
              type="button"
            >
              {sessionStarting ? "Starting..." : "Start Session"}
            </button>
          )}
        </section>
      ) : null}

      <section className="casino-main-grid">
        <article className="casino-stage-card">
          <div className="casino-stage-head">
            <div>
              <p className="section-kicker">Game Canvas</p>
              <h2>{meta.label}</h2>
              <p>{getCanvasNarrative(activeGame, casinoState)}</p>
            </div>
            <ProvablyFairBadge contractAddress={meta.contractAddress} modeLabel="Keeper plus on-chain verification" />
          </div>

          <div className={`casino-canvas is-${activeGame}`}>
            <span className="casino-canvas-kicker">{getCanvasLabel(activeGame, casinoState)}</span>
            <strong>{getCanvasValue(activeGame, casinoState)}</strong>
            <p>{pendingAction || meta.summary}</p>
            <div className="casino-canvas-lights" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          </div>

          <div className="casino-stage-insights">
            <div className="bet-insight-card">
              <span>Settlement</span>
              <strong>{casinoState.isFhe ? "Encrypted keeper flow" : "Direct on-chain"}</strong>
            </div>
            <div className="bet-insight-card">
              <span>Write access</span>
              <strong>{isConnected && isCorrectChain ? "Enabled" : "Read only"}</strong>
            </div>
            <div className="bet-insight-card">
              <span>Contract</span>
              <strong>{meta.contractAddress.slice(0, 8)}...{meta.contractAddress.slice(-6)}</strong>
            </div>
          </div>
        </article>

        <aside className="casino-control-dock">
          <div className="casino-control-head">
            <div>
              <p className="section-kicker">Bet Controls</p>
              <h2>{meta.label}</h2>
              <p>Wallet state, encrypted session readiness, and game controls stay live inside this panel.</p>
            </div>
            <span className="control-chip">{walletBlocked ? "Read Only" : "Ready"}</span>
          </div>

          <ActiveGameComponent
            casinoState={casinoState}
            isOperator={isOperator}
            pendingAction={pendingAction}
            runTransaction={runTransaction}
            walletBlocked={walletBlocked}
          />
        </aside>
      </section>

      <BetHistoryTabs
        account={account}
        activeGame={activeGame}
        casinoState={casinoState}
        sessionAddress={sessionAddress}
      />
    </main>
  );
}
