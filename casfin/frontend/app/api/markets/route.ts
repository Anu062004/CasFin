import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const url = req.nextUrl.searchParams;
    const status = url.get("status") || "all";
    const creator = url.get("creator")?.toLowerCase();
    const page = Math.max(1, Number(url.get("page")) || 1);
    const limit = Math.min(100, Math.max(1, Number(url.get("limit")) || 10));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (creator) where.creatorAddress = creator;
    if (status === "active") where.resolved = false;
    else if (status === "resolved") where.resolved = true;

    const [markets, total] = await Promise.all([
      prisma.predictionMarket.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.predictionMarket.count({ where }),
    ]);

    return NextResponse.json({
      markets: markets.map((m) => ({
        ...m,
        blockNumber: m.blockNumber?.toString() ?? null,
      })),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("GET /api/markets error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
