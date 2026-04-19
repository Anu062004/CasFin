"use client";

const RANK_LABELS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const SUIT_SYMBOLS = ["♣", "♦", "♥", "♠"];

interface PokerCardDisplayProps {
  rank?: number;
  suit?: number;
  faceDown?: boolean;
  held?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}

export default function PokerCardDisplay({
  rank,
  suit,
  faceDown = false,
  held = false,
  onClick,
  disabled = false
}: PokerCardDisplayProps) {
  const isRed = suit === 1 || suit === 2;

  let className = "poker-card";
  if (faceDown) className += " face-down";
  if (held) className += " is-held";

  return (
    <button
      className={className}
      disabled={disabled || faceDown}
      onClick={onClick}
      type="button"
    >
      {!faceDown && rank !== undefined && suit !== undefined ? (
        <>
          <span className="poker-card-rank" style={{ color: isRed ? "#ef4444" : "rgba(255,255,255,0.9)" }}>
            {RANK_LABELS[rank]}
          </span>
          <span className={`poker-card-suit ${isRed ? "is-red" : "is-black"}`}>
            {SUIT_SYMBOLS[suit]}
          </span>
        </>
      ) : null}
    </button>
  );
}
