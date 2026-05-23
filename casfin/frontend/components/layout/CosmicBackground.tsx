"use client";

import { useEffect, type CSSProperties, type ReactNode } from "react";

const starParticles = Array.from({ length: 80 }, (_, index) => ({
  x: (index * 37 + 11) % 100,
  y: (index * 61 + 7) % 100,
  size: 1 + ((index * 19) % 3),
  duration: 2 + ((index * 23) % 30) / 10,
  delay: -((index * 29) % 50) / 10
}));

export default function CosmicBackground() {
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
    <div className="cfl-bg casfin-global-bg" aria-hidden="true">
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

function DiceSvg({ color, dots }: { color: "purple" | "gold" | "teal"; dots: number }) {
  const palette = {
    purple: ["#c4b5fd", "#7c3aed", "#4c1d95"],
    gold: ["#fde68a", "#f59e0b", "#92400e"],
    teal: ["#67e8f9", "#0891b2", "#164e63"]
  }[color];

  return (
    <svg viewBox="0 0 96 88">
      <defs>
        <linearGradient id={`bgDiceTop-${color}-${dots}`} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor={palette[0]} />
          <stop offset="100%" stopColor={palette[1]} />
        </linearGradient>
        <linearGradient id={`bgDiceSide-${color}-${dots}`} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor={palette[1]} />
          <stop offset="100%" stopColor={palette[2]} />
        </linearGradient>
      </defs>
      <polygon points="48,5 86,26 48,47 10,26" fill={`url(#bgDiceTop-${color}-${dots})`} stroke="rgba(255,255,255,.18)" />
      <polygon points="86,26 86,62 48,83 48,47" fill={`url(#bgDiceSide-${color}-${dots})`} opacity=".9" />
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
        <radialGradient id={`bgCoin-${label}`}>
          <stop offset="0%" stopColor="#fff7ad" />
          <stop offset="55%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#b45309" />
        </radialGradient>
      </defs>
      <ellipse cx="22" cy="24" fill="rgba(120,70,0,.45)" rx="18" ry="6" />
      <circle cx="22" cy="20" fill={`url(#bgCoin-${label})`} r="18" stroke="rgba(255,255,255,.24)" />
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
