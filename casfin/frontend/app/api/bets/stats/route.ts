import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { GameType } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const player = req.nextUrl.searchParams.get("player")?.toLowerCase();
    if (!player) {
      return NextResponse.json({ error: "player query param required" }, { status: 400 });
    }

    const bets = await prisma.casinoBet.findMany({
      where: { playerAddress: player },
      select: {
        gameType: true,
        won: true,
        betAmountWei: true,
        payoutWei: true,
        resolved: true,
      },
    });

    const perGame: Record<string, { total: number; wins: number; volume: bigint; biggestWin: bigint }> = {};
    let totalBets = 0;
    let totalWins = 0;
    let totalVolume = 0n;
    let biggestWin = 0n;

    for (const bet of bets) {
      totalBets++;
      const vol = BigInt(bet.betAmountWei || "0");
      totalVolume += vol;

      if (!perGame[bet.gameType]) {
        perGame[bet.gameType] = { total: 0, wins: 0, volume: 0n, biggestWin: 0n };
      }
      perGame[bet.gameType].total++;
      perGame[bet.gameType].volume += vol;

      if (bet.resolved && bet.won) {
        totalWins++;
        perGame[bet.gameType].wins++;
        const payout = BigInt(bet.payoutWei || "0");
        if (payout > biggestWin) biggestWin = payout;
        if (payout > perGame[bet.gameType].biggestWin) {
          perGame[bet.gameType].biggestWin = payout;
        }
      }
    }

    const gameStats: Record<string, object> = {};
    for (const [game, s] of Object.entries(perGame)) {
      gameStats[game] = {
        totalBets: s.total,
        wins: s.wins,
        winRate: s.total > 0 ? +(s.wins / s.total).toFixed(4) : 0,
        volumeWei: s.volume.toString(),
        biggestWinWei: s.biggestWin.toString(),
      };
    }

    return NextResponse.json({
      player,
      totalBets,
      totalWins,
      winRate: totalBets > 0 ? +(totalWins / totalBets).toFixed(4) : 0,
      totalVolumeWei: totalVolume.toString(),
      biggestWinWei: biggestWin.toString(),
      perGame: gameStats,
    });
  } catch (err) {
    console.error("GET /api/bets/stats error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
