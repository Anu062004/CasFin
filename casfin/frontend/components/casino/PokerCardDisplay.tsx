"use client";

const RANK_LABELS = ["2","3","4","5","6","7","8","9","10","J","Q","K","A"];
const SUIT_SYMBOLS = ["♣","♦","♥","♠"];

interface Props {
  rank?: number;
  suit?: number;
  faceDown?: boolean;
  held?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  dealing?: boolean;
  index?: number;
}

export default function PokerCardDisplay({
  rank,
  suit,
  faceDown = false,
  held = false,
  onClick,
  disabled = false,
  dealing = false,
  index = 0
}: Props) {
  const isRed = suit === 1 || suit === 2;
  const colorClass = isRed ? "is-red" : "is-black";

  const classes = [
    "poker-card",
    colorClass,
    held ? "is-held" : "",
    dealing ? "is-dealing" : "",
    faceDown ? "is-face-down" : ""
  ].filter(Boolean).join(" ");

  return (
    <div className="poker-card-wrapper">
      <button
        className={classes}
        disabled={disabled || faceDown}
        onClick={onClick}
        style={{ "--deal-delay": `${index * 120}ms` } as React.CSSProperties}
        type="button"
      >
        {faceDown ? (
          <div className="poker-card-back">
            <div className="poker-card-back-pattern" />
          </div>
        ) : (
          <div className="poker-card-face">
            {rank !== undefined && suit !== undefined ? (
              <>
                <div className="poker-card-corner top-left">
                  <span className="corner-rank">{RANK_LABELS[rank]}</span>
                  <span className="corner-suit">{SUIT_SYMBOLS[suit]}</span>
                </div>
                <div className="poker-card-center">
                  {rank >= 9 && rank <= 11 ? (
                    <span className="face-card-icon">
                      {rank === 9 ? "⚔" : rank === 10 ? "👑" : "🗡"}
                    </span>
                  ) : rank === 12 ? (
                    <span className="ace-suit">{SUIT_SYMBOLS[suit]}</span>
                  ) : (
                    <span className="number-suit">{SUIT_SYMBOLS[suit]}</span>
                  )}
                </div>
                <div className="poker-card-corner bottom-right">
                  <span className="corner-rank">{RANK_LABELS[rank]}</span>
                  <span className="corner-suit">{SUIT_SYMBOLS[suit]}</span>
                </div>
              </>
            ) : null}
          </div>
        )}
      </button>
      {held && <span className="poker-hold-badge">HOLD</span>}
    </div>
  );
}
