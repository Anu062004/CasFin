import { NextRequest, NextResponse } from "next/server";
import { resolveCasinoBet } from "@/lib/server/casino-bet-resolver";

export const maxDuration = 60;

type ResolveBody = {
  game?: "coinflip" | "dice" | "crash";
  betId?: string;
  roundId?: string;
  player?: string;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ResolveBody;

    if (!body.game || !["coinflip", "dice", "crash"].includes(body.game)) {
      return NextResponse.json({ error: "Invalid game type." }, { status: 400 });
    }

    const result = await resolveCasinoBet({
      game: body.game,
      betId: body.betId,
      roundId: body.roundId,
      player: body.player
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[api/casino/resolve]", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
