"use client";

import Link from "next/link";
import { CASINO_GAMES, type CasinoGameSlug } from "@/lib/casino-games";

interface Props {
  activeGame: CasinoGameSlug;
}

export default function GameTabs({ activeGame }: Props) {
  return (
    <div className="game-tab-strip">
      <div className="game-tab-scroller">
        {CASINO_GAMES.map((game) => (
          <Link
            className={`game-tab-pill ${activeGame === game.slug ? "is-active" : ""}`}
            href={`/casino/${game.slug}`}
            key={game.slug}
          >
            <span className="game-tab-mark" aria-hidden="true">{game.shortLabel}</span>
            <span className="game-tab-copy">
              <strong>{game.label}</strong>
              <span>{game.kicker}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
