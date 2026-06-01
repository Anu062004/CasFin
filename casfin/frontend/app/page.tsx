"use client";

import Link from "next/link";
import { useEffect, type CSSProperties, type ReactNode } from "react";
import { useWallet } from "@/components/WalletProvider";
import { CASFIN_CONFIG } from "@/lib/casfin-config";
import { CASINO_GAMES } from "@/lib/casino-games";
import { formatEth } from "@/lib/casfin-client";

const tickerItems = [
  { label: "Coin Toss - 0x3f...a1 won", value: "+0.42 ETH", tone: "up" },
  { label: "Crash - 0x9b...c4 cashed at", value: "3.14x", tone: "up" },
  { label: "Dice - 0x1e...77 rolled", value: "6", tone: "up" },
  { label: "Video Poker - 0x8a...22 hit", value: "Royal Flush", tone: "up" },
  { label: "ETH/USD", value: "$3,842", tone: "up" },
  { label: "Crash - 0x5d...b9 stopped at", value: "1.02x", tone: "down" },
  { label: "Coin Toss - 0x2c...f3 won", value: "+0.18 ETH", tone: "up" },
  { label: "Dice - 0x7a...44 hit", value: "777", tone: "up" }
];

const quickGames = [
  {
    href: "/casino/coin-toss",
    name: "Coin Toss",
    kicker: "Binary odds",
    payout: "1.96x",
    pace: "Instant flip",
    kind: "coin",
    accent: "#f59e0b"
  },
  {
    href: "/casino/dice",
    name: "Dice",
    kicker: "Number pick",
    payout: "5.88x",
    pace: "Pick 1-6",
    kind: "dice",
    accent: "#8b5cf6"
  },
  {
    href: "/casino/crash",
    name: "Crash",
    kicker: "Round game",
    payout: "Variable",
    pace: "Cash out live",
    kind: "crash",
    accent: "#10b981"
  },
  {
    href: "/casino/poker",
    name: "Video Poker",
    kicker: "Draw game",
    payout: "Jacks+",
    pace: "Hold and draw",
    kind: "poker",
    accent: "#06b6d4"
  }
];

const forYouGames = [
  {
    href: "/casino/coin-toss",
    name: "Coin Toss",
    kicker: "Encrypted flip rail",
    payout: "1.96x",
    tag: "Fastest",
    kind: "coin",
    accent: "#f59e0b"
  },
  {
    href: "/casino/dice",
    name: "Dice",
    kicker: "Private number pick",
    payout: "5.88x",
    tag: "High odds",
    kind: "dice",
    accent: "#8b5cf6"
  },
  {
    href: "/casino/crash",
    name: "Crash",
    kicker: "Multiplier race",
    payout: "Live",
    tag: "Live rail",
    kind: "crash",
    accent: "#10b981"
  },
  {
    href: "/casino/poker",
    name: "Video Poker",
    kicker: "Encrypted draw",
    payout: "250x",
    tag: "Table game",
    kind: "poker",
    accent: "#06b6d4"
  },
  {
    href: "/predictions",
    name: "Prediction Markets",
    kicker: "Factory markets",
    payout: "Odds",
    tag: "Markets",
    kind: "crystal",
    accent: "#a78bfa"
  }
];

const markets = [
  {
    href: "/predictions/sports",
    title: "Sports Markets",
    detail: "Match winners, spreads, and live matchup rails.",
    odds: "1.82 / 2.05"
  },
  {
    href: "/predictions",
    title: "Crypto Price",
    detail: "ETH, BTC, and Arbitrum event outcomes.",
    odds: "2.10 / 1.74"
  },
  {
    href: "/predictions",
    title: "Custom Factory",
    detail: "Deploy encrypted markets from the factory.",
    odds: "Creator odds"
  }
];

const partners = [
  ["Fhenix", "https://www.fhenix.io"],
  ["Chainlink", "https://chain.link"],
  ["The Graph", "https://thegraph.com"],
  ["Arbitrum", "https://arbitrum.io"],
  ["Arbiscan", CASFIN_CONFIG.explorerBaseUrl]
];

const starParticles = Array.from({ length: 80 }, (_, index) => ({
  x: (index * 37 + 11) % 100,
  y: (index * 61 + 7) % 100,
  size: 1 + ((index * 19) % 3),
  duration: 2 + ((index * 23) % 30) / 10,
  delay: -((index * 29) % 50) / 10
}));

function FloatingScene() {
  useEffect(() => {
    function handleMouseMove(event: MouseEvent) {
      const mx = (event.clientX / window.innerWidth - 0.5) * 12;
      const my = (event.clientY / window.innerHeight - 0.5) * 12;

      document.querySelectorAll<HTMLElement>(".cfl-fe").forEach((element, index) => {
        const factor = ((index % 3) + 1) * 0.4;
        element.style.transform = `translate(${mx * factor}px, ${my * factor}px)`;
      });
    }

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  return (
    <div className="cfl-bg" aria-hidden="true">
      <div className="cfl-stars">
        {starParticles.map((star, index) => (
          <span
            className="cfl-star"
            key={index}
            style={{
              "--x": `${star.x}%`,
              "--y": `${star.y}%`,
              "--sz": `${star.size}px`,
              "--d": `${star.duration}s`,
              "--dl": `${star.delay}s`
            } as CSSProperties}
          />
        ))}
      </div>
      <FloatSlot className="cfl-fe-d1"><DiceSvg color="purple" dots={5} /></FloatSlot>
      <FloatSlot className="cfl-fe-d2"><DiceSvg color="gold" dots={6} /></FloatSlot>
      <FloatSlot className="cfl-fe-d3"><DiceSvg color="teal" dots={2} /></FloatSlot>
      <FloatSlot className="cfl-fe-g1"><GemSvg color="teal" /></FloatSlot>
      <FloatSlot className="cfl-fe-g2"><GemSvg color="purple" /></FloatSlot>
      <FloatSlot className="cfl-fe-card"><PlayingCardSvg /></FloatSlot>
      <FloatSlot className="cfl-fe-coin"><CoinSvg label="B" /></FloatSlot>
      <FloatSlot className="cfl-fe-coin2"><CoinSvg label="ETH" small /></FloatSlot>
      <FloatSlot className="cfl-fe-star1"><SparkleSvg /></FloatSlot>
    </div>
  );
}

function FloatSlot({ children, className }: { children: ReactNode; className: string }) {
  return (
    <div className={`cfl-fe ${className}`}>
      <div className="cfl-fe-art">{children}</div>
    </div>
  );
}

function GameArt({ kind }: { kind: string }) {
  if (kind === "coin") return <CoinGameSvg />;
  if (kind === "dice") return <DiceGameSvg />;
  if (kind === "crash") return <CrashGameSvg />;
  if (kind === "poker") return <PokerGameSvg />;
  return <CrystalBallSvg />;
}

function HomePage() {
  const { isConnected, walletBalance, sessionActive, predictionState } = useWallet();
  const balanceLabel = isConnected ? `${formatEth(walletBalance)} ETH` : "0.0000 ETH";
  const marketCount = predictionState.totalMarkets || "Factory";

  return (
    <main className="casfin-lobby">
      <section className="cfl-ticker" aria-label="Live CasFin ticker">
        <span className="cfl-ticker-label"><span /> Live</span>
        <div className="cfl-ticker-window">
          <div className="cfl-ticker-track">
            {tickerItems.concat(tickerItems).map((item, index) => (
              <span className="cfl-ticker-item" key={`${item.label}-${index}`}>
                {item.label} <strong className={item.tone === "down" ? "is-down" : "is-up"}>{item.value}</strong>
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="cfl-hero">
        <div className="cfl-hero-fx" aria-hidden="true">
          <span className="cfl-fx-rail" />
          <span className="cfl-fx-scan" />
          <span className="cfl-fx-cipher cfl-fx-cipher-a">0110 1101 0011</span>
          <span className="cfl-fx-cipher cfl-fx-cipher-b">1011 0001 1110</span>
          <span className="cfl-fx-corner cfl-fx-corner-a" />
          <span className="cfl-fx-corner cfl-fx-corner-b" />
        </div>

        <div className="cfl-hero-copy">
          <span className="cfl-badge">Encrypted casino and markets</span>
          <h1>
            CasFin <span>Private Vault</span>
          </h1>
          <p>{CASINO_GAMES.length} encrypted game rails, private wagers, CoFHE sessions, and on-chain settlement on {CASFIN_CONFIG.chainName}.</p>
          <div className="cfl-hero-actions">
            <Link className="cfl-hero-btn" href="/casino/coin-toss">Play Coin Toss</Link>
            <Link className="cfl-ghost-btn" href="/predictions">Explore Markets</Link>
          </div>
        </div>

        <div className="cfl-hero-art">
          <img alt="CasFin cosmic treasure chest casino banner with dice, crystals, and a neon space path" src="/casfin-treasure-banner.jpg" />
        </div>
      </section>

      <section className="cfl-section">
        <div className="cfl-section-head">
          <div>
            <p>Fast rails</p>
            <h2>Choose by odds, speed, or style</h2>
          </div>
          <span className="cfl-live-chip">4 live</span>
        </div>
        <div className="cfl-quick-grid">
          {quickGames.map((game) => (
            <Link
              aria-label={`Play ${game.name}`}
              className="cfl-qcard"
              href={game.href}
              key={game.href}
              style={{ "--accent": game.accent } as CSSProperties}
            >
              <span className="cfl-qart"><GameArt kind={game.kind} /></span>
              <span className="cfl-qcopy">
                <strong>{game.name}</strong>
                <small>{game.kicker} - {game.pace}</small>
              </span>
              <span className="cfl-qmeta">
                <small>Payout</small>
                <strong>{game.payout}</strong>
              </span>
              <span className="cfl-play">Play</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="cfl-section">
        <div className="cfl-section-head">
          <div>
            <p>Main floor</p>
            <h2>Featured rails</h2>
          </div>
          <Link className="cfl-link-btn" href="/casino/coin-toss">Open casino</Link>
        </div>
        <div className="cfl-game-grid">
          {forYouGames.map((game) => (
            <Link
              aria-label={`Open ${game.name}`}
              className="cfl-game-card"
              href={game.href}
              key={game.name}
              style={{ "--accent": game.accent } as CSSProperties}
            >
              <span className="cfl-game-chip">{game.tag}</span>
              <span className="cfl-game-visual"><GameArt kind={game.kind} /></span>
              <span className="cfl-game-meta">
                <small>{game.kicker}</small>
                <strong>{game.name}</strong>
              </span>
              <span className="cfl-game-bottom">
                <em>{game.payout}</em>
                <span>Play</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="cfl-stats-grid" aria-label="Chain stats">
        <StatCard label="Casino Rails" value={`${CASINO_GAMES.length} Live`} detail="Coin Toss, Dice, Crash, and Video Poker." />
        <StatCard label="Execution Model" value="CoFHE" detail={sessionActive ? "Encrypted session currently live." : "Private execution and session keys ready."} />
        <StatCard label="Prediction Markets" value={String(marketCount)} detail={`Connected balance: ${balanceLabel}`} />
      </section>

      <section className="cfl-market-section">
        <div className="cfl-section-head">
          <div>
            <p>Prediction Markets</p>
            <h2>Encrypted odds board</h2>
          </div>
          <Link className="cfl-link-btn" href="/predictions">View all</Link>
        </div>
        <div className="cfl-market-grid">
          {markets.map((market) => (
            <Link className="cfl-market-card" href={market.href} key={market.title}>
              <span className="cfl-market-orb" />
              <span>
                <strong>{market.title}</strong>
                <small>{market.detail}</small>
              </span>
              <em>{market.odds}</em>
            </Link>
          ))}
        </div>
      </section>

      <section className="cfl-partners" aria-label="Protocol partners">
        {partners.map(([label, href]) => (
          <a href={href} key={label} rel="noreferrer" target="_blank">{label}</a>
        ))}
      </section>
    </main>
  );
}

function StatCard({ detail, label, value }: { detail: string; label: string; value: string }) {
  return (
    <article className="cfl-stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
      <em>Live</em>
    </article>
  );
}

function CrystalShard({ color, height }: { color: string; height: number }) {
  return (
    <svg height={height} viewBox="0 0 24 80" width={Math.max(14, Math.round(height * 0.3))}>
      <polygon points="12,0 22,20 22,80 2,80 2,20" fill={color} opacity="0.42" stroke="rgba(255,255,255,.28)" />
      <polygon points="12,0 22,20 12,14" fill="#fff" opacity="0.18" />
    </svg>
  );
}

function DiceSvg({ color, dots }: { color: "purple" | "gold" | "teal"; dots: number }) {
  const palette = {
    purple: ["#c4b5fd", "#7c3aed", "#4c1d95"],
    gold: ["#fde68a", "#f59e0b", "#92400e"],
    teal: ["#67e8f9", "#0891b2", "#164e63"]
  }[color];

  return (
    <svg viewBox="0 0 96 88">
      <defs>
        <linearGradient id={`diceTop-${color}-${dots}`} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor={palette[0]} />
          <stop offset="100%" stopColor={palette[1]} />
        </linearGradient>
        <linearGradient id={`diceSide-${color}-${dots}`} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor={palette[1]} />
          <stop offset="100%" stopColor={palette[2]} />
        </linearGradient>
      </defs>
      <polygon points="48,5 86,26 48,47 10,26" fill={`url(#diceTop-${color}-${dots})`} stroke="rgba(255,255,255,.18)" />
      <polygon points="86,26 86,62 48,83 48,47" fill={`url(#diceSide-${color}-${dots})`} opacity=".9" />
      <polygon points="10,26 48,47 48,83 10,62" fill={palette[2]} opacity=".82" />
      {[0, 1, 2, 3, 4, 5].slice(0, dots).map((dot) => {
        const coords = [[48, 22], [35, 29], [61, 29], [35, 18], [61, 18], [48, 34]][dot];
        return <circle cx={coords[0]} cy={coords[1]} fill="rgba(255,255,255,.9)" key={dot} r="3.8" />;
      })}
      <circle cx="72" cy="43" fill="rgba(255,255,255,.62)" r="3" />
      <circle cx="64" cy="58" fill="rgba(255,255,255,.58)" r="3" />
      <circle cx="26" cy="48" fill="rgba(255,255,255,.48)" r="3" />
    </svg>
  );
}

function GemSvg({ color }: { color: "purple" | "teal" }) {
  const main = color === "teal" ? "#06b6d4" : "#8b5cf6";
  const dark = color === "teal" ? "#155e75" : "#4c1d95";

  return (
    <svg viewBox="0 0 62 74">
      <polygon points="31,2 54,22 31,22 8,22" fill="#e0f2fe" opacity=".72" />
      <polygon points="8,22 31,22 18,54" fill={main} opacity=".88" />
      <polygon points="54,22 31,22 44,54" fill={main} opacity=".72" />
      <polygon points="18,54 31,22 31,72" fill={dark} opacity=".76" />
      <polygon points="44,54 31,22 31,72" fill={dark} opacity=".62" />
      <line x1="31" x2="31" y1="2" y2="22" stroke="rgba(255,255,255,.62)" strokeWidth="1.5" />
      <circle cx="31" cy="15" fill="rgba(255,255,255,.7)" r="3" />
    </svg>
  );
}

function PlayingCardSvg() {
  return (
    <svg viewBox="0 0 56 80">
      <rect fill="#2d1a6e" height="76" rx="7" stroke="rgba(139,92,246,.66)" strokeWidth="1.5" width="52" x="2" y="2" />
      <path d="M12 16h9l-4.5 16zm32 48h-9l4.5-16z" fill="#a78bfa" opacity=".9" />
      <path d="M28 33c7 7 12 13 12 18 0 6-5 10-12 10s-12-4-12-10c0-5 5-11 12-18z" fill="#06b6d4" opacity=".32" />
      <rect fill="rgba(255,255,255,.05)" height="70" rx="5" width="18" x="5" y="5" />
    </svg>
  );
}

function CoinSvg({ label, small = false }: { label: string; small?: boolean }) {
  return (
    <svg viewBox="0 0 44 44">
      <defs>
        <radialGradient id={`coin-${label}`}>
          <stop offset="0%" stopColor="#fff7ad" />
          <stop offset="55%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#b45309" />
        </radialGradient>
      </defs>
      <ellipse cx="22" cy="24" fill="rgba(120,70,0,.45)" rx="18" ry="6" />
      <circle cx="22" cy="20" fill={`url(#coin-${label})`} r="18" stroke="rgba(255,255,255,.24)" />
      <circle cx="22" cy="20" fill="none" r="13" stroke="rgba(255,255,255,.24)" strokeWidth="1.5" />
      <text fill="rgba(255,255,255,.86)" fontFamily="monospace" fontSize={small ? "8" : "12"} fontWeight="800" textAnchor="middle" x="22" y="25">{label}</text>
    </svg>
  );
}

function SparkleSvg() {
  return (
    <svg viewBox="0 0 32 32">
      <path d="M16 2 18 13 29 16 18 19 16 30 14 19 3 16 14 13Z" fill="#fde68a" />
      <path d="M16 8 17 14 23 16 17 18 16 24 15 18 9 16 15 14Z" fill="#fff" opacity=".54" />
    </svg>
  );
}

function CoinGameSvg() {
  return (
    <svg className="cfl-art-svg" viewBox="0 0 160 130">
      <defs>
        <radialGradient id="coinGameGrad"><stop offset="0%" stopColor="#fff7ad" /><stop offset="55%" stopColor="#f59e0b" /><stop offset="100%" stopColor="#b45309" /></radialGradient>
      </defs>
      <ellipse cx="80" cy="96" fill="rgba(0,0,0,.25)" rx="54" ry="12" />
      <circle cx="80" cy="62" fill="url(#coinGameGrad)" r="42" stroke="rgba(255,255,255,.28)" strokeWidth="3" />
      <circle cx="80" cy="62" fill="none" r="29" stroke="rgba(255,255,255,.28)" strokeWidth="3" />
      <path d="M80 34v56M63 48h27c10 0 15 4 15 12s-5 12-15 12H63" fill="none" stroke="#fff7ad" strokeLinecap="round" strokeWidth="8" />
    </svg>
  );
}

function DiceGameSvg() {
  return (
    <svg className="cfl-art-svg" viewBox="0 0 160 130">
      <DiceSvg color="purple" dots={5} />
      <g transform="translate(52 26) scale(.72)"><DiceSvg color="gold" dots={3} /></g>
    </svg>
  );
}

function CrashGameSvg() {
  return (
    <svg className="cfl-art-svg" viewBox="0 0 160 130">
      <path d="M20 98C48 96 62 77 79 63c18-15 31-19 58-18" fill="none" stroke="#10b981" strokeLinecap="round" strokeWidth="7" />
      <path d="M92 30 126 52 93 78 84 62 64 57Z" fill="#f59e0b" stroke="rgba(255,255,255,.28)" strokeWidth="2" />
      <path d="M84 62 68 78 78 55Z" fill="#fb923c" />
      <circle cx="122" cy="52" fill="#e0f2fe" r="7" />
      <path d="M58 86c-9 8-20 13-31 15 5-10 10-19 19-27" fill="#8b5cf6" opacity=".75" />
    </svg>
  );
}

function PokerGameSvg() {
  return (
    <svg className="cfl-art-svg" viewBox="0 0 160 130">
      <g transform="translate(34 20) rotate(-14 45 45)">
        <rect fill="#fff" height="76" rx="8" stroke="#dbeafe" width="54" />
        <path d="M27 24c10 10 17 18 17 26 0 9-7 15-17 15S10 59 10 50c0-8 7-16 17-26z" fill="#111827" />
      </g>
      <g transform="translate(62 14) rotate(8 45 45)">
        <rect fill="#2d1a6e" height="82" rx="8" stroke="#a78bfa" width="58" />
        <path d="M29 21 45 58H13Z" fill="#06b6d4" opacity=".85" />
      </g>
      <g transform="translate(82 28) rotate(20 45 45)">
        <rect fill="#fff7ed" height="74" rx="8" stroke="#fed7aa" width="52" />
        <circle cx="26" cy="36" fill="#f59e0b" r="16" />
      </g>
    </svg>
  );
}

function CrystalBallSvg() {
  return (
    <svg className="cfl-art-svg" viewBox="0 0 160 130">
      <defs>
        <radialGradient id="ballGlow" cx="35%" cy="28%"><stop offset="0%" stopColor="#e9d5ff" /><stop offset="50%" stopColor="#8b5cf6" /><stop offset="100%" stopColor="#312e81" /></radialGradient>
      </defs>
      <ellipse cx="80" cy="103" fill="rgba(0,0,0,.28)" rx="48" ry="10" />
      <path d="M50 94h60l10 18H40Z" fill="#f59e0b" opacity=".9" />
      <circle cx="80" cy="58" fill="url(#ballGlow)" r="42" stroke="rgba(255,255,255,.35)" strokeWidth="3" />
      <path d="M58 58c15-14 30-14 45 0M65 74c12-8 24-8 36 0" fill="none" stroke="#67e8f9" strokeLinecap="round" strokeWidth="4" opacity=".8" />
      <circle cx="66" cy="42" fill="#fff" opacity=".65" r="6" />
    </svg>
  );
}

export default HomePage;
