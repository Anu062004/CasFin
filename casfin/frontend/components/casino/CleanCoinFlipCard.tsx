"use client";

import { useState } from "react";
import { ethers } from "ethers";
import { useWallet } from "@/components/WalletProvider";
import { CASFIN_CONFIG } from "@/lib/casfin-config";
import { ENCRYPTED_COIN_FLIP_ABI } from "@/lib/casfin-abis";
import { parseRequiredEth } from "@/lib/casfin-client";
import { useCofhe } from "@/lib/cofhe-provider";

const PRESETS = ["0.001", "0.005", "0.01", "0.05"];

export default function CleanCoinFlipCard({ casinoState, pendingAction, runTransaction, walletBlocked }) {
  const [amount, setAmount] = useState("0.01");
  const [guessHeads, setGuessHeads] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { encryptUint128, encryptBool, connected: cofheConnected, ready: cofheReady } = useCofhe();
  const { connectWallet, ensureEncryptedSession, ensureTargetNetwork, isConnected, isCorrectChain } = useWallet();
  const latestBet = casinoState.coin.latestBet;
  const houseEdge = casinoState.coin.houseEdgeBps ? (Number(casinoState.coin.houseEdgeBps) / 100).toFixed(0) : "2";

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
  const latestBetText = !latestBet
    ? "No coin flip bet submitted yet."
    : latestBet.resolved
      ? `Latest bet #${latestBet.id?.toString() || "0"} ${latestBet.won ? "won" : "lost"}.`
      : latestBet.resolutionPending
        ? `Latest bet #${latestBet.id?.toString() || "0"} is awaiting finalization.`
        : `Latest bet #${latestBet.id?.toString() || "0"} is awaiting resolution.`;

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

      <button
        className="casino-primary-button"
        disabled={actionsBusy || isSubmitting}
        onClick={handleSubmit}
        type="button"
      >
        {isPending
          ? "Placing bet..."
          : !isConnected
            ? "Connect wallet to play"
            : !isCorrectChain
              ? "Switch to Arbitrum Sepolia"
              : !cofheReady
                ? "Initializing encrypted session"
                : !cofheConnected
                  ? "Start encrypted session"
                  : "Place coin flip bet"}
      </button>

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

      <p className="casino-game-note">{latestBetText}</p>
    </article>
  );
}
