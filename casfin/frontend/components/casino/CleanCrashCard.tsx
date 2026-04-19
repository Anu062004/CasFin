"use client";

import { useEffect, useRef, useState } from "react";
import { ethers } from "ethers";
import { useWallet } from "@/components/WalletProvider";
import CasinoOutcomeCard from "@/components/casino/CasinoOutcomeCard";
import { CASFIN_CONFIG } from "@/lib/casfin-config";
import { ENCRYPTED_CRASH_ABI } from "@/lib/casfin-abis";
import { formatMultiplier, parseCashOutMultiplier, parseRequiredEth, parseRequiredInteger } from "@/lib/casfin-client";
import { useCofhe } from "@/lib/cofhe-provider";

export default function CleanCrashCard({ casinoState, isOperator, pendingAction, runTransaction, walletBlocked }) {
  const [amount, setAmount] = useState("0.01");
  const [cashOutMultiplier, setCashOutMultiplier] = useState("2.0");
  const [settlePlayer, setSettlePlayer] = useState("");
  const [displayMultiplier, setDisplayMultiplier] = useState(1.0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointsRef = useRef<{ x: number; y: number }[]>([]);
  const frameRef = useRef<number | null>(null);
  const {
    encryptUint128,
    connected: cofheConnected,
    ready: cofheReady,
    sessionReady: cofheSessionReady,
    sessionInitializing: cofheSessionInitializing
  } = useCofhe();
  const { connectWallet, ensureEncryptedSession, ensureTargetNetwork, isConnected, isCorrectChain } = useWallet();

  const latestRound = casinoState.crash.latestRound;
  const latestPlayerBet = casinoState.crash.latestPlayerBet;
  const roundId = latestRound?.id?.toString() || "-";
  const roundOpen = Boolean(latestRound && !latestRound.closed);
  const isBetPending = pendingAction === "Place crash bet";
  const isStartPending = pendingAction === "Start crash round";
  const isClosePending = pendingAction === "Close crash round";
  const isSettlePending = pendingAction === "Settle crash bet";
  const actionsBusy = Boolean(pendingAction) || Boolean(walletBlocked);
  const outcomeCard = !isConnected
    ? {
        tone: "idle" as const,
        badge: "Wallet required",
        eyebrow: "Crash result",
        title: "Connect a wallet to track your crash outcome",
        detail: "This card becomes your personal win/loss tracker once you place a crash bet from the connected wallet.",
        metrics: [
          { label: "Round", value: roundId },
          { label: "Status", value: latestRound ? (latestRound.closed ? "Closed" : "Open") : "Idle" }
        ]
      }
    : !latestPlayerBet?.exists
      ? {
          tone: "idle" as const,
          badge: "No bet",
          eyebrow: "Crash result",
          title: "No crash position tracked for this wallet",
          detail: "Place a crash bet and this panel will make the eventual cash-out or loss visible without digging through the logs.",
          metrics: [
            { label: "Round", value: roundId },
            { label: "Auto cash-out", value: `${cashOutMultiplier}x` }
          ]
        }
      : latestPlayerBet.settled
        ? {
            tone: latestPlayerBet.won ? "win" as const : "loss" as const,
            badge: latestPlayerBet.won ? "Won" : "Lost",
            eyebrow: "Your crash result",
            title: latestPlayerBet.won ? "You cashed out before the crash" : "The round crashed before cash-out",
            detail: latestPlayerBet.won
              ? `Your crash position settled successfully for round ${roundId}.`
              : `Your crash position for round ${roundId} was settled as a loss.`,
            metrics: [
              { label: "Round", value: roundId },
              { label: "Auto cash-out", value: formatMultiplier(latestPlayerBet.cashOutMultiplierBps) },
              { label: "Round close", value: latestRound?.closed ? formatMultiplier(latestRound.crashMultiplierBps) : "Pending" }
            ]
          }
        : latestRound?.closed
          ? {
              tone: "pending" as const,
              badge: "Settling",
              eyebrow: "Your crash result",
              title: "Your crash bet is waiting to settle",
              detail: `Round ${roundId} is closed, but your wallet's crash bet still needs final settlement.`,
              metrics: [
                { label: "Round", value: roundId },
                { label: "Auto cash-out", value: formatMultiplier(latestPlayerBet.cashOutMultiplierBps) },
                { label: "Round close", value: formatMultiplier(latestRound.crashMultiplierBps) }
              ]
            }
          : {
              tone: "pending" as const,
              badge: "Live",
              eyebrow: "Your crash result",
              title: "Your crash bet is still live",
              detail: `Round ${roundId} is in progress. This card will flip to win or loss once the round closes and settles.`,
              metrics: [
                { label: "Round", value: roundId },
                { label: "Auto cash-out", value: formatMultiplier(latestPlayerBet.cashOutMultiplierBps) },
                { label: "Round status", value: roundOpen ? "In progress" : "Waiting" }
              ]
            };

  useEffect(() => {
    if (!roundOpen) {
      setDisplayMultiplier(1);
      pointsRef.current = [];
      return;
    }

    let start: number | null = null;

    function tick(timestamp: number) {
      if (start === null) {
        start = timestamp;
      }

      const elapsed = (timestamp - start) / 1000;
      const nextValue = Math.pow(Math.E, 0.12 * elapsed);
      setDisplayMultiplier(nextValue);
      drawCurve(nextValue);
      frameRef.current = window.requestAnimationFrame(tick);
    }

    frameRef.current = window.requestAnimationFrame(tick);

    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, [roundOpen]);

  function drawCurve(multiplier: number) {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const width = canvas.width;
    const height = canvas.height;
    context.clearRect(0, 0, width, height);

    const progress = Math.min((multiplier - 1) / 9, 1);
    const x = progress * width;
    const y = height - progress * height * 0.82;
    pointsRef.current.push({ x, y });

    if (pointsRef.current.length > 180) {
      pointsRef.current.shift();
    }

    if (pointsRef.current.length < 2) {
      return;
    }

    context.beginPath();
    context.moveTo(0, height);
    pointsRef.current.forEach((point) => context.lineTo(point.x, point.y));
    context.strokeStyle = "#1dd3b0";
    context.lineWidth = 3;
    context.shadowColor = "#1dd3b0";
    context.shadowBlur = 14;
    context.stroke();
  }

  async function ensureActionReady(context: string) {
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
      console.warn(`[CleanCrashCard] Failed to prepare wallet action for ${context}.`, error);
      return false;
    }
  }

  async function handlePlaceBet() {
    if (!(await ensureActionReady("place crash bet"))) {
      return;
    }

    await runTransaction("Place crash bet", async (signer) => {
      const crash = new ethers.Contract(CASFIN_CONFIG.addresses.crashGame, ENCRYPTED_CRASH_ABI, signer);
      const currentRoundId = parseRequiredInteger(roundId, "Round id");
      const amountWei = parseRequiredEth(amount, "Crash amount");
      const targetCashOut = parseCashOutMultiplier(cashOutMultiplier);
      const encAmount = await encryptUint128(amountWei);
      return crash.placeBet(currentRoundId, encAmount, targetCashOut);
    });
  }

  return (
    <article className="casino-game-card theme-crash">
      <div className="casino-game-header">
        <div>
          <p className="casino-game-kicker">Crash</p>
          <h3>Set the stake and auto cash-out target, then track the live round from one screen.</h3>
        </div>
        <span className="casino-game-badge">{roundOpen ? "Round open" : "Round closed"}</span>
      </div>

      <div className="crash-stage-card">
        <canvas className="crash-stage-canvas" height="220" ref={canvasRef} width="900" />
        <div className="crash-stage-overlay">
          <strong
            className="crash-multiplier-display"
            style={{
              color: latestRound?.closed
                ? "#f87171"
                : displayMultiplier < 2
                  ? "#4ade80"
                  : displayMultiplier < 5
                    ? "#facc15"
                    : "#f87171",
              textShadow: `0 0 32px ${latestRound?.closed ? "rgba(248,113,113,0.6)" : displayMultiplier < 2 ? "rgba(74,222,128,0.5)" : displayMultiplier < 5 ? "rgba(250,204,21,0.5)" : "rgba(248,113,113,0.6)"}`
            }}
          >
            {latestRound?.closed ? "CRASHED" : `${displayMultiplier.toFixed(2)}x`}
          </strong>
          <span>
            {roundOpen
              ? "Live round in progress"
              : latestRound?.closed
                ? `Closed at ${formatMultiplier(latestRound.crashMultiplierBps)}`
                : "Waiting for the operator to start a round"}
          </span>
        </div>
      </div>

      <div className="casino-crash-grid">
        <div className="casino-field-block">
          <label className="casino-field-label" htmlFor="crash-amount">Stake</label>
          <input
            className="casino-field-input"
            id="crash-amount"
            min="0"
            onChange={(event) => setAmount(event.target.value)}
            step="0.001"
            type="number"
            value={amount}
          />
        </div>

        <div className="casino-field-block">
          <label className="casino-field-label" htmlFor="crash-cashout">Auto cash-out</label>
          <input
            className="casino-field-input"
            id="crash-cashout"
            min="1.1"
            onChange={(event) => setCashOutMultiplier(event.target.value)}
            step="0.1"
            type="number"
            value={cashOutMultiplier}
          />
        </div>

        <button
          className="casino-primary-button"
          disabled={actionsBusy || isBetPending}
          onClick={handlePlaceBet}
          type="button"
        >
          {isBetPending
            ? "Placing bet..."
            : !isConnected
              ? "Connect wallet to play"
              : !isCorrectChain
                ? "Switch to Arbitrum Sepolia"
                : cofheSessionReady
                  ? "Place crash bet"
                  : cofheSessionInitializing
                    ? "Initializing CoFHE..."
                    : !cofheReady
                  ? "Initializing encrypted session"
                  : !cofheConnected
                    ? "Start encrypted session"
                    : "Warming encrypted session"}
        </button>
      </div>

      <CasinoOutcomeCard {...outcomeCard} />

      <div className="casino-status-grid">
        <div className="casino-status-item">
          <span>Round id</span>
          <strong>{roundId}</strong>
        </div>
        <div className="casino-status-item">
          <span>Max cash-out</span>
          <strong>{formatMultiplier(casinoState.crash.maxCashOutMultiplierBps)}</strong>
        </div>
      </div>

      {(isOperator || latestRound) ? (
        <div className="casino-operator-panel">
          {isOperator ? (
            <div className="casino-inline-actions">
              <button
                className="casino-secondary-button"
                disabled={actionsBusy || isStartPending}
                onClick={async () => {
                  if (!(await ensureActionReady("start crash round"))) {
                    return;
                  }

                  await runTransaction("Start crash round", async (signer) => {
                    const crash = new ethers.Contract(CASFIN_CONFIG.addresses.crashGame, ENCRYPTED_CRASH_ABI, signer);
                    return crash.startRound();
                  });
                }}
                type="button"
              >
                {isStartPending ? "Starting..." : "Start round"}
              </button>
              <button
                className="casino-secondary-button"
                disabled={actionsBusy || isClosePending || !latestRound}
                onClick={async () => {
                  if (!(await ensureActionReady("close crash round"))) {
                    return;
                  }

                  await runTransaction("Close crash round", async (signer) => {
                    const crash = new ethers.Contract(CASFIN_CONFIG.addresses.crashGame, ENCRYPTED_CRASH_ABI, signer);
                    return crash.closeRound(parseRequiredInteger(roundId, "Round id"));
                  });
                }}
                type="button"
              >
                {isClosePending ? "Closing..." : "Close round"}
              </button>
            </div>
          ) : null}

          <div className="casino-field-block">
            <label className="casino-field-label" htmlFor="crash-settle-player">Settle player</label>
            <div className="casino-inline-form">
              <input
                className="casino-field-input"
                id="crash-settle-player"
                onChange={(event) => setSettlePlayer(event.target.value)}
                placeholder="0x..."
                type="text"
                value={settlePlayer}
              />
              <button
                className="casino-secondary-button"
                disabled={actionsBusy || isSettlePending || !ethers.isAddress(settlePlayer) || !latestRound}
                onClick={async () => {
                  if (!(await ensureActionReady("settle crash bet"))) {
                    return;
                  }

                  await runTransaction("Settle crash bet", async (signer) => {
                    const crash = new ethers.Contract(CASFIN_CONFIG.addresses.crashGame, ENCRYPTED_CRASH_ABI, signer);
                    return crash.settleBet(parseRequiredInteger(roundId, "Round id"), settlePlayer);
                  });
                }}
                type="button"
              >
                {isSettlePending ? "Settling..." : "Settle bet"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}
