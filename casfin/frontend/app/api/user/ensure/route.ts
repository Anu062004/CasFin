import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const wallet = body?.wallet?.toLowerCase();

    if (!wallet || !/^0x[0-9a-f]{40}$/i.test(wallet)) {
      return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
    }

    const user = await prisma.user.upsert({
      where: { walletAddress: wallet },
      update: { lastActiveAt: new Date() },
      create: { walletAddress: wallet },
      select: {
        walletAddress: true,
        displayName: true,
        firstSeenAt: true,
        lastActiveAt: true,
      },
    });

    return NextResponse.json(user);
  } catch (err) {
    console.error("POST /api/user/ensure error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
