import Link from "next/link";
import { CASFIN_CONFIG } from "@/lib/casfin-config";
import { CASINO_GAMES } from "@/lib/casino-games";

const LIVE_TICKER_ITEMS = [
  "4 encrypted casino rails live on Arbitrum Sepolia",
  "Prediction factory, AMM flows, and resolver actions ship in the same shell",
  "Session keys reduce repeated prompts across private wager flows",
  "Wallet, vault, and profile controls stay visible without leaving the protocol",
  "Provably fair routes stay tied to live contract addresses and explorer tooling"
];

const FEATURE_CARDS = [
  {
    label: "Private execution",
    value: "CoFHE sessions",
    description: "Start one encrypted session and reuse it across multiple wagers without rebuilding the full flow every time."
  },
  {
    label: "Prediction markets",
    value: "Factory plus AMM",
    description: "Create, discover, buy, sell, resolve, and claim from the same market rail with clearer operational surfaces."
  },
  {
    label: "Wallet rail",
    value: "Vault and profile",
    description: "Deposit, withdraw, bankroll, and manage your player identity without breaking out into disconnected screens."
  }
];

const WORKFLOW_STEPS = [
  {
    title: "Connect and verify network",
    description: "The shell exposes chain state immediately so users know if they are browsing read-only or are ready to sign."
  },
  {
    title: "Start encrypted play",
    description: "Casino routes keep session state, vault liquidity, and bet controls together instead of splitting them across panels."
  },
  {
    title: "Resolve or claim",
    description: "Keeper-assisted settlement and prediction resolution stay visible through status toasts, explorer links, and route-level context."
  }
];

const FEED_ITEMS = [
  { label: "Coin Toss", detail: "Binary wager rail with fast keeper settlement.", status: "1.96x" },
  { label: "Crash", detail: "Live multiplier rounds with auto cash-out support.", status: "Variable" },
  { label: "Markets", detail: "Creator tooling and liquidity discovery in one grid.", status: "AMM" },
  { label: "Wallet", detail: "Vault actions, profile naming, and transaction recall.", status: "Vault" }
];

const INFRA_LINKS = [
  { href: "https://www.fhenix.io", label: "Fhenix", detail: "Private execution rail" },
  { href: "https://chain.link", label: "Chainlink", detail: "Randomness and oracle tooling" },
  { href: "https://thegraph.com", label: "The Graph", detail: "Event indexing pipeline" },
  { href: CASFIN_CONFIG.explorerBaseUrl, label: "Arbiscan", detail: "Contract and tx explorer" }
];

const HUB_CARDS = [
  ...CASINO_GAMES.map((game) => ({
    href: `/casino/${game.slug}`,
    mark: game.shortLabel,
    title: game.label,
    kicker: game.kicker,
    description: game.summary,
    tone: "casino"
  })),
  {
    href: "/predictions",
    mark: "PM",
    title: "Prediction Markets",
    kicker: "Factory and explorer",
    description: "Create live markets, filter liquidity, manage positions, and handle resolution in one route.",
    tone: "markets"
  },
  {
    href: "/wallet",
    mark: "WL",
    title: "Wallet",
    kicker: "Vault and profile",
    description: "Manage bankroll, deposits, withdrawals, and player identity with transaction visibility baked in.",
    tone: "wallet"
  }
];

export default function HomePage() {
  return (
    <main className="dashboard-home-shell">
      <section className="dashboard-live-ticker" aria-label="Live CasFin highlights">
        <span className="dashboard-live-pill">Live</span>
        <div className="dashboard-live-track">
          {LIVE_TICKER_ITEMS.concat(LIVE_TICKER_ITEMS).map((item, index) => (
            <span className="dashboard-live-item" key={`${item}-${index}`}>
              {item}
            </span>
          ))}
        </div>
      </section>

      <section className="dashboard-hero-panel">
        <div className="dashboard-hero-copy">
          <span className="dashboard-eyebrow">Encrypted casino rail</span>
          <h1>Private wagers, live markets, and wallet control inside a tighter operator-grade shell.</h1>
          <p>
            This patch moves CasFin closer to a real dashboard product: fixed navigation, faster route jumping,
            cleaner surface hierarchy, and a landing page that points directly into the live casino, predictions,
            and bankroll flows already running on-chain.
          </p>

          <div className="dashboard-hero-actions">
            <Link className="dashboard-cta is-primary" href="/casino/coin-toss">
              Enter Casino
            </Link>
            <Link className="dashboard-cta" href="/predictions">
              Explore Markets
            </Link>
            <Link className="dashboard-cta" href="/wallet">
              Open Wallet
            </Link>
          </div>
        </div>

        <div className="dashboard-hero-stats">
          <article className="dashboard-stat-card">
            <span>Chain</span>
            <strong>{CASFIN_CONFIG.chainName}</strong>
            <p>Write flows, explorer links, and wallet switching all target the live deployment.</p>
          </article>
          <article className="dashboard-stat-card">
            <span>Casino routes</span>
            <strong>{CASINO_GAMES.length} live games</strong>
            <p>Coin Toss, Dice, Crash, and Video Poker now share the same chrome and quicker route access.</p>
          </article>
          <article className="dashboard-stat-card">
            <span>Execution model</span>
            <strong>Keeper plus session key</strong>
            <p>Encrypted wagers keep their context visible from connect state through settlement and claims.</p>
          </article>
        </div>
      </section>

      <section className="dashboard-section">
        <div className="dashboard-section-head">
          <div>
            <p className="dashboard-section-kicker">Launchpad</p>
            <h2>Jump straight into the working rails</h2>
          </div>
          <Link className="dashboard-inline-link" href="/predictions/sports">
            Open sports view
          </Link>
        </div>

        <div className="dashboard-card-grid">
          {HUB_CARDS.map((card) => (
            <Link className={`dashboard-nav-card is-${card.tone}`} href={card.href} key={card.href}>
              <span className="dashboard-nav-mark">{card.mark}</span>
              <div className="dashboard-nav-copy">
                <strong>{card.title}</strong>
                <span>{card.kicker}</span>
              </div>
              <p>{card.description}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="dashboard-feature-grid">
        {FEATURE_CARDS.map((feature) => (
          <article className="dashboard-feature-card" key={feature.label}>
            <span className="dashboard-feature-label">{feature.label}</span>
            <strong>{feature.value}</strong>
            <p>{feature.description}</p>
          </article>
        ))}
      </section>

      <section className="dashboard-insight-grid">
        <article className="dashboard-steps-panel">
          <div className="dashboard-section-head">
            <div>
              <p className="dashboard-section-kicker">Flow</p>
              <h2>What changed in the UX</h2>
            </div>
          </div>

          <div className="dashboard-steps-list">
            {WORKFLOW_STEPS.map((step, index) => (
              <div className="dashboard-step-row" key={step.title}>
                <span className="dashboard-step-index">0{index + 1}</span>
                <div>
                  <strong>{step.title}</strong>
                  <p>{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="dashboard-feed-panel">
          <div className="dashboard-feed-head">
            <div>
              <p className="dashboard-section-kicker">Protocol map</p>
              <h2>Current route priorities</h2>
            </div>
          </div>

          <div className="dashboard-feed-list">
            {FEED_ITEMS.map((item) => (
              <div className="dashboard-feed-row" key={item.label}>
                <div>
                  <strong>{item.label}</strong>
                  <span>{item.detail}</span>
                </div>
                <em>{item.status}</em>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="dashboard-infra-grid">
        {INFRA_LINKS.map((link) => (
          <a className="dashboard-infra-card" href={link.href} key={link.label} rel="noreferrer" target="_blank">
            <strong>{link.label}</strong>
            <span>{link.detail}</span>
          </a>
        ))}
      </section>
    </main>
  );
}
