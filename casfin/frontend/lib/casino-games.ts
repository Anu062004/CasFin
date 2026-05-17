import { CASFIN_CONFIG } from "@/lib/casfin-config";

export const CASINO_GAMES = [
  {
    slug: "coin-toss",
    label: "Coin Toss",
    shortLabel: "CT",
    kicker: "Binary odds",
    summary: "Pick heads or tails and settle through the encrypted keeper flow.",
    multiplier: "1.96x",
    contractAddress: CASFIN_CONFIG.addresses.coinFlipGame
  },
  {
    slug: "dice",
    label: "Dice",
    shortLabel: "D6",
    kicker: "Number pick",
    summary: "Choose a face, send an encrypted stake, and resolve against on-chain randomness.",
    multiplier: "6.00x",
    contractAddress: CASFIN_CONFIG.addresses.diceGame
  },
  {
    slug: "crash",
    label: "Crash",
    shortLabel: "CR",
    kicker: "Round game",
    summary: "Auto cash out against a live multiplier curve with keeper-based encrypted settlement.",
    multiplier: "Variable",
    contractAddress: CASFIN_CONFIG.addresses.crashGame
  },
  {
    slug: "poker",
    label: "Video Poker",
    shortLabel: "VP",
    kicker: "Draw game",
    summary: "Deal, hold, and draw on a private Jacks or Better rail with encrypted outcomes.",
    multiplier: "Up to 250x",
    contractAddress: CASFIN_CONFIG.addresses.pokerGame
  }
] as const;

export type CasinoGameSlug = (typeof CASINO_GAMES)[number]["slug"];

export function isCasinoGameSlug(value: string): value is CasinoGameSlug {
  return CASINO_GAMES.some((game) => game.slug === value);
}

export function getCasinoGameMeta(slug: CasinoGameSlug) {
  const match = CASINO_GAMES.find((game) => game.slug === slug);
  if (!match) {
    throw new Error(`Unknown casino game slug: ${slug}`);
  }

  return match;
}
