import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { GameType } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const url = req.nextUrl.searchParams;
    const game = url.get("game") || "ALL";
    const period = url.get("period") || "all";

    const where: Record<string, unknown> = { resolved: true };

    if (game !== "ALL" && Object.values(GameType).includes(game as GameType)) {
      where.gameType = game;
    }

    if (period !== "all") {
      const now = new Date();
      const ms: Record<string, number> = {
        "24h": 24 * 60 * 60 * 1000,
        "7d": 7 * 24 * 60 * 60 * 1000,
        "30d": 30 * 24 * 60 * 60 * 1000,
      };
      if (ms[period]) {
        where.resolvedAt = { gte: new Date(now.getTime() - ms[period]) };
      }
    }

    const bets = await prisma.casinoBet.findMany({
      where,
      select: {
        playerAddress: true,
        betAmountWei: true,
        payoutWei: true,
        won: true,
      },
    });

    // Aggregate profit per player
    const board: Record<string, { profit: bigint; bets: number; wins: number }> = {};
    for (const bet of bets) {
      if (!board[bet.playerAddress]) {
        board[bet.playerAddress] = { profit: 0n, bets: 0, wins: 0 };
      }
      const entry = board[bet.playerAddress];
      const wagered = BigInt(bet.betAmountWei || "0");
      const payout = BigInt(bet.payoutWei || "0");
      entry.profit += payout - wagered;
      entry.bets++;
      if (bet.won) entry.wins++;
    }

    const sorted = Object.entries(board)
      .map(([player, s]) => ({
        player,
        profitWei: s.profit.toString(),
        totalBets: s.bets,
        wins: s.wins,
        winRate: s.bets > 0 ? +(s.wins / s.bets).toFixed(4) : 0,
      }))
      .sort((a, b) => {
        const pa = BigInt(a.profitWei);
        const pb = BigInt(b.profitWei);
        return pa > pb ? -1 : pa < pb ? 1 : 0;
      })
      .slice(0, 20);

    return NextResponse.json({ game, period, leaderboard: sorted });
  } catch (err) {
    console.error("GET /api/leaderboard error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
