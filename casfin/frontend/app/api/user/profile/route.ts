import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { prisma } from "@/lib/db";

const NAME_RE = /^[a-zA-Z0-9 ]{1,24}$/;
const WALLET_RE = /^0x[0-9a-f]{40}$/i;

export async function GET(req: NextRequest) {
  try {
    const wallet = req.nextUrl.searchParams.get("wallet")?.toLowerCase();
    if (!wallet || !WALLET_RE.test(wallet)) {
      return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
    }

    const [user, bets] = await Promise.all([
      prisma.user.upsert({
        where: { walletAddress: wallet },
        update: { lastActiveAt: new Date() },
        create: { walletAddress: wallet },
        select: { walletAddress: true, displayName: true, firstSeenAt: true, lastActiveAt: true },
      }),
      prisma.casinoBet.findMany({
        where: { playerAddress: wallet },
        select: { resolved: true, won: true, payoutWei: true },
      }),
    ]);

    const totalBets = bets.length;
    const totalWins = bets.filter((b) => b.resolved && b.won).length;
    const biggestWin = bets.reduce((max, b) => {
      if (!b.won || !b.payoutWei) return max;
      const payout = BigInt(b.payoutWei);
      return payout > max ? payout : max;
    }, 0n);

    return NextResponse.json({
      ...user,
      stats: {
        totalBets,
        totalWins,
        winRate: totalBets > 0 ? +(totalWins / totalBets).toFixed(4) : 0,
        biggestWinWei: biggestWin.toString(),
      },
    });
  } catch (err) {
    console.error("GET /api/user/profile error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const wallet = body?.wallet?.toLowerCase();
    const displayName: string | null = typeof body?.displayName === "string" ? body.displayName.trim() : null;
    const signature: string = body?.signature;
    const timestamp: number = Number(body?.timestamp);

    if (!wallet || !WALLET_RE.test(wallet)) {
      return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
    }

    if (displayName !== null && displayName !== "" && !NAME_RE.test(displayName)) {
      return NextResponse.json(
        { error: "Display name must be 1–24 alphanumeric characters or spaces" },
        { status: 400 }
      );
    }

    if (!signature || !timestamp) {
      return NextResponse.json({ error: "Signature and timestamp required" }, { status: 400 });
    }

    if (Math.abs(Date.now() - timestamp) > 5 * 60 * 1000) {
      return NextResponse.json({ error: "Timestamp expired" }, { status: 400 });
    }

    const message = `CasFin:setProfile:${wallet}:${timestamp}`;
    let recovered: string;
    try {
      recovered = ethers.verifyMessage(message, signature).toLowerCase();
    } catch {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    if (recovered !== wallet) {
      return NextResponse.json({ error: "Signature does not match wallet" }, { status: 401 });
    }

    const user = await prisma.user.upsert({
      where: { walletAddress: wallet },
      update: { displayName: displayName || null, lastActiveAt: new Date() },
      create: { walletAddress: wallet, displayName: displayName || null },
      select: { walletAddress: true, displayName: true, firstSeenAt: true, lastActiveAt: true },
    });

    return NextResponse.json(user);
  } catch (err) {
    console.error("PUT /api/user/profile error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
