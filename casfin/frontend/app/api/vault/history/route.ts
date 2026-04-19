import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const url = req.nextUrl.searchParams;
    const player = url.get("player")?.toLowerCase();
    if (!player) {
      return NextResponse.json({ error: "player query param required" }, { status: 400 });
    }

    const page = Math.max(1, Number(url.get("page")) || 1);
    const limit = Math.min(100, Math.max(1, Number(url.get("limit")) || 20));
    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      prisma.vaultTransaction.findMany({
        where: { playerAddress: player },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.vaultTransaction.count({ where: { playerAddress: player } }),
    ]);

    return NextResponse.json({
      transactions: transactions.map((t) => ({
        ...t,
        blockNumber: t.blockNumber?.toString() ?? null,
      })),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("GET /api/vault/history error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
