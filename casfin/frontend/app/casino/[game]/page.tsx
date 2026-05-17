import { notFound } from "next/navigation";
import CasinoShell from "@/components/casino/CasinoShell";
import { CASINO_GAMES, isCasinoGameSlug } from "@/lib/casino-games";

export function generateStaticParams() {
  return CASINO_GAMES.map((game) => ({ game: game.slug }));
}

export default async function CasinoGamePage(
  { params }: { params: Promise<{ game: string }> }
) {
  const { game } = await params;

  if (!isCasinoGameSlug(game)) {
    notFound();
  }

  return <CasinoShell activeGame={game} />;
}
