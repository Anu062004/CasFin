"use client";

import { useState } from "react";
import { ethers } from "ethers";
import { useWallet } from "@/components/WalletProvider";
import CasinoOutcomeCard from "@/components/casino/CasinoOutcomeCard";
import { CASFIN_CONFIG } from "@/lib/casfin-config";
import { ENCRYPTED_COIN_FLIP_ABI } from "@/lib/casfin-abis";
import { formatAddress, parseRequiredEth } from "@/lib/casfin-client";
import { useCofhe } from "@/lib/cofhe-provider";

const PRESETS = ["0.001", "0.005", "0.01", "0.05"];
const SESSION_NOTICE_STYLE = {
  background: "rgba(139, 92, 246, 0.15)",
  border: "1px solid rgba(139, 92, 246, 0.3)",
  borderRadius: "8px",
  padding: "8px 12px",
  marginBottom: "12px",
  fontSize: "13px",
  color: "#a78bfa",
  display: "flex",
  alignItems: "center",
  gap: "8px"
} as const;
const SESSION_NOTICE_SPINNER_STYLE = {
  animation: "spin 1s linear infinite",
  display: "inline-flex"
} as const;

export default function CleanCoinFlipCard({ casinoState, pendingAction, runTransaction, walletBlocked }) {
  const [amount, setAmount] = useState("0.01");
  const [guessHeads, setGuessHeads] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    encryptUint128,
    encryptBool,
    connected: cofheConnected,
    ready: cofheReady,
    sessionReady: cofheSessionReady,
    sessionInitializing: cofheSessionInitializing
  } = useCofhe();
  const { account, connectWallet, ensureEncryptedSession, ensureTargetNetwork, isConnected, isCorrectChain } = useWallet();
  const latestBet = casinoState.coin.latestBet;
  const houseEdge = casinoState.coin.houseEdgeBps ? (Number(casinoState.coin.houseEdgeBps) / 100).toFixed(0) : "2";
  const bettingPaused = !casinoState.vaultHealthy || casinoState.vaultPaused;
  const latestBetOwnedByAccount = Boolean(
    account
      && latestBet?.player
      && latestBet.player.toLowerCase() === account.toLowerCase()
  );
  const latestBetId = latestBet?.id?.toString() || "0";
  const latestSelectionLabel = latestBet?.guessHeads == null ? "Encrypted" : latestBet.guessHeads ? "Heads" : "Tails";

  function applyPreset(preset: string) {
    if (preset === "0.5x") {
      setAmount((current) => String((parseFloat(current || "0") / 2).toFixed(4)));
      return;
    }

    if (preset === "2x") {
      setAmount((current) => String((parseFloat(current || "0") * 2).toFixed(4)));
      return;
    }

    setAmount(preset);
  }

  async function ensureActionReady() {
    try {
      if (!isConnected) {
        await connectWallet();
        return false;
      }

      if (!isCorrectChain) {
        await ensureTargetNetwork();
        return false;
      }

      await ensureEncryptedSession();
      return true;
    } catch (error) {
      console.warn("[CleanCoinFlipCard] Failed to prepare wallet action.", error);
      return false;
    }
  }

  async function handleSubmit() {
    if (bettingPaused) {
      return;
    }

    setIsSubmitting(true);

    try {
      if (!(await ensureActionReady())) {
        return;
      }

      await runTransaction("Place coin flip bet", async (signer) => {
        const coin = new ethers.Contract(CASFIN_CONFIG.addresses.coinFlipGame, ENCRYPTED_COIN_FLIP_ABI, signer);
        const amountWei = parseRequiredEth(amount, "Bet amount");
        const encAmount = await encryptUint128(amountWei);
        const encGuess = await encryptBool(guessHeads);
        return coin.placeBet(encAmount, encGuess);
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const isPending = pendingAction === "Place coin flip bet" || isSubmitting;
  const actionsBusy = Boolean(pendingAction) || Boolean(walletBlocked);
  const outcomeCard = !latestBet
    ? {
        tone: "idle" as const,
        badge: "No result",
        eyebrow: "Outcome",
        title: "Your next coin flip will land here",
        detail: "Place an encrypted wager and this card will call out the result as soon as the bet settles.",
        metrics: [
          { label: "Current pick", value: guessHeads ? "Heads" : "Tails" },
          { label: "Payout", value: "2.00x" }
        ]
      }
    : latestBet.resolved
      ? latestBetOwnedByAccount
        ? {
            tone: latestBet.won ? "win" as const : "loss" as const,
            badge: latestBet.won ? "Won" : "Lost",
            eyebrow: "Latest result",
            title: latestBet.won ? "You won the flip" : "You lost the flip",
            detail: `Bet #${latestBetId} has been settled on-chain. Your encrypted side has already been resolved.`,
            metrics: [
              { label: "Bet ID", value: latestBetId },
              { label: "Your side", value: latestSelectionLabel }
            ]
          }
        : {
            tone: latestBet.won ? "win" as const : "loss" as const,
            badge: "Table result",
            eyebrow: "Latest table result",
            title: latestBet.won ? "A recent coin flip paid out" : "A recent coin flip missed",
            detail: `Bet #${latestBetId} belongs to ${formatAddress(latestBet.player)}. Connect that wallet to see a personal win/loss label here.`,
            metrics: [
              { label: "Bet ID", value: latestBetId },
              { label: "Player", value: formatAddress(latestBet.player) }
            ]
          }
      : latestBet.resolutionPending
        ? {
            tone: "pending" as const,
            badge: "Settling",
            eyebrow: latestBetOwnedByAccount ? "Your bet" : "Latest table bet",
            title: latestBetOwnedByAccount ? "Your coin flip is settling" : "Latest coin flip is settling",
            detail: `Bet #${latestBetId} is waiting for its encrypted outcome to finalize.`,
            metrics: [
              { label: "Bet ID", value: latestBetId },
              { label: "Player", value: latestBetOwnedByAccount ? "You" : formatAddress(latestBet.player) }
            ]
          }
        : {
            tone: "pending" as const,
            badge: "Pending",
            eyebrow: latestBetOwnedByAccount ? "Your bet" : "Latest table bet",
            title: latestBetOwnedByAccount ? "Your coin flip is in flight" : "Latest coin flip is in flight",
            detail: `Bet #${latestBetId} has been accepted and is waiting for resolution.`,
            metrics: [
              { label: "Bet ID", value: latestBetId },
              { label: "Player", value: latestBetOwnedByAccount ? "You" : formatAddress(latestBet.player) }
            ]
          };

  return (
    <article className="casino-game-card theme-coin">
      <div className="casino-game-header">
        <div>
          <p className="casino-game-kicker">Coin Flip</p>
          <h3>Pick one side and submit a single encrypted wager.</h3>
        </div>
        <span className="casino-game-badge">2x payout</span>
      </div>

      <div className="coin-display-card">
        <div className={`coin-display-token ${isPending ? "is-spinning" : ""}`}>
          <span>{guessHeads ? "H" : "T"}</span>
        </div>
        <div className="coin-display-meta">
          <strong>{guessHeads ? "Heads" : "Tails"}</strong>
          <span>House edge {houseEdge}%</span>
        </div>
      </div>

      {cofheSessionInitializing ? (
        <div style={SESSION_NOTICE_STYLE}>
          <span aria-hidden="true" style={SESSION_NOTICE_SPINNER_STYLE}>⟳</span>
          Initializing FHE encrypted session... (first time only, ~5s)
        </div>
      ) : null}

      <div className="casino-choice-grid two-up">
        <button
          className={guessHeads ? "casino-choice-pill is-active" : "casino-choice-pill"}
          onClick={() => setGuessHeads(true)}
          type="button"
        >
          Heads
        </button>
        <button
          className={!guessHeads ? "casino-choice-pill is-active" : "casino-choice-pill"}
          onClick={() => setGuessHeads(false)}
          type="button"
        >
          Tails
        </button>
      </div>

      <div className="casino-field-block">
        <label className="casino-field-label" htmlFor="clean-coin-amount">Bet amount</label>
        <input
          className="casino-field-input"
          id="clean-coin-amount"
          min="0"
          onChange={(event) => setAmount(event.target.value)}
          placeholder="0.01"
          step="0.001"
          type="number"
          value={amount}
        />
        <div className="casino-chip-row">
          {PRESETS.map((preset) => (
            <button className="casino-chip-button" key={preset} onClick={() => applyPreset(preset)} type="button">
              {preset}
            </button>
          ))}
          <button className="casino-chip-button" onClick={() => applyPreset("0.5x")} type="button">0.5x</button>
          <button className="casino-chip-button" onClick={() => applyPreset("2x")} type="button">2x</button>
        </div>
      </div>

      {bettingPaused ? (
        <div className="casino-info-bar">Casino vault is being replenished. Betting paused.</div>
      ) : null}

      <button
        className="casino-primary-button"
        disabled={bettingPaused || actionsBusy || isSubmitting || (isConnected && isCorrectChain && !cofheSessionReady)}
        onClick={handleSubmit}
        type="button"
      >
        {isPending
          ? "Placing bet..."
          : bettingPaused
            ? "Betting paused"
          : !isConnected
            ? "Connect wallet to play"
            : !isCorrectChain
              ? "Switch to Arbitrum Sepolia"
              : cofheSessionReady
                ? "Place coin flip bet"
                : cofheSessionInitializing
                  ? "Initializing CoFHE..."
                  : !cofheReady
                ? "Initializing encrypted session"
                : !cofheConnected
                  ? "Start encrypted session"
                  : "Warming encrypted session"}
      </button>

      <CasinoOutcomeCard {...outcomeCard} />

      <div className="casino-status-grid">
        <div className="casino-status-item">
          <span>Settlement</span>
          <strong>Keeper-driven</strong>
        </div>
        <div className="casino-status-item">
          <span>Latest state</span>
          <strong>{latestBet?.resolved ? "Resolved" : latestBet ? "Pending" : "Idle"}</strong>
        </div>
      </div>
    </article>
  );
}
