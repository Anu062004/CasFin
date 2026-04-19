import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params;
    const addr = address.toLowerCase();

    const market = await prisma.predictionMarket.findUnique({
      where: { onChainAddress: addr },
      include: {
        positions: { orderBy: { updatedAt: "desc" } },
        trades: { orderBy: { createdAt: "desc" }, take: 50 },
      },
    });

    if (!market) {
      return NextResponse.json({ error: "Market not found" }, { status: 404 });
    }

    return NextResponse.json({
      ...market,
      blockNumber: market.blockNumber?.toString() ?? null,
      trades: market.trades.map((t) => ({
        ...t,
        blockNumber: t.blockNumber?.toString() ?? null,
      })),
    });
  } catch (err) {
    console.error("GET /api/markets/[address] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
