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
interface CardState { rank: number; suit: number; }

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

export default function CleanPokerCard({ casinoState, pendingAction, runTransaction, walletBlocked }) {
  const [amount, setAmount] = useState("0.01");
  const [phase, setPhase] = useState<Phase>("bet");
  const [gameId, setGameId] = useState<bigint | null>(null);
  const [cards, setCards] = useState<Array<CardState | null>>([null, null, null, null, null]);
  const [held, setHeld] = useState([false, false, false, false, false]);
  const [result, setResult] = useState<{ won: boolean; handName: string; multiplier: number } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dealing, setDealing] = useState(false);
  const [cardError, setCardError] = useState("");

  const {
    encryptUint128,
    encryptMultiple,
    decryptForView,
    Encryptable,
    FheTypes,
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

  async function decryptHandles(pokerRead: ethers.Contract, gid: bigint, final: boolean): Promise<CardState[]> {
    const handles: string[] = final
      ? await pokerRead.getFinalCardHandles(gid)
      : await pokerRead.getCardHandles(gid);
    return Promise.all(
      handles.map(async (h) => {
        const cardIndex = Number(await decryptForView(BigInt(h), FheTypes.Uint8));
        return { rank: cardIndex % 13, suit: Math.floor(cardIndex / 13) };
      })
    );
  }

  async function handleDeal() {
    setIsSubmitting(true);
    setCardError("");
    try {
      if (!(await ensureActionReady())) return;

      await runTransaction("Deal poker hand", async (signer: ethers.JsonRpcSigner) => {
        const poker = new ethers.Contract(CASFIN_CONFIG.addresses.pokerGame, ENCRYPTED_VIDEO_POKER_ABI, signer);
        const encAmount = await encryptUint128(parseRequiredEth(amount, "Bet amount"));
        return poker.deal(encAmount);
      });

      const provider = new ethers.JsonRpcProvider(CASFIN_CONFIG.publicRpcUrl);
      const pokerRead = new ethers.Contract(CASFIN_CONFIG.addresses.pokerGame, ENCRYPTED_VIDEO_POKER_ABI, provider);
      const gid: bigint = await pokerRead.latestGameIdByPlayer(account);
      setGameId(gid);

      const dealtCards = await decryptHandles(pokerRead, gid, false);
      setDealing(true);
      setCards(dealtCards);
      setHeld([false, false, false, false, false]);
      setPhase("dealt");
      setTimeout(() => setDealing(false), 800);
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

      await runTransaction("Draw poker cards", async (signer: ethers.JsonRpcSigner) => {
        const poker = new ethers.Contract(CASFIN_CONFIG.addresses.pokerGame, ENCRYPTED_VIDEO_POKER_ABI, signer);
        const encHolds = await encryptMultiple(held.map((h) => Encryptable.bool(h)));
        return poker.draw(gameId, encHolds);
      });

      const provider = new ethers.JsonRpcProvider(CASFIN_CONFIG.publicRpcUrl);
      const pokerRead = new ethers.Contract(CASFIN_CONFIG.addresses.pokerGame, ENCRYPTED_VIDEO_POKER_ABI, provider);
      const finalCards = await decryptHandles(pokerRead, gameId, true);
      setDealing(true);
      setCards(finalCards);
      setTimeout(() => setDealing(false), 800);
      setPhase("waiting");
    } catch (err) {
      console.warn("[CleanPokerCard] Draw failed.", err);
      setCardError("Draw failed — try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCheckResult() {
    if (gameId === null) return;
    try {
      const provider = new ethers.JsonRpcProvider(CASFIN_CONFIG.publicRpcUrl);
      const pokerRead = new ethers.Contract(CASFIN_CONFIG.addresses.pokerGame, ENCRYPTED_VIDEO_POKER_ABI, provider);
      const [, gamePhase, won, multiplier] = await pokerRead.getGame(gameId);
      if (Number(gamePhase) === 4) {
        setResult({ won, handName: HAND_NAMES[Number(multiplier)] ?? "Unknown", multiplier: Number(multiplier) });
        setPhase("result");
      }
    } catch (err) {
      console.warn("[CleanPokerCard] Check result failed.", err);
    }
  }

  function handleNewGame() {
    setPhase("bet");
    setGameId(null);
    setCards([null, null, null, null, null]);
    setHeld([false, false, false, false, false]);
    setResult(null);
    setCardError("");
  }

  const isPending = pendingAction === "Deal poker hand" || pendingAction === "Draw poker cards" || isSubmitting;
  const actionsBusy = Boolean(pendingAction) || Boolean(walletBlocked);

  const outcomeCard = result
    ? {
        tone: result.won ? "win" as const : "loss" as const,
        badge: result.won ? "Won" : "Lost",
        eyebrow: "Hand Result",
        title: result.won ? `${result.handName}!` : "No winning hand",
        detail: result.won
          ? `Your hand paid out ${result.multiplier}x your bet (minus 2% house edge).`
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
          title: "Waiting for keeper resolution",
          detail: "The keeper will finalize your hand on-chain. Check back shortly.",
          metrics: [{ label: "Game ID", value: gameId?.toString() ?? "..." }]
        }
      : {
          tone: "idle" as const,
          badge: "Ready",
          eyebrow: "Outcome",
          title: "Your next hand will land here",
          detail: "Deal a hand, hold your best cards, then draw replacements.",
          metrics: []
        };

  return (
    <article className="casino-game-card theme-poker">
      <div className="casino-game-header">
        <div>
          <p className="casino-game-kicker">Video Poker</p>
          <h3>{phase === "dealt" ? "Select cards to hold · then Draw" : phase === "waiting" ? "Waiting for keeper resolution" : "Jacks or Better — hold cards and draw replacements."}</h3>
        </div>
        <span className="casino-game-badge">{phase === "dealt" ? "Select & Draw" : "Up to 250x"}</span>
      </div>

      {/* Card area — always visible */}
      <div className="poker-table-area">
        <div className="poker-hand">
          {(phase === "bet" ? [null, null, null, null, null] : cards).map((card, i) => (
            <PokerCardDisplay
              key={i}
              index={i}
              dealing={dealing}
              faceDown={phase === "bet" || card === null}
              rank={card?.rank}
              suit={card?.suit}
              held={held[i]}
              disabled={phase !== "dealt" || actionsBusy}
              onClick={() => {
                if (phase !== "dealt") return;
                setHeld((prev) => { const next = [...prev]; next[i] = !next[i]; return next; });
              }}
            />
          ))}
        </div>
        {phase === "bet" && (
          <p className="poker-table-hint">Deal to reveal your hand</p>
        )}
        {phase === "dealt" && (
          <p className="poker-table-hint">Tap cards to hold · then Draw</p>
        )}
        {phase === "waiting" && (
          <p className="poker-table-hint poker-table-hint--resolving">Resolving hand<span className="dot-anim">...</span></p>
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
            <div className="payout-strip-header">
              <span>Hand</span>
              <span>Pays</span>
            </div>
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

      {cardError ? (
        <p className="poker-error-msg">{cardError}</p>
      ) : null}

      {/* Action buttons */}
      {phase === "bet" && (
        <button className="casino-primary-button" disabled={actionsBusy || isSubmitting} onClick={() => void handleDeal()} type="button">
          {isPending         ? "Dealing..."
            : !isConnected   ? "Connect wallet to play"
            : !isCorrectChain? "Switch to Arbitrum Sepolia"
            : cofheSessionReady        ? "Deal Hand"
            : cofheSessionInitializing ? "Initializing CoFHE..."
            : !cofheReady              ? "Initializing encrypted session"
            : !cofheConnected          ? "Start encrypted session"
            :                           "Warming encrypted session"}
        </button>
      )}

      {phase === "dealt" && (
        <button className="casino-primary-button" disabled={actionsBusy || isSubmitting} onClick={() => void handleDraw()} type="button">
          {isPending ? "Drawing..." : "Draw Cards"}
        </button>
      )}

      {phase === "waiting" && (
        <button className="casino-primary-button" onClick={() => void handleCheckResult()} type="button">
          Check Result
        </button>
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
        <div className="casino-status-item"><span>Settlement</span><strong>Keeper-driven</strong></div>
        <div className="casino-status-item">
          <span>Phase</span>
          <strong style={{ textTransform: "capitalize" }}>{phase}</strong>
        </div>
      </div>
    </article>
  );
}
