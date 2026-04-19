"use client";

import { useState } from "react";
import { ethers } from "ethers";
import { useWallet } from "@/components/WalletProvider";
import CasinoOutcomeCard from "@/components/casino/CasinoOutcomeCard";
import { CASFIN_CONFIG } from "@/lib/casfin-config";
import { ENCRYPTED_DICE_ABI } from "@/lib/casfin-abis";
import { formatAddress, parseRequiredEth, parseRequiredInteger } from "@/lib/casfin-client";
import { useCofhe } from "@/lib/cofhe-provider";

const PRESETS = ["0.001", "0.005", "0.01", "0.05"];

const DICE_DOTS: Record<number, number[][]> = {
  1: [[1,1]],
  2: [[0,0],[2,2]],
  3: [[0,0],[1,1],[2,2]],
  4: [[0,0],[0,2],[2,0],[2,2]],
  5: [[0,0],[0,2],[1,1],[2,0],[2,2]],
  6: [[0,0],[0,2],[1,0],[1,2],[2,0],[2,2]]
};

function DiceFace({ value }: { value: number }) {
  const dots = DICE_DOTS[value] || [];
  return (
    <div className="dice-face-grid">
      {dots.map(([row, col], i) => (
        <span
          key={i}
          className="dice-dot"
          style={{ gridRow: row + 1, gridColumn: col + 1 }}
        />
      ))}
    </div>
  );
}

export default function CleanDiceCard({ casinoState, pendingAction, runTransaction, walletBlocked }) {
  const [amount, setAmount] = useState("0.01");
  const [guess, setGuess] = useState(3);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    encryptUint128,
    encryptUint8,
    connected: cofheConnected,
    ready: cofheReady,
    sessionReady: cofheSessionReady,
    sessionInitializing: cofheSessionInitializing
  } = useCofhe();
  const { account, connectWallet, ensureEncryptedSession, ensureTargetNetwork, isConnected, isCorrectChain } = useWallet();
  const latestBet = casinoState.dice.latestBet;
  const houseEdge = casinoState.dice.houseEdgeBps ? (Number(casinoState.dice.houseEdgeBps) / 100).toFixed(0) : "2";
  const latestBetOwnedByAccount = Boolean(
    account
      && latestBet?.player
      && latestBet.player.toLowerCase() === account.toLowerCase()
  );
  const latestBetId = latestBet?.id?.toString() || "0";
  const latestGuessLabel = latestBet?.guess == null ? "Encrypted" : String(latestBet.guess);
  const latestRollLabel = latestBet?.rolled ? String(latestBet.rolled) : "Pending";

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
  const outcomeCard = !latestBet
    ? {
        tone: "idle" as const,
        badge: "No result",
        eyebrow: "Outcome",
        title: "Your next dice roll will appear here",
        detail: "Place an encrypted dice bet and this card will promote the result once the round settles.",
        metrics: [
          { label: "Selected face", value: String(guess) },
          { label: "Payout", value: "6.00x" }
        ]
      }
    : latestBet.resolved
      ? latestBetOwnedByAccount
        ? {
            tone: latestBet.won ? "win" as const : "loss" as const,
            badge: latestBet.won ? "Won" : "Lost",
            eyebrow: "Latest result",
            title: latestBet.won ? "You hit the roll" : "Your number missed",
            detail: `Bet #${latestBetId} has been resolved on-chain${latestBet.rolled ? ` with a final roll of ${latestBet.rolled}.` : "."}`,
            metrics: [
              { label: "Bet ID", value: latestBetId },
              { label: "Your face", value: latestGuessLabel },
              { label: "Rolled", value: latestRollLabel }
            ]
          }
        : {
            tone: latestBet.won ? "win" as const : "loss" as const,
            badge: "Table result",
            eyebrow: "Latest table result",
            title: latestBet.won ? "A recent dice bet won" : "A recent dice bet lost",
            detail: `Bet #${latestBetId} belongs to ${formatAddress(latestBet.player)}. Connect that wallet to see the personal result card here.`,
            metrics: [
              { label: "Bet ID", value: latestBetId },
              { label: "Player", value: formatAddress(latestBet.player) },
              { label: "Rolled", value: latestRollLabel }
            ]
          }
      : latestBet.resolutionPending
        ? {
            tone: "pending" as const,
            badge: "Settling",
            eyebrow: latestBetOwnedByAccount ? "Your bet" : "Latest table bet",
            title: latestBetOwnedByAccount ? "Your dice bet is settling" : "Latest dice bet is settling",
            detail: `Bet #${latestBetId} has been rolled and is waiting for encrypted finalization.`,
            metrics: [
              { label: "Bet ID", value: latestBetId },
              { label: "Player", value: latestBetOwnedByAccount ? "You" : formatAddress(latestBet.player) }
            ]
          }
        : {
            tone: "pending" as const,
            badge: "Pending",
            eyebrow: latestBetOwnedByAccount ? "Your bet" : "Latest table bet",
            title: latestBetOwnedByAccount ? "Your dice bet is in flight" : "Latest dice bet is in flight",
            detail: `Bet #${latestBetId} is waiting for the dice roll to resolve.`,
            metrics: [
              { label: "Bet ID", value: latestBetId },
              { label: "Player", value: latestBetOwnedByAccount ? "You" : formatAddress(latestBet.player) }
            ]
          };

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
        <div className={`dice-display-face ${isPending ? "is-rolling" : ""}`}>
          <DiceFace value={guess} />
        </div>
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
              : cofheSessionReady
                ? "Place dice bet"
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
