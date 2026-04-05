"use client";
import { useState } from "react";
import { ethers } from "ethers";
import { CASFIN_CONFIG } from "@/lib/casfin-config";
import { ENCRYPTED_COIN_FLIP_ABI } from "@/lib/casfin-abis";
import { parseRequiredEth } from "@/lib/casfin-client";

const PRESETS = ["0.001", "0.005", "0.01", "0.05"];

export default function CoinFlipCard({ casinoState, pendingAction, runTransaction, walletBlocked }) {
  const [amount, setAmount] = useState("0.01");
  const [guessHeads, setGuessHeads] = useState(true);
  const [resolveBetId, setResolveBetId] = useState("");
  const [isFlipping, setIsFlipping] = useState(false);
  const latestBet = casinoState.coin.latestBet;
  const latestBetId = casinoState.coin.nextBetId > 0n ? (casinoState.coin.nextBetId - 1n).toString() : "0";
  const usesEncryptedGame = casinoState.isFhe;

  const houseEdge = casinoState.coin.houseEdgeBps ? (Number(casinoState.coin.houseEdgeBps) / 100).toFixed(0) : "2";
  const latestBetStatus = !latestBet
    ? "No coin flip bet submitted yet."
    : latestBet.resolved
      ? `Latest bet #${latestBet.id.toString()} ${latestBet.won ? "won" : "lost"}.`
      : latestBet.resolutionPending
        ? `Latest bet #${latestBet.id.toString()} is waiting for keeper finalization.`
        : `Latest bet #${latestBet.id.toString()} is waiting for keeper resolution.`;

  function applyPreset(preset) {
    if (preset === "½") {
      setAmount((prev) => String((parseFloat(prev) / 2).toFixed(4)));
    } else if (preset === "2×") {
      setAmount((prev) => String((parseFloat(prev) * 2).toFixed(4)));
    } else {
      setAmount(preset);
    }
  }

  async function handleFlip() {
    setIsFlipping(true);
    await runTransaction("Place coin flip bet", async (signer) => {
      const coin = new ethers.Contract(CASFIN_CONFIG.addresses.coinFlipGame, ENCRYPTED_COIN_FLIP_ABI, signer);
      void coin;
      void parseRequiredEth(amount, "Bet amount");
      void guessHeads;
      throw new Error("Encrypted coin flip bets require a signed FHE input proof. This frontend does not generate CoFHE bet payloads yet.");
    });
    setIsFlipping(false);
  }

  const isFlipPending = pendingAction === "Place coin flip bet";

  return (
    <div className="game-card coin-card">
      <div className="game-card-header">
        <span className="game-title coin-title">🪙 Coin Flip</span>
        <span className="game-payout-badge coin-badge">2×</span>
      </div>

      <div className="coin-stage">
        <div className={`coin-visual ${isFlipping ? "coin-flipping" : ""}`}>
          <div className="coin-face coin-front">H</div>
          <div className="coin-face coin-back">T</div>
        </div>
        <div className="coin-table-felt" />
      </div>

      <div className="heads-tails-row">
        <button
          className={`ht-btn ${guessHeads ? "ht-active" : ""}`}
          onClick={() => setGuessHeads(true)}
          type="button"
        >
          HEADS
        </button>
        <button
          className={`ht-btn ${!guessHeads ? "ht-active" : ""}`}
          onClick={() => setGuessHeads(false)}
          type="button"
        >
          TAILS
        </button>
      </div>

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
        className="game-action-btn coin-action-btn"
        disabled={walletBlocked || isFlipPending || usesEncryptedGame}
        onClick={handleFlip}
        type="button"
      >
        {isFlipPending ? "FLIPPING..." : usesEncryptedGame ? "ENCRYPTED INPUT REQUIRED" : "FLIP COIN"}
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

      <p className="game-footer-text">{houseEdge}% house edge · Provably fair on-chain</p>
      {usesEncryptedGame ? (
        <p className="game-footer-text">Coin flip resolution is keeper-driven on the encrypted contract after randomness is ready.</p>
      ) : null}
      <p className="game-footer-text">{latestBetStatus}</p>
    </div>
  );
}
