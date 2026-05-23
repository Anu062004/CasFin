"use client";

import ChainSelector from "@/components/layout/ChainSelector";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import { buildExplorerUrl, CASFIN_CONFIG } from "@/lib/casfin-config";
import { formatAddress, formatEth } from "@/lib/casfin-client";
import { CASINO_GAMES } from "@/lib/casino-games";

type SearchTarget = {
  href: string;
  label: string;
  aliases: string[];
};

const SEARCH_TARGETS: SearchTarget[] = [
  { href: "/", label: "Overview", aliases: ["home", "dashboard", "overview", "casfin"] },
  { href: "/casino/coin-toss", label: "Casino", aliases: ["casino", "lobby", "games"] },
  { href: "/predictions", label: "Prediction Markets", aliases: ["prediction", "predictions", "markets"] },
  { href: "/predictions/sports", label: "Sports View", aliases: ["sports", "matches", "fixtures"] },
  { href: "/wallet", label: "Wallet", aliases: ["wallet", "vault", "profile", "balance"] },
  ...CASINO_GAMES.map((game) => ({
    href: `/casino/${game.slug}`,
    label: game.label,
    aliases: [game.slug, game.label.toLowerCase(), game.kicker.toLowerCase()]
  }))
];

function railStatusLabel(isConnected: boolean, isCorrectChain: boolean, sessionActive: boolean) {
  if (!isConnected) return "Read only";
  if (!isCorrectChain) return "Switch network";
  if (sessionActive) return "Encrypted session live";
  return "Write enabled";
}

function railStatusTone(isConnected: boolean, isCorrectChain: boolean, sessionActive: boolean) {
  if (!isConnected) return "is-idle";
  if (!isCorrectChain) return "is-warning";
  if (sessionActive) return "is-live";
  return "is-ready";
}

function findSearchTarget(query: string) {
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  return (
    SEARCH_TARGETS.find((target) => {
      const terms = [target.label.toLowerCase(), ...target.aliases];
      return terms.some((term) => term.includes(normalized) || normalized.includes(term));
    }) ?? null
  );
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
      <path d="m20 20-3.6-3.6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path d="M4 7h16" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <path d="M4 12h16" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <path d="M4 17h16" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path d="m15 18-6-6 6-6" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

export default function NavbarPrivy() {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const {
    account,
    casinoState,
    connectWallet,
    disconnectWallet,
    ensureTargetNetwork,
    isConnected,
    isCorrectChain,
    pendingAction,
    predictionState,
    refreshWalletState,
    sessionActive,
    sessionExpiry,
    userProfile,
    walletBalance
  } = useWallet();

  const walletLabel = isConnected
    ? (userProfile?.displayName ?? formatAddress(account))
    : "Connect Wallet";
  const sessionMinutesRemaining = sessionActive && sessionExpiry
    ? Math.max(0, Math.floor((sessionExpiry - Date.now()) / 60000))
    : 0;

  const coreItems = [
    {
      href: "/",
      label: "Overview",
      description: "Dashboard and shortcuts",
      mark: "OV"
    },
    {
      href: "/casino/coin-toss",
      label: "Casino",
      description: "Encrypted game rail",
      mark: "CS",
      badge: String(CASINO_GAMES.length)
    },
    {
      href: "/predictions",
      label: "Predictions",
      description: "Markets and factory",
      mark: "PM",
      badge: predictionState.totalMarkets > 0 ? String(predictionState.totalMarkets) : undefined
    }
  ];

  const gameItems = CASINO_GAMES.map((game) => ({
    href: `/casino/${game.slug}`,
    label: game.label,
    description: game.kicker,
    mark: game.shortLabel,
    live: game.slug === "crash" && Boolean(casinoState.crash.latestRound) && !casinoState.crash.latestRound.closed
  }));

  const accountItems = [
    {
      href: "/wallet",
      label: "Wallet",
      description: "Deposits and profile",
      mark: "WL"
    },
    {
      href: "/predictions/sports",
      label: "Sports",
      description: "Matchup boards",
      mark: "SP"
    },
    {
      href: isConnected ? buildExplorerUrl("address", account) : CASFIN_CONFIG.explorerBaseUrl,
      label: "Arbiscan",
      description: "Contracts and activity",
      mark: "EX",
      external: true
    }
  ];

  function closeMenu() {
    setMenuOpen(false);
  }

  function handleWalletBtnClick() {
    if (!isConnected) {
      void connectWallet();
      closeMenu();
      return;
    }

    setWalletModalOpen(true);
    closeMenu();
  }

  function handleWalletCardClick() {
    if (!isConnected) {
      void connectWallet();
      closeMenu();
      return;
    }

    router.push("/wallet");
    closeMenu();
  }

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const target = findSearchTarget(searchQuery);

    if (!target) {
      return;
    }

    router.push(target.href);
    setSearchQuery("");
    closeMenu();
  }

  function linkIsActive(href: string) {
    if (href === "/") {
      return pathname === "/";
    }

    if (href === "/casino/coin-toss") {
      return pathname.startsWith("/casino");
    }

    return pathname === href || pathname.startsWith(`${href}/`);
  }

  function renderSidebarLink(item: {
    href: string;
    label: string;
    description: string;
    mark: string;
    badge?: string;
    live?: boolean;
    external?: boolean;
  }) {
    const active = !item.external && linkIsActive(item.href);
    const className = active ? "chrome-nav-item is-active" : "chrome-nav-item";

    if (item.external) {
      return (
        <a
          className={className}
          href={item.href}
          key={item.label}
          rel="noreferrer"
          target="_blank"
        >
          <span className="chrome-nav-mark">{item.mark}</span>
          <span className="chrome-nav-copy">
            <strong>{item.label}</strong>
            <span>{item.description}</span>
          </span>
        </a>
      );
    }

    return (
      <Link className={className} href={item.href} key={item.href} onClick={closeMenu}>
        <span className="chrome-nav-mark">{item.mark}</span>
        <span className="chrome-nav-copy">
          <strong>{item.label}</strong>
          <span>{item.description}</span>
        </span>
        {item.badge ? <span className="chrome-nav-badge">{item.badge}</span> : null}
        {item.live ? <span className="chrome-nav-live-dot" /> : null}
      </Link>
    );
  }

  useEffect(() => {
    if (!walletModalOpen || !isConnected) {
      return;
    }

    void refreshWalletState({ loadProtocol: false }).catch((error) => {
      console.warn("[NavbarPrivy] Failed to refresh wallet state for modal.", error);
    });
  }, [isConnected, refreshWalletState, walletModalOpen]);

  useEffect(() => {
    closeMenu();
  }, [pathname]);

  useEffect(() => {
    document.body.classList.toggle("shell-collapsed", sidebarCollapsed);

    return () => {
      document.body.classList.remove("shell-collapsed");
    };
  }, [sidebarCollapsed]);

  return (
    <>
      <button
        aria-hidden={!menuOpen}
        className={menuOpen ? "shell-backdrop is-open" : "shell-backdrop"}
        onClick={closeMenu}
        type="button"
      />

      <aside className={`chrome-sidebar ${sidebarCollapsed ? "is-collapsed" : ""} ${menuOpen ? "is-open" : ""}`}>
        <div className="chrome-sidebar-brand">
          <Link aria-label="Back to overview" className="chrome-brand-link" href="/" onClick={closeMenu}>
            <span className="chrome-brand-mark is-logo">
              <img alt="" className="chrome-brand-logo" src="/casfin-logo-emblem.jpg" />
            </span>
            <span className="chrome-brand-copy">
              <strong>CasFin</strong>
              <span>Encrypted rail</span>
            </span>
          </Link>

          <button
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="chrome-sidebar-toggle"
            onClick={() => setSidebarCollapsed((current) => !current)}
            type="button"
          >
            <ChevronIcon />
          </button>
        </div>

        <div className="chrome-sidebar-scroll">
          <section className="chrome-sidebar-section">
            <p className="chrome-sidebar-label">Core</p>
            {coreItems.map(renderSidebarLink)}
          </section>

          <section className="chrome-sidebar-section">
            <p className="chrome-sidebar-label">Games</p>
            {gameItems.map(renderSidebarLink)}
          </section>

          <section className="chrome-sidebar-section">
            <p className="chrome-sidebar-label">Account</p>
            {accountItems.map(renderSidebarLink)}
          </section>
        </div>

        <div className="chrome-sidebar-wallet">
          <div className="chrome-wallet-card">
            <p className="chrome-wallet-label">Wallet Balance</p>
            <strong className="chrome-wallet-balance">
              {isConnected ? formatEth(walletBalance) : "0.0000"}
              <span>ETH</span>
            </strong>
            <p className="chrome-wallet-meta">
              {sessionActive
                ? `Session live for ${sessionMinutesRemaining} min`
                : isConnected
                  ? railStatusLabel(isConnected, isCorrectChain, sessionActive)
                  : "Connect to unlock deposits and encrypted play"}
            </p>
            <button className="chrome-wallet-action" onClick={handleWalletCardClick} type="button">
              {isConnected ? "Open Wallet" : "Connect Wallet"}
            </button>
          </div>
        </div>
      </aside>

      <header className="chrome-topbar">
        <button
          aria-label="Open navigation"
          className="chrome-mobile-toggle"
          onClick={() => setMenuOpen((current) => !current)}
          type="button"
        >
          <MenuIcon />
        </button>

        <form className="chrome-search" onSubmit={handleSearchSubmit}>
          <span className="chrome-search-icon">
            <SearchIcon />
          </span>
          <input
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Jump to casino, wallet, dice, predictions..."
            type="search"
            value={searchQuery}
          />
          <button className="chrome-search-submit" type="submit">
            Jump
          </button>
        </form>

        <div className="chrome-topbar-right">
          <span className={`chrome-status-pill ${railStatusTone(isConnected, isCorrectChain, sessionActive)}`}>
            <span className="chrome-status-dot" />
            {railStatusLabel(isConnected, isCorrectChain, sessionActive)}
          </span>

          {sessionActive ? (
            <span className="chrome-status-pill is-session">
              Session {sessionMinutesRemaining}m
            </span>
          ) : null}

          <ChainSelector />

          <button
            className={`wallet-launcher chrome-wallet-launcher ${!isConnected ? "is-primary" : ""}`}
            disabled={Boolean(pendingAction)}
            onClick={handleWalletBtnClick}
            type="button"
          >
            {isConnected ? (
              <>
                <span className="wallet-launcher-dot" />
                {walletLabel}
              </>
            ) : (
              walletLabel
            )}
          </button>
        </div>
      </header>

      {walletModalOpen && isConnected ? (
        <div className="wm-backdrop" onClick={() => setWalletModalOpen(false)}>
          <div className="wm-panel" onClick={(event) => event.stopPropagation()}>
            <div className="wm-header">
              <span className="wm-title">Wallet</span>
              <button className="wm-close" onClick={() => setWalletModalOpen(false)} type="button">Close</button>
            </div>

            <div className="wm-connected">
              <div className="wm-avatar">
                {account.slice(2, 4).toUpperCase()}
              </div>
              {userProfile?.displayName ? (
                <p className="wm-display-name">{userProfile.displayName}</p>
              ) : (
                <p className="wm-display-name wm-anon">Anonymous player</p>
              )}
              <p className="wm-address">{account}</p>
              <p className="wm-network-row">Balance: {formatEth(walletBalance)} ETH</p>
              <p className="wm-network-row">
                <span className={`wm-net-dot ${isCorrectChain ? "dot-ok" : "dot-bad"}`} />
                {isCorrectChain ? CASFIN_CONFIG.chainName : "Wrong network"}
              </p>
              <div className="wm-connected-actions">
                {!userProfile?.displayName ? (
                  <button
                    className="wm-action-btn wm-setname-btn"
                    onClick={() => {
                      router.push("/wallet");
                      setWalletModalOpen(false);
                    }}
                    type="button"
                  >
                    Set display name
                  </button>
                ) : null}
                {!isCorrectChain ? (
                  <button
                    className="wm-action-btn wm-switch-btn"
                    onClick={() => {
                      void ensureTargetNetwork().catch((error) => {
                        console.warn("[NavbarPrivy] Failed to switch network from modal.", error);
                      });
                      setWalletModalOpen(false);
                    }}
                    type="button"
                  >
                    Switch to {CASFIN_CONFIG.chainName}
                  </button>
                ) : null}
                <button
                  className="wm-action-btn"
                  onClick={() => {
                    router.push("/wallet");
                    setWalletModalOpen(false);
                  }}
                  type="button"
                >
                  View wallet
                </button>
                <button
                  className="wm-action-btn wm-disconnect-btn"
                  onClick={() => {
                    disconnectWallet();
                    setWalletModalOpen(false);
                  }}
                  type="button"
                >
                  Disconnect
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
