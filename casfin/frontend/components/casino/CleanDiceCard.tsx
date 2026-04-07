"use client";

import { useState } from "react";
import { ethers } from "ethers";
import { useWallet } from "@/components/WalletProvider";
import { CASFIN_CONFIG } from "@/lib/casfin-config";
import { ENCRYPTED_DICE_ABI } from "@/lib/casfin-abis";
import { parseRequiredEth, parseRequiredInteger } from "@/lib/casfin-client";
import { useCofhe } from "@/lib/cofhe-provider";

const PRESETS = ["0.001", "0.005", "0.01", "0.05"];

export default function CleanDiceCard({ casinoState, pendingAction, runTransaction, walletBlocked }) {
  const [amount, setAmount] = useState("0.01");
  const [guess, setGuess] = useState(3);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { encryptUint128, encryptUint8, connected: cofheConnected, ready: cofheReady } = useCofhe();
  const { connectWallet, ensureEncryptedSession, ensureTargetNetwork, isConnected, isCorrectChain } = useWallet();
  const latestBet = casinoState.dice.latestBet;
  const houseEdge = casinoState.dice.houseEdgeBps ? (Number(casinoState.dice.houseEdgeBps) / 100).toFixed(0) : "2";

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
      console.warn("[CleanDiceCard] Failed to prepare wallet action.", error);
      return false;
    }
  }

  async function handleSubmit() {
    setIsSubmitting(true);

    try {
      if (!(await ensureActionReady())) {
        return;
      }

      await runTransaction("Place dice bet", async (signer) => {
        const dice = new ethers.Contract(CASFIN_CONFIG.addresses.diceGame, ENCRYPTED_DICE_ABI, signer);
        const amountWei = parseRequiredEth(amount, "Bet amount");
        const guessValue = parseRequiredInteger(String(guess), "Guess");

        if (guessValue < 1 || guessValue > 6) {
          throw new Error("Guess must be between 1 and 6.");
        }

        const encAmount = await encryptUint128(amountWei);
        const encGuess = await encryptUint8(guessValue);
        return dice.placeBet(encAmount, encGuess);
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const isPending = pendingAction === "Place dice bet" || isSubmitting;
  const actionsBusy = Boolean(pendingAction) || Boolean(walletBlocked);
  const latestBetText = !latestBet
    ? "No dice bet submitted yet."
    : latestBet.resolved
      ? `Latest bet #${latestBet.id?.toString() || "0"} ${latestBet.won ? "won" : "lost"}${latestBet.rolled ? ` with a ${latestBet.rolled}.` : "."}`
      : latestBet.resolutionPending
        ? `Latest bet #${latestBet.id?.toString() || "0"} is awaiting finalization.`
        : `Latest bet #${latestBet.id?.toString() || "0"} is awaiting resolution.`;

  return (
    <article className="casino-game-card theme-dice">
      <div className="casino-game-header">
        <div>
          <p className="casino-game-kicker">Dice</p>
          <h3>Choose a face from one to six and place a single encrypted stake.</h3>
        </div>
        <span className="casino-game-badge">6x payout</span>
      </div>

      <div className="dice-display-card">
        <div className={`dice-display-face ${isPending ? "is-rolling" : ""}`}>{guess}</div>
        <div className="dice-display-meta">
          <strong>Selected face {guess}</strong>
          <span>House edge {houseEdge}%</span>
        </div>
      </div>

      <div className="casino-choice-grid six-up">
        {[1, 2, 3, 4, 5, 6].map((face) => (
          <button
            className={guess === face ? "casino-choice-pill is-active" : "casino-choice-pill"}
            key={face}
            onClick={() => setGuess(face)}
            type="button"
          >
            {face}
          </button>
        ))}
      </div>

      <div className="casino-field-block">
        <label className="casino-field-label" htmlFor="clean-dice-amount">Bet amount</label>
        <input
          className="casino-field-input"
          id="clean-dice-amount"
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
                  : "Place dice bet"}
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
