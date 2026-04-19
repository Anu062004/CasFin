"use client";

import { useState } from "react";
import { ethers } from "ethers";
import { useWallet } from "@/components/WalletProvider";
import CasinoOutcomeCard from "@/components/casino/CasinoOutcomeCard";
import PokerCardDisplay from "@/components/casino/PokerCardDisplay";
import { CASFIN_CONFIG } from "@/lib/casfin-config";
import { ENCRYPTED_VIDEO_POKER_ABI } from "@/lib/casfin-abis";
import { parseRequiredEth } from "@/lib/casfin-client";
import { useCofhe } from "@/lib/cofhe-provider";

type Phase = "bet" | "dealt" | "waiting" | "result";

const PRESETS = ["0.001", "0.005", "0.01", "0.05"];

const HAND_NAMES: Record<number, string> = {
  250: "Royal Flush", 50: "Straight Flush", 25: "Four of a Kind",
  9: "Full House", 6: "Flush", 4: "Straight", 3: "Three of a Kind",
  2: "Two Pair", 1: "Jacks or Better", 0: "No Hand"
};

const PAYOUT_TABLE = [
  { hand: "Royal Flush",      payout: "250x", highlight: true },
  { hand: "Straight Flush",   payout: "50x",  highlight: true },
  { hand: "Four of a Kind",   payout: "25x",  highlight: false },
  { hand: "Full House",       payout: "9x",   highlight: false },
  { hand: "Flush",            payout: "6x",   highlight: false },
  { hand: "Straight",         payout: "4x",   highlight: false },
  { hand: "Three of a Kind",  payout: "3x",   highlight: false },
  { hand: "Two Pair",         payout: "2x",   highlight: false },
  { hand: "Jacks or Better",  payout: "1x",   highlight: false }
];

export default function CleanPokerCard({ casinoState, isOperator, pendingAction, runTransaction, walletBlocked }) {
  const [amount, setAmount] = useState("0.01");
  const [phase, setPhase] = useState<Phase>("bet");
  const [gameId, setGameId] = useState<bigint | null>(null);
  const [held, setHeld] = useState([false, false, false, false, false]);
  const [result, setResult] = useState<{ won: boolean; handName: string; multiplier: number } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cardError, setCardError] = useState("");

  const {
    encryptUint128,
    encryptMultiple,
    Encryptable,
    connected: cofheConnected,
    ready: cofheReady,
    sessionReady: cofheSessionReady,
    sessionInitializing: cofheSessionInitializing
  } = useCofhe();

  const {
    account,
    connectWallet,
    ensureEncryptedSession,
    ensureTargetNetwork,
    isConnected,
    isCorrectChain
  } = useWallet();

  function applyPreset(preset: string) {
    if (preset === "0.5x") { setAmount((c) => String((parseFloat(c || "0") / 2).toFixed(4))); return; }
    if (preset === "2x")   { setAmount((c) => String((parseFloat(c || "0") * 2).toFixed(4))); return; }
    setAmount(preset);
  }

  async function ensureActionReady() {
    try {
      if (!isConnected)    { await connectWallet();        return false; }
      if (!isCorrectChain) { await ensureTargetNetwork();  return false; }
      await ensureEncryptedSession();
      return true;
    } catch (err) {
      console.warn("[CleanPokerCard] Action prep failed.", err);
      return false;
    }
  }

  function getReadContract() {
    const provider = new ethers.JsonRpcProvider(CASFIN_CONFIG.publicRpcUrl);
    return new ethers.Contract(CASFIN_CONFIG.addresses.pokerGame, ENCRYPTED_VIDEO_POKER_ABI, provider);
  }

  async function handleDeal() {
    setIsSubmitting(true);
    setCardError("");
    try {
      if (!(await ensureActionReady())) return;

      const ok = await runTransaction("Deal poker hand", async (signer: ethers.JsonRpcSigner) => {
        const poker = new ethers.Contract(CASFIN_CONFIG.addresses.pokerGame, ENCRYPTED_VIDEO_POKER_ABI, signer);
        const encAmount = await encryptUint128(parseRequiredEth(amount, "Bet amount"));
        return poker.deal(encAmount);
      });

      if (!ok) return;

      const pokerRead = getReadContract();
      const gid: bigint = await pokerRead.latestGameIdByPlayer(account);
      setGameId(gid);
      setHeld([false, false, false, false, false]);
      setResult(null);
      setPhase("dealt");
    } catch (err) {
      console.warn("[CleanPokerCard] Deal failed.", err);
      setCardError("Deal failed — check your bet amount and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDraw() {
    if (gameId === null) return;
    setIsSubmitting(true);
    setCardError("");
    try {
      if (!(await ensureActionReady())) return;

      const ok = await runTransaction("Draw poker cards", async (signer: ethers.JsonRpcSigner) => {
        const poker = new ethers.Contract(CASFIN_CONFIG.addresses.pokerGame, ENCRYPTED_VIDEO_POKER_ABI, signer);
        const encHolds = await encryptMultiple(held.map((h) => Encryptable.bool(h)));
        return poker.draw(gameId, encHolds);
      });

      if (!ok) return;

      setPhase("waiting");
    } catch (err) {
      console.warn("[CleanPokerCard] Draw failed.", err);
      setCardError("Draw failed — try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRequestResolution() {
    if (gameId === null) return;
    setCardError("");
    await runTransaction("Request resolution", async (signer) => {
      const poker = new ethers.Contract(CASFIN_CONFIG.addresses.pokerGame, ENCRYPTED_VIDEO_POKER_ABI, signer);
      return poker.requestResolution(gameId);
    });
  }

  async function handleFinalizeResolution() {
    if (gameId === null) return;
    setCardError("");
    const ok = await runTransaction("Finalize resolution", async (signer) => {
      const poker = new ethers.Contract(CASFIN_CONFIG.addresses.pokerGame, ENCRYPTED_VIDEO_POKER_ABI, signer);
      return poker.finalizeResolution(gameId);
    });
    if (ok) {
      await handleCheckResult();
    }
  }

  async function handleCheckResult() {
    if (gameId === null) return;
    try {
      const pokerRead = getReadContract();
      const [, gamePhase, won, multiplier] = await pokerRead.getGame(gameId);
      const phaseNum = Number(gamePhase);
      if (phaseNum === 4) {
        setResult({ won, handName: HAND_NAMES[Number(multiplier)] ?? "Unknown", multiplier: Number(multiplier) });
        setPhase("result");
      } else {
        const phaseNames = ["None", "Dealt", "Drawn", "Resolution Pending", "Resolved"];
        setCardError(`Game is in phase: ${phaseNames[phaseNum] ?? phaseNum}. ${phaseNum === 3 ? "Waiting for FHE decrypt — try Finalize Resolution." : phaseNum < 3 ? "Draw first." : "Not yet resolved."}`);
      }
    } catch (err) {
      console.warn("[CleanPokerCard] Check result failed.", err);
      setCardError("Could not read result — try again.");
    }
  }

  function handleNewGame() {
    setPhase("bet");
    setGameId(null);
    setHeld([false, false, false, false, false]);
    setResult(null);
    setCardError("");
  }

  const isPending = pendingAction === "Deal poker hand" || pendingAction === "Draw poker cards" ||
    pendingAction === "Request resolution" || pendingAction === "Finalize resolution" || isSubmitting;
  const actionsBusy = Boolean(pendingAction) || Boolean(walletBlocked);

  const outcomeCard = result
    ? {
        tone: result.won ? "win" as const : "loss" as const,
        badge: result.won ? "Won" : "Lost",
        eyebrow: "Hand Result",
        title: result.won ? `${result.handName}!` : "No winning hand",
        detail: result.won
          ? `Your hand paid out ${result.multiplier}x your bet (minus house edge).`
          : "Better luck next time.",
        metrics: [
          { label: "Hand",       value: result.handName },
          { label: "Multiplier", value: result.multiplier > 0 ? `${result.multiplier}x` : "0x" }
        ]
      }
    : phase === "waiting"
      ? {
          tone: "pending" as const,
          badge: "Settling",
          eyebrow: "Outcome",
          title: "Waiting for on-chain resolution",
          detail: isOperator
            ? "Click Request Resolution, wait ~10 seconds for FHE decryption, then Finalize Resolution."
            : "The operator will resolve your game. Click Check Result once complete.",
          metrics: [{ label: "Game ID", value: gameId?.toString() ?? "..." }]
        }
      : {
          tone: "idle" as const,
          badge: "Ready",
          eyebrow: "Outcome",
          title: "Your next hand will land here",
          detail: "Deal a hand, hold your best positions, then draw replacements.",
          metrics: []
        };

  return (
    <article className="casino-game-card theme-poker">
      <div className="casino-game-header">
        <div>
          <p className="casino-game-kicker">Video Poker</p>
          <h3>
            {phase === "dealt"
              ? "Select positions to hold · then Draw"
              : phase === "waiting"
                ? "Waiting for resolution"
                : "Jacks or Better — hold cards and draw replacements."}
          </h3>
        </div>
        <span className="casino-game-badge">{phase === "dealt" ? "Select & Draw" : "Up to 250x"}</span>
      </div>

      {/* Card area — always visible */}
      <div className="poker-table-area">
        <div className="poker-hand">
          {[0, 1, 2, 3, 4].map((i) => (
            <PokerCardDisplay
              key={i}
              index={i}
              dealing={false}
              faceDown={true}
              held={phase === "dealt" && held[i]}
              disabled={phase !== "dealt" || actionsBusy}
              onClick={() => {
                if (phase !== "dealt") return;
                setHeld((prev) => { const next = [...prev]; next[i] = !next[i]; return next; });
              }}
            />
          ))}
        </div>
        {phase === "bet" && <p className="poker-table-hint">Deal to start your hand</p>}
        {phase === "dealt" && <p className="poker-table-hint">Tap cards to hold · then Draw</p>}
        {phase === "waiting" && (
          <p className="poker-table-hint poker-table-hint--resolving">
            Resolving hand<span className="dot-anim">...</span>
          </p>
        )}
        {phase === "result" && (
          <p className="poker-table-hint">{result?.won ? "You won!" : "Better luck next time"}</p>
        )}
      </div>

      {/* Bet phase: amount + payout strip */}
      {phase === "bet" && (
        <>
          <div className="casino-field-block">
            <label className="casino-field-label" htmlFor="poker-amount">Bet amount</label>
            <input
              className="casino-field-input"
              id="poker-amount"
              min="0"
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.01"
              step="0.001"
              type="number"
              value={amount}
            />
            <div className="casino-chip-row">
              {PRESETS.map((p) => (
                <button className="casino-chip-button" key={p} onClick={() => applyPreset(p)} type="button">{p}</button>
              ))}
              <button className="casino-chip-button" onClick={() => applyPreset("0.5x")} type="button">0.5x</button>
              <button className="casino-chip-button" onClick={() => applyPreset("2x")} type="button">2x</button>
            </div>
          </div>

          <div className="poker-payout-strip">
            <div className="payout-strip-header"><span>Hand</span><span>Pays</span></div>
            {PAYOUT_TABLE.map(({ hand, payout, highlight }) => (
              <div key={hand} className={`payout-strip-row${highlight ? " is-jackpot" : ""}`}>
                <span className="payout-strip-hand">{hand}</span>
                <span className="payout-strip-dots" />
                <span className="payout-strip-value">{payout}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {cardError ? <p className="poker-error-msg">{cardError}</p> : null}

      {/* Action buttons */}
      {phase === "bet" && (
        <button
          className="casino-primary-button"
          disabled={actionsBusy || isSubmitting || (isConnected && isCorrectChain && !cofheSessionReady)}
          onClick={() => void handleDeal()}
          type="button"
        >
          {isPending            ? "Dealing..."
            : !isConnected      ? "Connect wallet to play"
            : !isCorrectChain   ? "Switch to Arbitrum Sepolia"
            : cofheSessionReady         ? "Deal Hand"
            : cofheSessionInitializing  ? "Initializing CoFHE..."
            : !cofheReady               ? "Initializing encrypted session"
            : !cofheConnected           ? "Start encrypted session"
            :                             "Warming encrypted session"}
        </button>
      )}

      {phase === "dealt" && (
        <button
          className="casino-primary-button"
          disabled={actionsBusy || isSubmitting}
          onClick={() => void handleDraw()}
          type="button"
        >
          {isPending ? "Drawing..." : `Draw ${held.filter(Boolean).length === 0 ? "all 5" : `(hold ${held.filter(Boolean).length})`}`}
        </button>
      )}

      {phase === "waiting" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {isOperator && (
            <div className="casino-inline-actions">
              <button
                className="casino-secondary-button"
                disabled={actionsBusy}
                onClick={() => void handleRequestResolution()}
                type="button"
              >
                {pendingAction === "Request resolution" ? "Requesting..." : "Request Resolution"}
              </button>
              <button
                className="casino-secondary-button"
                disabled={actionsBusy}
                onClick={() => void handleFinalizeResolution()}
                type="button"
              >
                {pendingAction === "Finalize resolution" ? "Finalizing..." : "Finalize Resolution"}
              </button>
            </div>
          )}
          <button
            className="casino-primary-button"
            disabled={actionsBusy}
            onClick={() => void handleCheckResult()}
            type="button"
          >
            Check Result
          </button>
        </div>
      )}

      {phase === "result" && (
        <button className="casino-primary-button" onClick={handleNewGame} type="button">
          New Game
        </button>
      )}

      {(phase === "waiting" || phase === "result") && (
        <CasinoOutcomeCard {...outcomeCard} />
      )}

      <div className="casino-status-grid">
        <div className="casino-status-item">
          <span>Game ID</span>
          <strong>{gameId !== null ? gameId.toString() : "—"}</strong>
        </div>
        <div className="casino-status-item">
          <span>Phase</span>
          <strong style={{ textTransform: "capitalize" }}>{phase}</strong>
        </div>
      </div>
    </article>
  );
}
