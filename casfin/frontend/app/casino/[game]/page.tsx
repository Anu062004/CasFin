import { notFound } from "next/navigation";
import CasinoShell from "@/components/casino/CasinoShell";
import { CASINO_GAMES, isCasinoGameSlug } from "@/lib/casino-games";

export function generateStaticParams() {
  return CASINO_GAMES.map((game) => ({ game: game.slug }));
}

export default function CasinoGamePage({ params }: { params: { game: string } }) {
  if (!isCasinoGameSlug(params.game)) {
    notFound();
  }

  return <CasinoShell activeGame={params.game} />;
}
