import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { GameType } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const url = req.nextUrl.searchParams;
    const player = url.get("player")?.toLowerCase();
    const game = url.get("game") as GameType | null;
    const page = Math.max(1, Number(url.get("page")) || 1);
    const limit = Math.min(100, Math.max(1, Number(url.get("limit")) || 20));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (player) where.playerAddress = player;
    if (game && Object.values(GameType).includes(game)) where.gameType = game;

    const [bets, total] = await Promise.all([
      prisma.casinoBet.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.casinoBet.count({ where }),
    ]);

    return NextResponse.json({
      bets: bets.map((b) => ({
        ...b,
        onChainBetId: b.onChainBetId.toString(),
        blockNumber: b.blockNumber?.toString() ?? null,
        crashRoundId: b.crashRoundId?.toString() ?? null,
      })),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("GET /api/bets error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
