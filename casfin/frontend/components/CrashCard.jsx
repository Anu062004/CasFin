"use client";
import { useState, useEffect, useRef } from "react";
import { ethers } from "ethers";
import { CASFIN_CONFIG } from "@/lib/casfin-config";
import { ENCRYPTED_CRASH_ABI } from "@/lib/casfin-abis";
import { parseRequiredEth, parseRequiredInteger, parseCashOutMultiplier, formatMultiplier } from "@/lib/casfin-client";

const RECENT_ROUNDS_MOCK = [
  { val: "3.21", won: true }, { val: "1.08", won: false }, { val: "7.44", won: true },
  { val: "2.18", won: true }, { val: "1.00", won: false }, { val: "4.55", won: true },
];

export default function CrashCard({ casinoState, isOperator, pendingAction, runTransaction, walletBlocked }) {
  const [amount, setAmount] = useState("0.01");
  const [cashOutMultiplier, setCashOutMultiplier] = useState("2.0");
  const [settlePlayer, setSettlePlayer] = useState("");
  const [displayMultiplier, setDisplayMultiplier] = useState(1.0);
  const [isLive, setIsLive] = useState(false);
  const multiplierRef = useRef(null);
  const canvasRef = useRef(null);
  const pointsRef = useRef([]);
  const frameRef = useRef(null);

  const latestRound = casinoState.crash.latestRound;
  const roundId = latestRound?.id?.toString() || "—";
  const roundOpen = latestRound && !latestRound.closed;
  const maxCashOut = formatMultiplier(casinoState.crash.maxCashOutMultiplierBps);
  const usesEncryptedGame = casinoState.isFhe;

  // Animate the multiplier counter when round is open
  useEffect(() => {
    if (!roundOpen) { setDisplayMultiplier(1.0); return; }
    setIsLive(true);
    let start = null;
    let val = 1.0;
    function tick(ts) {
      if (!start) start = ts;
      const elapsed = (ts - start) / 1000;
      val = Math.pow(Math.E, 0.12 * elapsed);
      setDisplayMultiplier(val);
      drawCurve(val);
      frameRef.current = requestAnimationFrame(tick);
    }
    frameRef.current = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frameRef.current); setIsLive(false); };
  }, [roundOpen]);

  function drawCurve(currentVal) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const progress = Math.min((currentVal - 1) / 9, 1);
    const x = progress * w;
    const y = h - progress * h * 0.85;
    pointsRef.current.push({ x, y });
    if (pointsRef.current.length > 200) pointsRef.current.shift();
    if (pointsRef.current.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(0, h);
    pointsRef.current.forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.strokeStyle = "#00d4ff";
    ctx.lineWidth = 2.5;
    ctx.shadowColor = "#00d4ff";
    ctx.shadowBlur = 8;
    ctx.stroke();
    // Rocket at tip
    const last = pointsRef.current[pointsRef.current.length - 1];
    ctx.font = "20px serif";
    ctx.fillText("🚀", last.x - 10, last.y - 5);
  }

  const isStartPending = pendingAction === "Start crash round";
  const isBetPending = pendingAction === "Place crash bet";
  const isClosePending = pendingAction === "Close crash round";
  const isSettlePending = pendingAction === "Settle crash bet";

  return (
    <div className="game-card crash-card">
      <div className="crash-header">
        <div className="crash-header-left">
          <span className="game-title crash-title">💥 Crash</span>
          <span className={`round-state-badge ${roundOpen ? "badge-open" : "badge-closed"}`}>
            {roundOpen ? "● ROUND OPEN" : latestRound ? "● CLOSED" : "● NO ROUND"}
          </span>
        </div>
        <div className="crash-header-right">
          <span className="crash-round-label">Round <strong>#{roundId}</strong></span>
          {roundOpen && <span className="live-badge">LIVE</span>}
        </div>
      </div>

      <div className="crash-stage">
        <canvas className="crash-canvas" height="200" ref={canvasRef} width="800" />
        <div className="crash-multiplier-display">
          <span className={`crash-multiplier-value ${displayMultiplier >= 2 ? "multiplier-hot" : ""}`}>
            {displayMultiplier.toFixed(2)}×
          </span>
          <span className="crash-multiplier-sub">
            {roundOpen ? "LIVE — RISING" : latestRound?.closed ? `CRASHED AT ${formatMultiplier(latestRound.crashMultiplierBps)}` : "WAITING FOR BETS"}
          </span>
        </div>
      </div>

      <div className="crash-controls">
        <div className="crash-inputs-row">
          <div className="crash-input-group">
            <label className="crash-input-label">AMOUNT (ETH)</label>
            <input
              className="game-input"
              min="0"
              onChange={(e) => setAmount(e.target.value)}
              step="0.001"
              type="number"
              value={amount}
            />
          </div>
          <div className="crash-input-group">
            <label className="crash-input-label">AUTO CASH-OUT AT</label>
            <input
              className="game-input"
              min="1.1"
              onChange={(e) => setCashOutMultiplier(e.target.value)}
              step="0.1"
              type="number"
              value={cashOutMultiplier}
            />
          </div>
          <button
            className="game-action-btn crash-action-btn"
            disabled={walletBlocked || isBetPending || usesEncryptedGame}
            onClick={() =>
              runTransaction("Place crash bet", async (signer) => {
                const crash = new ethers.Contract(CASFIN_CONFIG.addresses.crashGame, ENCRYPTED_CRASH_ABI, signer);
                void crash;
                void parseRequiredInteger(roundId, "Round id");
                void parseRequiredEth(amount, "Crash amount");
                void parseCashOutMultiplier(cashOutMultiplier);
                throw new Error("Encrypted crash bets require a signed FHE input proof. This frontend does not generate CoFHE bet payloads yet.");
              })
            }
            type="button"
          >
            {isBetPending ? "PLACING..." : usesEncryptedGame ? "ENCRYPTED INPUT REQUIRED" : "PLACE BET"}
          </button>
        </div>

        <div className="crash-secondary-row">
          {isOperator && (
            <button
              className="crash-operator-btn"
              disabled={walletBlocked || isStartPending}
              onClick={() => runTransaction("Start crash round", async (signer) => {
                const crash = new ethers.Contract(CASFIN_CONFIG.addresses.crashGame, ENCRYPTED_CRASH_ABI, signer);
                return crash.startRound();
              })}
              type="button"
            >
              {isStartPending ? "Starting..." : "Start Round"}
            </button>
          )}
          <button
            className="crash-close-btn"
            disabled={walletBlocked || isClosePending}
            onClick={() => runTransaction("Close crash round", async (signer) => {
              const crash = new ethers.Contract(CASFIN_CONFIG.addresses.crashGame, ENCRYPTED_CRASH_ABI, signer);
              return crash.closeRound(parseRequiredInteger(roundId, "Round id"));
            })}
            type="button"
          >
            {isClosePending ? "Closing..." : "CLOSE ROUND"}
          </button>
        </div>

        <div className="crash-settle-row">
          <input
            className="game-input"
            onChange={(e) => setSettlePlayer(e.target.value)}
            placeholder="Player address to settle"
            type="text"
            value={settlePlayer}
          />
          <button
            className="crash-settle-btn"
            disabled={walletBlocked || isSettlePending || !ethers.isAddress(settlePlayer)}
            onClick={() => runTransaction("Settle crash bet", async (signer) => {
              const crash = new ethers.Contract(CASFIN_CONFIG.addresses.crashGame, ENCRYPTED_CRASH_ABI, signer);
              return crash.settleBet(parseRequiredInteger(roundId, "Round id"), settlePlayer);
            })}
            type="button"
          >
            {isSettlePending ? "Settling..." : "Settle"}
          </button>
        </div>
      </div>

      <div className="recent-rounds">
        <span className="recent-label">Recent rounds</span>
        <div className="recent-pills">
          {RECENT_ROUNDS_MOCK.map((r, i) => (
            <span className={`recent-pill ${r.won ? "pill-win" : "pill-loss"}`} key={i}>
              {r.val}×
            </span>
          ))}
        </div>
      </div>
      {usesEncryptedGame ? (
        <p className="game-footer-text">Crash round start, close, and settle remain callable. Player bet placement still needs encrypted FHE input payloads.</p>
      ) : null}
    </div>
  );
}
