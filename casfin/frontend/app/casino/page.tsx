"use client";

import { useState } from "react";
import GlassButton from "@/components/GlassButton";
import GlassCard from "@/components/GlassCard";
import VaultCard from "@/components/VaultCard";
import CleanCoinFlipCard from "@/components/casino/CleanCoinFlipCard";
import CleanCrashCard from "@/components/casino/CleanCrashCard";
import CleanDiceCard from "@/components/casino/CleanDiceCard";
import CleanPokerCard from "@/components/casino/CleanPokerCard";
import { useWallet } from "@/components/WalletProvider";
import { formatAddress, formatEth, formatMultiplier } from "@/lib/casfin-client";
import { CASFIN_CONFIG } from "@/lib/casfin-config";
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
    walletBlocked
  } = useWallet();

  const [activeSection, setActiveSection] = useState<CasinoSection>("coin");
  const [vaultForm, setVaultForm] = useState({
    depositAmount: "0.05",
    withdrawAmount: "0.01",
    bankrollAmount: "0.10"
  });

  const playerBalanceLabel = casinoState.isFhe
    ? "Encrypted"
    : `${formatEth(casinoState.playerBalance)} ETH`;

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
      {/* ── Header ── */}
      <section className="casino-hero-panel">
        <div className="casino-hero-copy">
          <p className="casino-eyebrow">Game Floor</p>
          <h1 className="casino-title">Casino</h1>
        </div>

        <div className="casino-hero-center">
          <div className="fhe-visualizer">
            <div className="fhe-icon-wrapper">
              <div className="fhe-pulse-ring ring-1"></div>
              <div className="fhe-pulse-ring ring-2"></div>
              <div className="fhe-core">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
              </div>
            </div>
            <div className="fhe-data-stream">
              <strong>Fhenix Engine</strong>
              <span>On-Chain Encrypted State</span>
            </div>
          </div>
        </div>

        <div className="casino-hero-actions">
          <GlassButton disabled={Boolean(pendingAction)} onClick={handleRefresh}>
            {!isConnected ? "Connect Wallet" : !isCorrectChain ? "Switch Network" : "Refresh"}
          </GlassButton>
          <div className="casino-hero-network">
            <span className={`casino-network-dot ${isConnected && isCorrectChain ? "is-live" : "is-idle"}`} />
            <div>
              <strong>{isConnected ? CASFIN_CONFIG.chainName : "Not connected"}</strong>
              {isConnected && <span style={{ opacity: 0.6, fontSize: "0.8rem" }}>{formatAddress(account)}</span>}
            </div>
          </div>
        </div>
      </section>

      {/* ── Stat strip ── */}
      <section className="casino-stat-grid">
        <article className="casino-stat-card">
          <span>Vault TVL</span>
          <strong>{formatEth(casinoState.vaultBalance)} ETH</strong>
        </article>
        <article className="casino-stat-card">
          <span>Your balance</span>
          <strong>{playerBalanceLabel}</strong>
        </article>
        <article className="casino-stat-card">
          <span>Crash ceiling</span>
          <strong>{formatMultiplier(casinoState.crash.maxCashOutMultiplierBps)}</strong>
        </article>
        <article className="casino-stat-card">
          <span>Crash status</span>
          <strong>{crashStatus}</strong>
        </article>
      </section>

      {casinoLoadError ? (
        <div className="casino-error-bar">{casinoLoadError}</div>
      ) : null}

      {casinoState.isFhe ? (
        <div className="casino-info-bar">
          Encrypted vault — balances decrypted locally once your CoFHE session is ready.
        </div>
      ) : null}

      {/* ── Main layout ── */}
      <div className="casino-content-grid">
        {/* Sidebar */}
        <aside className="casino-side-rail">
          <VaultCard
            casinoState={casinoState}
            className="casino-vault-card"
            isOperator={isOperator}
            large
            pendingAction={pendingAction}
            runTransaction={runTransaction}
            setVaultForm={setVaultForm}
            stagger={1}
            vaultForm={vaultForm}
            walletBlocked={walletBlocked}
          />

          <GlassCard eyebrow="Session" stagger={2} title="Status">
            <div className="casino-support-list">
              {[
                ["Wallet", isConnected ? "Connected" : "Not connected"],
                ["Network", isCorrectChain ? CASFIN_CONFIG.chainName : "Switch required"],
                ["Vault mode", casinoState.isFhe ? "Encrypted" : "Plaintext"],
                ["CoFHE session", encryptedSessionLabel]
              ].map(([label, value]) => (
                <div className="casino-support-row" key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          </GlassCard>
        </aside>

        {/* Main stage */}
        <section className="casino-main-stage">
          {/* Tab switcher */}
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

          {/* Active game */}
          <div className="casino-game-panel">
            {activeSection === "coin" && (
              <CleanCoinFlipCard
                casinoState={casinoState}
                pendingAction={pendingAction}
                runTransaction={runTransaction}
                walletBlocked={walletBlocked}
              />
            )}
            {activeSection === "dice" && (
              <CleanDiceCard
                casinoState={casinoState}
                pendingAction={pendingAction}
                runTransaction={runTransaction}
                walletBlocked={walletBlocked}
              />
            )}
            {activeSection === "crash" && (
              <CleanCrashCard
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
