"use client";

import { useState } from "react";
import CoinFlipCard from "@/components/CoinFlipCard";
import CrashCard from "@/components/CrashCard";
import DiceCard from "@/components/DiceCard";
import CleanPokerCard from "@/components/casino/CleanPokerCard";
import { useWallet } from "@/components/WalletProvider";
import { formatEth, formatMultiplier } from "@/lib/casfin-client";
import { useCofhe } from "@/lib/cofhe-provider";

type CasinoSection = "coin" | "dice" | "crash" | "poker";

export default function CasinoPage() {
  const {
    connected: cofheConnected,
    ready: cofheReady,
    sessionReady: cofheSessionReady,
    sessionInitializing: cofheSessionInitializing
  } = useCofhe();
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

  const [activeSection, setActiveSection] = useState<CasinoSection>("coin");
  const [sessionStarting, setSessionStarting] = useState(false);
  const [sessionEnding, setSessionEnding] = useState(false);
  const [vaultForm, setVaultForm] = useState({
    depositAmount: "0.05",
    withdrawAmount: "0.01",
    bankrollAmount: "0.10"
  });

  const playerBalanceLabel = casinoState.isFhe
    ? "Encrypted"
    : `${formatEth(casinoState.playerBalance)} ETH`;

  const sessionMinutesRemaining = sessionActive && sessionExpiry
    ? Math.max(0, Math.floor((sessionExpiry - Date.now()) / 60000))
    : 0;

  async function handleStartSession() {
    setSessionStarting(true);
    try {
      await startSession(60);
    } catch {
      // error shown via status bar
    } finally {
      setSessionStarting(false);
    }
  }

  async function handleEndSession() {
    setSessionEnding(true);
    try {
      await endSession();
    } catch {
      // error shown via status bar
    } finally {
      setSessionEnding(false);
    }
  }

  const encryptedSessionLabel = !isConnected
    ? "Not connected"
    : !isCorrectChain
      ? "Switch required"
      : cofheSessionReady
        ? "Ready"
        : cofheSessionInitializing
          ? "Initializing TFHE"
          : cofheConnected
            ? "Warming up"
            : cofheReady
          ? "Starting"
          : "Loading";

  const crashStatus = casinoState.crash.latestRound
    ? casinoState.crash.latestRound.closed
      ? `Closed at ${formatMultiplier(casinoState.crash.latestRound.crashMultiplierBps)}`
      : "Round open"
    : "No round yet";

  function handleRefresh() {
    if (!isConnected) { void connectWallet(); return; }
    if (!isCorrectChain) {
      void ensureTargetNetwork().catch((e) => console.warn("[CasinoPage]", e));
      return;
    }
    void loadProtocolState(account).catch((e) => console.warn("[CasinoPage]", e));
  }

  const tabLabel: Record<CasinoSection, string> = {
    coin: "🪙 Coin Flip",
    dice: "🎲 Dice",
    crash: "📈 Crash",
    poker: "🃏 Poker"
  };

  return (
    <main className="casino-page casino-page-clean">
      {/* Terminal scanlines */}
      <div className="casino-scanlines" aria-hidden="true" />

      {/* Ticker tape marquee */}
      <div className="casino-ticker">
        <div className="casino-ticker-inner">
          <span className="casino-ticker-item">VAULT_TVL <span className="casino-ticker-val">{formatEth(casinoState.vaultBalance)} ETH</span></span>
          <span className="casino-ticker-sep">///</span>
          <span className="casino-ticker-item">YOUR_BALANCE <span className="casino-ticker-encrypted casino-glitch-text">{playerBalanceLabel}</span></span>
          <span className="casino-ticker-sep">///</span>
          <span className="casino-ticker-item">CRASH_CEILING <span className="casino-ticker-val">{formatMultiplier(casinoState.crash.maxCashOutMultiplierBps)}</span></span>
          <span className="casino-ticker-sep">///</span>
          <span className="casino-ticker-item">CRASH_STATUS <span className={crashStatus === "No round yet" ? "casino-ticker-red" : "casino-ticker-green"}>{crashStatus.toUpperCase().replace(/ /g, "_")}</span></span>
          <span className="casino-ticker-sep">///</span>
          <span className="casino-ticker-item">FHENIX_ENGINE <span className="casino-ticker-green">ACTIVE</span></span>
          <span className="casino-ticker-sep">///</span>
          {/* Duplicate for seamless loop */}
          <span className="casino-ticker-item">VAULT_TVL <span className="casino-ticker-val">{formatEth(casinoState.vaultBalance)} ETH</span></span>
          <span className="casino-ticker-sep">///</span>
          <span className="casino-ticker-item">YOUR_BALANCE <span className="casino-ticker-encrypted casino-glitch-text">{playerBalanceLabel}</span></span>
          <span className="casino-ticker-sep">///</span>
          <span className="casino-ticker-item">CRASH_CEILING <span className="casino-ticker-val">{formatMultiplier(casinoState.crash.maxCashOutMultiplierBps)}</span></span>
          <span className="casino-ticker-sep">///</span>
          <span className="casino-ticker-item">CRASH_STATUS <span className={crashStatus === "No round yet" ? "casino-ticker-red" : "casino-ticker-green"}>{crashStatus.toUpperCase().replace(/ /g, "_")}</span></span>
          <span className="casino-ticker-sep">///</span>
          <span className="casino-ticker-item">FHENIX_ENGINE <span className="casino-ticker-green">ACTIVE</span></span>
          <span className="casino-ticker-sep">///</span>
        </div>
      </div>

      {/* Game tabs (pill style) */}
      <div className="casino-section-switcher">
        {(["coin", "dice", "crash", "poker"] as CasinoSection[]).map((s) => (
          <button
            key={s}
            className={activeSection === s ? "casino-section-tab is-active" : "casino-section-tab"}
            onClick={() => setActiveSection(s)}
            type="button"
          >
            {tabLabel[s]}
          </button>
        ))}
      </div>

      {/* Fhenix Engine badge */}
      <div className="casino-fhe-badge">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        Fhenix Engine · On-Chain Encrypted State
      </div>

      {casinoLoadError ? (
        <div className="casino-error-bar">{casinoLoadError}</div>
      ) : null}

      {casinoState.isFhe ? (
        <div className="casino-info-bar">
          Encrypted vault — balances decrypted locally once your CoFHE session is ready.
        </div>
      ) : null}

      {/* Session Key Panel */}
      {isConnected && isCorrectChain && (
        <div className="casino-session-panel">
          {sessionActive ? (
            <div className="casino-session-active">
              <div className="casino-session-status">
                <span className="casino-session-dot casino-session-dot--active" />
                <span className="casino-session-label">SESSION ACTIVE</span>
                <span className="casino-session-timer">{sessionMinutesRemaining}m remaining</span>
                {sessionAddress && (
                  <span className="casino-session-addr" title={sessionAddress}>
                    key: {sessionAddress.slice(0, 6)}…{sessionAddress.slice(-4)}
                  </span>
                )}
              </div>
              <button
                className="casino-session-btn casino-session-btn--end"
                disabled={sessionEnding || Boolean(pendingAction)}
                onClick={handleEndSession}
                type="button"
              >
                {sessionEnding ? "Ending…" : "End Session"}
              </button>
            </div>
          ) : (
            <div className="casino-session-inactive">
              <div className="casino-session-status">
                <span className="casino-session-dot casino-session-dot--inactive" />
                <span className="casino-session-label">NO SESSION</span>
                <span className="casino-session-hint">Start a session to bet without wallet popups</span>
              </div>
              <button
                className="casino-session-btn casino-session-btn--start"
                disabled={sessionStarting || !cofheSessionReady || Boolean(pendingAction)}
                onClick={handleStartSession}
                type="button"
              >
                {sessionStarting ? "Starting…" : "Start Session"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Active game panel */}
      <div className="casino-content-grid">
        <section className="casino-main-stage">
          <div className="casino-game-panel">
            {activeSection === "coin" && (
              <CoinFlipCard
                casinoState={casinoState}
                pendingAction={pendingAction}
                runTransaction={runTransaction}
                walletBlocked={walletBlocked}
              />
            )}
            {activeSection === "dice" && (
              <DiceCard
                casinoState={casinoState}
                pendingAction={pendingAction}
                runTransaction={runTransaction}
                walletBlocked={walletBlocked}
              />
            )}
            {activeSection === "crash" && (
              <CrashCard
                casinoState={casinoState}
                isOperator={isOperator}
                pendingAction={pendingAction}
                runTransaction={runTransaction}
                walletBlocked={walletBlocked}
              />
            )}
            {activeSection === "poker" && (
              <CleanPokerCard
                casinoState={casinoState}
                isOperator={isOperator}
                pendingAction={pendingAction}
                runTransaction={runTransaction}
                walletBlocked={walletBlocked}
              />
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
