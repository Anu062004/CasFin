import Link from "next/link";
import { CASFIN_CONFIG } from "@/lib/casfin-config";

const FEATURE_CARDS = [
  {
    mark: "CS",
    title: "Casino rail",
    description: "Route-based Coin Toss, Dice, Crash, and Video Poker with encrypted session reuse."
  },
  {
    mark: "PM",
    title: "Prediction markets",
    description: "Manual market creation, AMM share buying, resolver controls, and final claim flows."
  },
  {
    mark: "FHE",
    title: "Private execution",
    description: "CoFHE-backed bet encryption, keeper-assisted resolution, and wallet-aware status feedback."
  }
];

export default function HomePage() {
  return (
    <main className="landing-shell">
      <section className="landing-hero-grid">
        <article className="landing-hero-panel">
          <p className="hero-kicker">BetSwirl-inspired redesign</p>
          <h1>Encrypted casino rails with a sharper on-chain shell.</h1>
          <p>
            CasFin now runs on a tighter dark design system: fixed top navigation, route-based casino tabs,
            cleaner market surfaces, and a shared interface language across wallet, casino, and prediction flows.
          </p>

          <div className="landing-action-row">
            <Link className="glass-button is-primary" href="/casino/dice">
              Open Casino
            </Link>
            <Link className="glass-button is-secondary" href="/predictions">
              Explore Markets
            </Link>
            <Link className="glass-button is-secondary" href="/wallet">
              View Wallet
            </Link>
          </div>

          <div className="landing-metric-grid">
            <div className="landing-metric-card">
              <span>Chain</span>
              <strong>{CASFIN_CONFIG.chainName}</strong>
              <p>Write flows target the live deployment and explorer tooling.</p>
            </div>
            <div className="landing-metric-card">
              <span>Casino games</span>
              <strong>4 live routes</strong>
              <p>Coin Toss, Dice, Crash, and Video Poker under one shared shell.</p>
            </div>
            <div className="landing-metric-card">
              <span>Settlement</span>
              <strong>Keeper plus contract</strong>
              <p>Encrypted wagers move through a visible multi-step resolution pipeline.</p>
            </div>
          </div>
        </article>

        <article className="landing-console-panel">
          <p className="hero-kicker">Live interface goals</p>
          <div className="landing-console-list">
            <div className="landing-console-row">
              <span>Navigation</span>
              <strong>Fixed top bar with chain selector and wallet launcher</strong>
            </div>
            <div className="landing-console-row">
              <span>Casino layout</span>
              <strong>Two-column game stage and bet control dock</strong>
            </div>
            <div className="landing-console-row">
              <span>Market layout</span>
              <strong>Filterable market explorer plus creator controls</strong>
            </div>
            <div className="landing-console-row">
              <span>Proof surface</span>
              <strong>Provably fair badge wired to deployed contract pages</strong>
            </div>
          </div>
        </article>
      </section>

      <section className="landing-feature-grid">
        {FEATURE_CARDS.map((feature) => (
          <article className="landing-feature-card" key={feature.title}>
            <span className="landing-feature-mark">{feature.mark}</span>
            <h2>{feature.title}</h2>
            <p>{feature.description}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
