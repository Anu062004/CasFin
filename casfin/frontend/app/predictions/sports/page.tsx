"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ethers } from "ethers";
import GlassButton from "@/components/GlassButton";
import GlassCard from "@/components/GlassCard";
import GlassInput from "@/components/GlassInput";
import StatCard from "@/components/StatCard";
import { useWallet } from "@/components/WalletProvider";
import { MARKET_FACTORY_ABI, PREDICTION_MARKET_ABI } from "@/lib/casfin-abis";
import { CASFIN_CONFIG } from "@/lib/casfin-config";
import { parseRequiredEth } from "@/lib/casfin-client";
import { useCofhe } from "@/lib/cofhe-provider";

// ── Types ──────────────────────────────────────────────────────────────────

interface TeamInfo {
  id: number;
  name: string;
  full_name: string;
  abbreviation: string;
  city: string;
}

interface SportGame {
  id: number;
  date: string;
  status: string;
  period: number;
  time: string;
  home_team: TeamInfo;
  visitor_team: TeamInfo;
  home_team_score: number;
  visitor_team_score: number;
}

interface GameBetState {
  amount: string;
  side: "home" | "visitor" | null;
  marketAddress: string | null;
  volume: { home: number; visitor: number };
}

// ── Constants ──────────────────────────────────────────────────────────────

const VIRTUAL_FLOOR_ETH = 0.1; // matches DEFAULT_AMM_VIRTUAL_LIQUIDITY_FLOOR typical value
const INITIAL_LIQUIDITY_ETH = "0.01";
const DISPUTE_WINDOW_SECS = 86_400n; // 24 hours
const MARKET_CREATED_EVENT_ABI = [
  "event MarketCreated(uint256 indexed,address indexed,address indexed,address,address,address,string)",
];
const LS_MARKET_KEY = (gameId: number) => `casfin:sports:market:${gameId}`;
const LS_VOLUME_KEY = (gameId: number) => `casfin:sports:volume:${gameId}`;

// ── Helpers ────────────────────────────────────────────────────────────────

function computeOdds(
  volume: { home: number; visitor: number },
  floor = VIRTUAL_FLOOR_ETH
): { home: number; visitor: number } {
  const total = volume.home + volume.visitor;
  const homeProb = (floor + volume.home) / (2 * floor + total);
  const visitorProb = 1 - homeProb;
  return {
    home: homeProb > 0 ? Math.min(1 / homeProb, 99) : 2.0,
    visitor: visitorProb > 0 ? Math.min(1 / visitorProb, 99) : 2.0,
  };
}

function buildQuestion(game: SportGame): string {
  return `NBA: ${game.visitor_team.full_name} @ ${game.home_team.full_name} — Who wins? (${game.date})`;
}

function buildDescription(game: SportGame): string {
  return `NBA game on ${game.date}. ${game.visitor_team.full_name} at ${game.home_team.full_name}. Market resolves after the final buzzer.`;
}

function getResolveAt(game: SportGame): number {
  const gameDate = new Date(game.date + "T00:00:00Z");
  gameDate.setUTCDate(gameDate.getUTCDate() + 1);
  gameDate.setUTCHours(10, 0, 0, 0); // next day 10am UTC
  return Math.floor(gameDate.getTime() / 1000);
}

function statusLabel(game: SportGame): string {
  if (game.status === "Final") return "Final";
  if (game.status === "In Progress") {
    return game.time ? `Q${game.period} ${game.time}` : `Q${game.period}`;
  }
  return "Upcoming";
}

function statusClass(status: string): string {
  if (status === "Final") return "phase-badge phase-muted";
  if (status === "In Progress") return "phase-badge phase-open";
  return "phase-badge phase-warning";
}

function readStoredMarket(gameId: number): string | null {
  try {
    return localStorage.getItem(LS_MARKET_KEY(gameId));
  } catch {
    return null;
  }
}

function readStoredVolume(gameId: number): { home: number; visitor: number } {
  try {
    const raw = localStorage.getItem(LS_VOLUME_KEY(gameId));
    if (raw) return JSON.parse(raw);
  } catch {}
  return { home: 0, visitor: 0 };
}

function writeStoredVolume(gameId: number, volume: { home: number; visitor: number }) {
  try {
    localStorage.setItem(LS_VOLUME_KEY(gameId), JSON.stringify(volume));
  } catch {}
}

function extractMarketAddress(logs: readonly ethers.Log[]): string | null {
  const iface = new ethers.Interface(MARKET_CREATED_EVENT_ABI);
  for (const log of logs) {
    try {
      const parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
      if (parsed?.name === "MarketCreated") {
        return String(parsed.args[1]); // 2nd indexed = market address
      }
    } catch {}
  }
  return null;
}

// ── SportGameCard ──────────────────────────────────────────────────────────

function SportGameCard({
  game,
  betState,
  onAmountChange,
  onSideSelect,
  onBet,
  pendingAction,
  walletBlocked,
  cofheConnected,
}: {
  game: SportGame;
  betState: GameBetState;
  onAmountChange: (amount: string) => void;
  onSideSelect: (side: "home" | "visitor") => void;
  onBet: (game: SportGame) => void;
  pendingAction: string;
  walletBlocked: boolean;
  cofheConnected: boolean;
}) {
  const isLive = game.status === "In Progress";
  const isFinal = game.status === "Final";
  const isBettable = !isFinal;
  const odds = computeOdds(betState.volume);
  const betAmountNum = parseFloat(betState.amount) || 0;
  const selectedOdds = betState.side === "home" ? odds.home : betState.side === "visitor" ? odds.visitor : null;
  const potentialPayout = selectedOdds && betAmountNum > 0 ? (betAmountNum * selectedOdds).toFixed(4) : null;
  const actionLabel = betState.marketAddress ? "Place Bet" : "Create Market & Bet";
  const isPending = pendingAction === `Sports bet ${game.id}`;

  return (
    <GlassCard
      action={<span className={statusClass(game.status)}>{statusLabel(game)}</span>}
      className="market-card"
      eyebrow="NBA"
      title={`${game.visitor_team.city} vs ${game.home_team.city}`}
    >
      {/* Teams and score row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "16px" }}>
        {/* Visitor */}
        <div style={{ flex: 1, textAlign: "center" }}>
          <p style={{ color: "var(--text-soft)", fontSize: "11px", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Away
          </p>
          <p style={{ fontWeight: 700, fontSize: "16px", color: "var(--text)", marginBottom: "2px" }}>
            {game.visitor_team.abbreviation}
          </p>
          <p style={{ fontSize: "12px", color: "var(--text-dim)", marginBottom: "8px" }}>{game.visitor_team.name}</p>
          {(isLive || isFinal) && (
            <p style={{ fontSize: "28px", fontWeight: 800, color: "var(--text)", lineHeight: 1 }}>
              {game.visitor_team_score}
            </p>
          )}
        </div>

        {/* Separator */}
        <div style={{ textAlign: "center", color: "var(--text-dim)", fontSize: "13px", fontWeight: 500 }}>
          {isLive ? <span style={{ color: "var(--green)", fontWeight: 700 }}>●</span> : null}
          <div>@</div>
        </div>

        {/* Home */}
        <div style={{ flex: 1, textAlign: "center" }}>
          <p style={{ color: "var(--text-soft)", fontSize: "11px", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Home
          </p>
          <p style={{ fontWeight: 700, fontSize: "16px", color: "var(--text)", marginBottom: "2px" }}>
            {game.home_team.abbreviation}
          </p>
          <p style={{ fontSize: "12px", color: "var(--text-dim)", marginBottom: "8px" }}>{game.home_team.name}</p>
          {(isLive || isFinal) && (
            <p style={{ fontSize: "28px", fontWeight: 800, color: "var(--text)", lineHeight: 1 }}>
              {game.home_team_score}
            </p>
          )}
        </div>
      </div>

      {/* Odds display */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
        <button
          className={`glass-button is-secondary is-sm${betState.side === "visitor" ? " is-active" : ""}${!isBettable ? " is-loading" : ""}`}
          disabled={!isBettable || isPending}
          onClick={() => isBettable && onSideSelect("visitor")}
          style={{ flex: 1, display: "flex", flexDirection: "column", gap: "2px", alignItems: "center" }}
          type="button"
        >
          <span style={{ fontSize: "10px", opacity: 0.7, textTransform: "uppercase" }}>{game.visitor_team.abbreviation}</span>
          <span style={{ fontSize: "16px", fontWeight: 700, color: betState.side === "visitor" ? "var(--green)" : "var(--text)" }}>
            {odds.visitor.toFixed(2)}x
          </span>
        </button>

        <button
          className={`glass-button is-secondary is-sm${betState.side === "home" ? " is-active" : ""}${!isBettable ? " is-loading" : ""}`}
          disabled={!isBettable || isPending}
          onClick={() => isBettable && onSideSelect("home")}
          style={{ flex: 1, display: "flex", flexDirection: "column", gap: "2px", alignItems: "center" }}
          type="button"
        >
          <span style={{ fontSize: "10px", opacity: 0.7, textTransform: "uppercase" }}>{game.home_team.abbreviation}</span>
          <span style={{ fontSize: "16px", fontWeight: 700, color: betState.side === "home" ? "var(--green)" : "var(--text)" }}>
            {odds.home.toFixed(2)}x
          </span>
        </button>
      </div>

      {/* Bet input + action */}
      {isBettable ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <GlassInput
            label="Bet Amount (ETH)"
            min="0"
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onAmountChange(e.target.value)}
            placeholder="0.01"
            step="0.001"
            type="number"
            value={betState.amount}
          />

          {potentialPayout && betState.side ? (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "var(--text-soft)", padding: "0 2px" }}>
              <span>Betting on {betState.side === "home" ? game.home_team.full_name : game.visitor_team.full_name}</span>
              <span style={{ color: "var(--green)" }}>→ {potentialPayout} ETH</span>
            </div>
          ) : null}

          {!betState.marketAddress ? (
            <p style={{ fontSize: "11px", color: "var(--text-dim)", padding: "0 2px" }}>
              No market yet — placing your bet will create one (requires 0.01 ETH initial liquidity + bet amount).
            </p>
          ) : null}

          <GlassButton
            disabled={walletBlocked || !cofheConnected || !betState.side || !betState.amount || isPending}
            loading={isPending}
            onClick={() => onBet(game)}
          >
            {!betState.side ? "Select a team above" : actionLabel}
          </GlassButton>

          {betState.marketAddress ? (
            <p style={{ fontSize: "10px", color: "var(--text-dim)", textAlign: "center" }}>
              Market:{" "}
              <a
                href={`${CASFIN_CONFIG.explorerBaseUrl}/address/${betState.marketAddress}`}
                rel="noreferrer"
                style={{ color: "var(--green)" }}
                target="_blank"
              >
                {betState.marketAddress.slice(0, 8)}…{betState.marketAddress.slice(-6)}
              </a>
            </p>
          ) : null}
        </div>
      ) : (
        <p style={{ textAlign: "center", color: "var(--text-dim)", fontSize: "13px", padding: "8px 0" }}>
          Game finished — no new bets accepted.
        </p>
      )}
    </GlassCard>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function SportsPage() {
  const {
    account,
    connectWallet,
    ensureTargetNetwork,
    isConnected,
    isCorrectChain,
    pendingAction,
    runTransaction,
    walletBlocked,
  } = useWallet();
  const { encryptUint128, connected: cofheConnected } = useCofhe();

  const [games, setGames] = useState<SportGame[]>([]);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [betStates, setBetStates] = useState<Record<number, GameBetState>>({});
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Fetch games
  useEffect(() => {
    setLoading(true);
    fetch("/api/sports/games")
      .then((r) => r.json())
      .then((body) => {
        if (!mountedRef.current) return;
        if (body.error) setLoadError(body.error);
        const fetched: SportGame[] = body.games || [];
        setGames(fetched);
        // Initialise bet state from localStorage
        const initial: Record<number, GameBetState> = {};
        for (const g of fetched) {
          initial[g.id] = {
            amount: "0.01",
            side: null,
            marketAddress: readStoredMarket(g.id),
            volume: readStoredVolume(g.id),
          };
        }
        setBetStates(initial);
      })
      .catch((err) => {
        if (mountedRef.current) setLoadError(String(err));
      })
      .finally(() => {
        if (mountedRef.current) setLoading(false);
      });
  }, []);

  function updateBetState(gameId: number, patch: Partial<GameBetState>) {
    setBetStates((prev) => ({
      ...prev,
      [gameId]: { ...prev[gameId], ...patch },
    }));
  }

  function handlePageAction() {
    if (!isConnected) { void connectWallet(); return; }
    if (!isCorrectChain) {
      void ensureTargetNetwork().catch((e) => console.warn("[Sports]", e));
      return;
    }
    setLoading(true);
    setLoadError("");
    fetch("/api/sports/games")
      .then((r) => r.json())
      .then((body) => {
        if (!mountedRef.current) return;
        if (body.error) setLoadError(body.error);
        setGames(body.games || []);
      })
      .catch((e) => { if (mountedRef.current) setLoadError(String(e)); })
      .finally(() => { if (mountedRef.current) setLoading(false); });
  }

  async function handleBet(game: SportGame) {
    const state = betStates[game.id];
    if (!state?.side || !state?.amount) return;

    const outcomeIndex = state.side === "visitor" ? 0 : 1; // visitor=0, home=1 (outcomes order)
    const existingMarket = state.marketAddress;
    const betAmountWei = parseRequiredEth(state.amount, "Bet amount");
    const initialLiquidityWei = parseRequiredEth(INITIAL_LIQUIDITY_ETH, "Initial liquidity");

    const success = await runTransaction(`Sports bet ${game.id}`, async (signer) => {
      let marketAddress = existingMarket;

      // ── Step 1: create market if it doesn't exist ──────────────────────
      if (!marketAddress) {
        const factory = new ethers.Contract(
          CASFIN_CONFIG.addresses.marketFactory,
          MARKET_FACTORY_ABI,
          signer
        );

        const resolvesAt = getResolveAt(game);
        const question = buildQuestion(game);
        const description = buildDescription(game);
        // outcomes[0] = visitor (away), outcomes[1] = home
        const outcomes = [game.visitor_team.full_name, game.home_team.full_name];

        const createTx = await factory.createMarket(
          [
            question,
            description,
            outcomes,
            resolvesAt,
            DISPUTE_WINDOW_SECS,
            0,                        // oracleType: Manual
            ethers.ZeroAddress,       // oracleAddress
            "0x",                     // oracleParams
            initialLiquidityWei,
          ],
          { value: initialLiquidityWei }
        );

        const receipt = await createTx.wait();
        const parsed = extractMarketAddress(receipt.logs);
        if (!parsed) throw new Error("Market created but address could not be parsed from receipt.");

        marketAddress = parsed;
        try { localStorage.setItem(LS_MARKET_KEY(game.id), marketAddress); } catch {}
      }

      // ── Step 2: buy shares ─────────────────────────────────────────────
      const market = new ethers.Contract(marketAddress, PREDICTION_MARKET_ABI, signer);
      const encAmount = await encryptUint128(betAmountWei);
      return market.buyShares(outcomeIndex, encAmount, { value: betAmountWei });
    });

    if (success) {
      const betAmountEth = parseFloat(state.amount) || 0;
      const newVolume = {
        ...betStates[game.id].volume,
        [state.side]: (betStates[game.id].volume[state.side] || 0) + betAmountEth,
      };
      writeStoredVolume(game.id, newVolume);

      updateBetState(game.id, {
        marketAddress: readStoredMarket(game.id) ?? betStates[game.id].marketAddress,
        volume: newVolume,
        amount: "0.01",
        side: null,
      });
    }
  }

  const liveCount = games.filter((g) => g.status === "In Progress").length;
  const upcomingCount = games.filter((g) => g.status === "scheduled").length;
  const marketsCreated = games.filter((g) => betStates[g.id]?.marketAddress).length;

  return (
    <main className="page-shell is-narrow">
      {/* ── Header ── */}
      <section className="page-header">
        <div>
          <p className="page-eyebrow">Predictions</p>
          <h1 className="page-title">Sports Betting</h1>
        </div>
        <div className="page-actions">
          <GlassButton disabled={Boolean(pendingAction)} onClick={handlePageAction} variant="secondary">
            {!isConnected ? "Connect Wallet" : !isCorrectChain ? "Switch Network" : "Refresh"}
          </GlassButton>
        </div>
      </section>

      {/* ── Tab strip ── */}
      <div className="pill-grid" style={{ marginBottom: "8px" }}>
        <Link href="/predictions">
          <GlassButton variant="pill">Markets</GlassButton>
        </Link>
        <Link href="/predictions/sports">
          <GlassButton active variant="pill">Sports</GlassButton>
        </Link>
      </div>

      {/* ── Error ── */}
      {loadError ? (
        <GlassCard className="notice-card tone-danger" stagger={1}>
          <p>Failed to load games: {loadError}</p>
        </GlassCard>
      ) : null}

      {/* ── Stats ── */}
      <section className="stat-grid">
        <StatCard label="Games Today" stagger={2} value={loading ? "—" : String(games.length)} />
        <StatCard label="Live Now" stagger={3} value={loading ? "—" : String(liveCount)} />
        <StatCard label="Upcoming" stagger={4} value={loading ? "—" : String(upcomingCount)} />
        <StatCard label="Markets Created" stagger={5} value={loading ? "—" : String(marketsCreated)} />
      </section>

      {/* ── Info card ── */}
      <GlassCard
        className="notice-card"
        description="Bets are settled on-chain via the Encrypted Prediction Market. All position sizes stay private. Markets resolve manually — the operator confirms the winner after the game ends."
        eyebrow="How it works"
        stagger={6}
        title="FHE-encrypted sports markets"
      />

      {/* ── Games ── */}
      {loading ? (
        <GlassCard className="empty-state" eyebrow="Loading" stagger={7} title="Fetching today's games…" />
      ) : games.length === 0 ? (
        <GlassCard
          className="empty-state"
          eyebrow="No Games"
          stagger={7}
          title="No NBA games scheduled for today or tomorrow."
        />
      ) : (
        <div className="prediction-stack" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "16px" }}>
          {games.map((game, index) => (
            <SportGameCard
              betState={
                betStates[game.id] ?? {
                  amount: "0.01",
                  side: null,
                  marketAddress: null,
                  volume: { home: 0, visitor: 0 },
                }
              }
              cofheConnected={cofheConnected}
              game={game}
              key={game.id}
              onAmountChange={(amount) => updateBetState(game.id, { amount })}
              onBet={handleBet}
              onSideSelect={(side) => updateBetState(game.id, { side })}
              pendingAction={pendingAction}
              walletBlocked={walletBlocked}
            />
          ))}
        </div>
      )}

      {/* ── Footer note ── */}
      {games.length > 0 ? (
        <GlassCard className="notice-card" stagger={8 + games.length}>
          <p style={{ fontSize: "12px", color: "var(--text-dim)", textAlign: "center" }}>
            Odds shift as ETH flows to each side. Markets resolve after the final buzzer — check the{" "}
            <Link href="/predictions" style={{ color: "var(--green)" }}>Markets tab</Link> to claim winnings.
          </p>
        </GlassCard>
      ) : null}
    </main>
  );
}
