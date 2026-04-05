"use client";
import { useState } from "react";
import { ethers } from "ethers";
import { CASFIN_CONFIG } from "@/lib/casfin-config";
import { ENCRYPTED_DICE_ABI } from "@/lib/casfin-abis";
import { parseRequiredEth, parseRequiredInteger } from "@/lib/casfin-client";

const PRESETS = ["0.001", "0.005", "0.01", "0.05"];
const DICE_FACES = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

export default function DiceCard({ casinoState, pendingAction, runTransaction, walletBlocked }) {
  const [amount, setAmount] = useState("0.01");
  const [guess, setGuess] = useState(3);
  const [resolveBetId, setResolveBetId] = useState("");
  const [isRolling, setIsRolling] = useState(false);
  const [rolledFace, setRolledFace] = useState(null);
  const latestBet = casinoState.dice.latestBet;
  const latestBetId = casinoState.dice.nextBetId > 0n ? (casinoState.dice.nextBetId - 1n).toString() : "0";
  const usesEncryptedGame = casinoState.isFhe;
  const houseEdge = casinoState.dice.houseEdgeBps ? (Number(casinoState.dice.houseEdgeBps) / 100).toFixed(0) : "2";
  const latestBetStatus = !latestBet
    ? "No dice bet submitted yet."
    : latestBet.resolved
      ? `Latest bet #${latestBet.id.toString()} ${latestBet.won ? "won" : "lost"}${latestBet.rolled ? ` with a ${latestBet.rolled}.` : "."}`
      : latestBet.resolutionPending
        ? `Latest bet #${latestBet.id.toString()} is waiting for keeper finalization.`
        : `Latest bet #${latestBet.id.toString()} is waiting for keeper resolution.`;

  function applyPreset(preset) {
    if (preset === "½") setAmount((prev) => String((parseFloat(prev) / 2).toFixed(4)));
    else if (preset === "2×") setAmount((prev) => String((parseFloat(prev) * 2).toFixed(4)));
    else setAmount(preset);
  }

  async function handleRoll() {
    setIsRolling(true);
    setRolledFace(null);
    await runTransaction("Place dice bet", async (signer) => {
      const dice = new ethers.Contract(CASFIN_CONFIG.addresses.diceGame, ENCRYPTED_DICE_ABI, signer);
      void dice;
      void parseRequiredEth(amount, "Bet amount");
      void parseRequiredInteger(String(guess), "Guess");
      throw new Error("Encrypted dice bets require a signed FHE input proof. This frontend does not generate CoFHE bet payloads yet.");
    });
    setIsRolling(false);
  }

  const isRollPending = pendingAction === "Place dice bet";

  return (
    <div className="game-card dice-card">
      <div className="game-card-header">
        <span className="game-title dice-title">🎲 Dice Roll</span>
        <span className="game-payout-badge dice-badge">6×</span>
      </div>

      <div className="dice-stage">
        <div className={`dice-visual ${isRolling ? "dice-rolling" : ""}`}>
          <span className="dice-face-display">{DICE_FACES[guess - 1]}</span>
        </div>
        <div className="dice-table-surface" />
      </div>

      <div className="dice-number-row">
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <button
            className={`dice-num-btn ${guess === n ? "dice-num-active" : ""}`}
            key={n}
            onClick={() => setGuess(n)}
            type="button"
          >
            {n}
          </button>
        ))}
      </div>

      <p className="dice-pick-hint">Pick a number — match the roll to win 6×</p>

      <div className="amount-section">
        <input
          className="game-input"
          min="0"
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.01"
          step="0.001"
          type="number"
          value={amount}
        />
        <div className="preset-chips">
          {PRESETS.map((p) => (
            <button className="preset-chip" key={p} onClick={() => applyPreset(p)} type="button">
              {p}
            </button>
          ))}
          <button className="preset-chip" onClick={() => applyPreset("½")} type="button">½×</button>
          <button className="preset-chip" onClick={() => applyPreset("2×")} type="button">2×</button>
        </div>
      </div>

      <button
        className="game-action-btn dice-action-btn"
        disabled={walletBlocked || isRollPending || usesEncryptedGame}
        onClick={handleRoll}
        type="button"
      >
        {isRollPending ? "ROLLING..." : usesEncryptedGame ? "ENCRYPTED INPUT REQUIRED" : "ROLL DICE"}
      </button>

      <div className="resolve-row">
        <input
          className="game-input resolve-input"
          disabled
          onChange={(e) => setResolveBetId(e.target.value)}
          placeholder={usesEncryptedGame ? `Keeper resolves bet #${latestBetId}` : `Bet ID (latest: ${latestBetId})`}
          type="number"
          value={resolveBetId}
        />
        <button
          className="resolve-btn"
          disabled
          onClick={undefined}
          type="button"
        >
          Keeper
        </button>
      </div>

      <p className="game-footer-text">{houseEdge}% house edge · FHE-encrypted on Arbitrum</p>
      {usesEncryptedGame ? (
        <p className="game-footer-text">Dice resolution is keeper-driven on the encrypted contract after randomness is ready.</p>
      ) : null}
      <p className="game-footer-text">{latestBetStatus}</p>
    </div>
  );
}
