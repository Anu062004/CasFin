import type { NonceManager, ContractTransactionResponse } from "ethers";

const ethers = require("ethers") as typeof import("ethers");
const encryptedMarketResolverAbi = require("../frontend/lib/generated-abis/EncryptedMarketResolver.json") as readonly string[];

// NBA: {visitor_full_name} @ {home_full_name} — Who wins? ({YYYY-MM-DD})
const SPORTS_QUESTION_RE = /^NBA: (.+?) @ (.+?) — Who wins\? \((\d{4}-\d{2}-\d{2})\)$/;

const BALLDONTLIE_BASE = "https://api.balldontlie.io/v1";

interface BallDontLieGame {
  id: number;
  status: string;
  home_team: { full_name: string };
  visitor_team: { full_name: string };
  home_team_score: number;
  visitor_team_score: number;
}

function apiKey(): string {
  return process.env.BALLDONTLIE_API_KEY || "";
}

async function fetchGames(dateStr: string): Promise<BallDontLieGame[]> {
  const url = `${BALLDONTLIE_BASE}/games?dates[]=${dateStr}`;
  const resp = await fetch(url, {
    headers: { Authorization: apiKey() },
  });
  if (!resp.ok) {
    throw new Error(`BallDontLie API error ${resp.status} for ${dateStr}`);
  }
  const body = await resp.json() as { data?: BallDontLieGame[] };
  return body.data || [];
}

/**
 * Attempts to resolve a sports market by looking up the game result.
 *
 * Returns true if resolution was submitted, false if the game is not yet final
 * or the question doesn't match the sports format.
 */
export async function trySportsResolve(
  marketAddress: string,
  resolverAddress: string,
  question: string,
  signer: NonceManager
): Promise<boolean> {
  const match = question.match(SPORTS_QUESTION_RE);
  if (!match) {
    return false;
  }

  const [, visitorFullName, homeFullName, dateStr] = match;

  let games: BallDontLieGame[];
  try {
    games = await fetchGames(dateStr);
  } catch (err) {
    console.warn(`[Sports] BallDontLie fetch failed for ${dateStr}: ${err}`);
    return false;
  }

  const game = games.find(
    (g) =>
      g.home_team.full_name === homeFullName &&
      g.visitor_team.full_name === visitorFullName
  );

  if (!game) {
    console.log(`[Sports] no game match for visitor="${visitorFullName}" home="${homeFullName}" date=${dateStr}`);
    return false;
  }

  if (game.status !== "Final") {
    console.log(`[Sports] market=${marketAddress} game not final yet (status=${game.status})`);
    return false;
  }

  // outcome 0 = visitor (away), outcome 1 = home — matches sports/page.tsx
  const winningOutcome: number =
    game.visitor_team_score > game.home_team_score ? 0 : 1;
  const winnerName = winningOutcome === 0 ? visitorFullName : homeFullName;

  const resolver = new ethers.Contract(resolverAddress, encryptedMarketResolverAbi, signer) as
    import("ethers").Contract & { resolveManual(outcome: number): Promise<ContractTransactionResponse> };

  console.log(`[Sports] resolving market=${marketAddress} winner=${winnerName} (outcome=${winningOutcome})`);
  const tx = await resolver.resolveManual(winningOutcome);
  console.log(`[Sports] resolveManual tx=${tx.hash}`);
  await tx.wait();
  console.log(`[Sports] market=${marketAddress} resolved`);
  return true;
}
