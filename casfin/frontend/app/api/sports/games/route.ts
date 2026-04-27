import { NextResponse } from "next/server";

const API_KEY = process.env.BALLDONTLIE_API_KEY || process.env.NEXT_PUBLIC_BALLDONTLIE_API_KEY || "";
const BASE_URL = "https://api.balldontlie.io/v1";

function getDateStrings(): string[] {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(today.getUTCDate() + 1);
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  return [fmt(today), fmt(tomorrow)];
}

export async function GET() {
  try {
    const [today, tomorrow] = getDateStrings();
    const url = `${BASE_URL}/games?dates[]=${today}&dates[]=${tomorrow}&per_page=40`;

    const res = await fetch(url, {
      headers: { Authorization: API_KEY },
      next: { revalidate: 60 },
    });

    if (!res.ok) {
      throw new Error(`BallDontLie API returned ${res.status}`);
    }

    const body = await res.json();

    const games = ((body.data as any[]) || []).map((g: any) => ({
      id: g.id,
      date: g.date,
      status: g.status,
      period: g.period ?? 0,
      time: g.time ?? "",
      home_team: {
        id: g.home_team.id,
        name: g.home_team.name,
        full_name: g.home_team.full_name,
        abbreviation: g.home_team.abbreviation,
        city: g.home_team.city,
      },
      visitor_team: {
        id: g.visitor_team.id,
        name: g.visitor_team.name,
        full_name: g.visitor_team.full_name,
        abbreviation: g.visitor_team.abbreviation,
        city: g.visitor_team.city,
      },
      home_team_score: g.home_team_score ?? 0,
      visitor_team_score: g.visitor_team_score ?? 0,
    }));

    return NextResponse.json({ games });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ games: [], error: message });
  }
}
