"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import { CASFIN_CONFIG } from "@/lib/casfin-config";
import { formatAddress, formatEth } from "@/lib/casfin-client";

const NAV_LINKS = [
  { href: "/casino", label: "Casino" },
  { href: "/predictions", label: "Predictions" },
  { href: "/wallet", label: "Wallet" }
];

export default function NavbarPrivy() {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [walletModalOpen, setWalletModalOpen] = useState(false);

  const {
    account,
    connectWallet,
    disconnectWallet,
    ensureTargetNetwork,
    isConnected,
    isCorrectChain,
    pendingAction,
    refreshWalletState,
    userProfile,
    walletBalance
  } = useWallet();

  const walletLabel = isConnected
    ? (userProfile?.displayName ?? formatAddress(account))
    : "Connect";
  const networkClass = !isConnected ? "is-neutral" : isCorrectChain ? "is-online" : "is-offline";
  const networkLabel = !isConnected ? "Not connected" : isCorrectChain ? CASFIN_CONFIG.chainName : "Wrong Network";

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

  useEffect(() => {
    if (!walletModalOpen || !isConnected) {
      return;
    }

    void refreshWalletState({ loadProtocol: false }).catch((error) => {
      console.warn("[NavbarPrivy] Failed to refresh wallet state for modal.", error);
    });
  }, [isConnected, refreshWalletState, walletModalOpen]);

  return (
    <>
      <header className={`site-navbar ${pathname === "/" ? "is-home" : ""}`}>
        <div className="navbar-inner">
          <Link href="/" className="navbar-brand" aria-label="Back to home">
            <span className="navbar-mark">C</span>
            <span className="navbar-wordmark">CasFin</span>
          </Link>

          <nav aria-label="Primary" className="navbar-links">
            {NAV_LINKS.map((link) => (
              <Link
                className={pathname === link.href ? "navbar-link is-active" : "navbar-link"}
                href={link.href}
                key={link.href}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="navbar-actions">
            {isConnected ? (
              <button
                className={`network-pill ${networkClass}`}
                onClick={() => {
                  if (!isCorrectChain) {
                    void ensureTargetNetwork().catch((error) => {
                      console.warn("[NavbarPrivy] Failed to switch network.", error);
                    });
                  }
                }}
                type="button"
              >
                <span className="network-dot" />
                {networkLabel}
              </button>
            ) : null}

            <button
              className="wallet-connect-btn"
              disabled={Boolean(pendingAction)}
              onClick={handleWalletBtnClick}
              type="button"
            >
              {isConnected ? (
                <>
                  <span className="wallet-btn-dot" />
                  {walletLabel}
                </>
              ) : (
                "Connect Wallet"
              )}
            </button>

            <button
              className={menuOpen ? "menu-toggle is-open" : "menu-toggle"}
              onClick={() => setMenuOpen((current) => !current)}
              type="button"
            >
              <span /><span /><span />
            </button>
          </div>
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
                <p className="wm-display-name wm-anon">Anonymous Player</p>
              )}
              <p className="wm-address">{account}</p>
              <p className="wm-network-row">Balance: {formatEth(walletBalance)} ETH</p>
              <p className="wm-network-row">
                <span className={`wm-net-dot ${isCorrectChain ? "dot-ok" : "dot-bad"}`} />
                {isCorrectChain ? CASFIN_CONFIG.chainName : "Wrong Network"}
              </p>
              <div className="wm-connected-actions">
                {!userProfile?.displayName ? (
                  <button
                    className="wm-action-btn wm-setname-btn"
                    onClick={() => { router.push("/wallet"); setWalletModalOpen(false); }}
                    type="button"
                  >
                    Set Display Name
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
                    Switch to Arbitrum Sepolia
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
                  View Wallet
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

      <button
        aria-hidden={!menuOpen}
        className={menuOpen ? "mobile-backdrop is-open" : "mobile-backdrop"}
        onClick={closeMenu}
        type="button"
      />
      <aside className={menuOpen ? "mobile-drawer is-open" : "mobile-drawer"}>
        <div className="mobile-drawer-head">
          <span style={{ color: "var(--text-primary)", fontWeight: 700 }}>Menu</span>
          <button className="mobile-close" onClick={closeMenu} type="button">Close</button>
        </div>
        <nav className="mobile-nav">
          {NAV_LINKS.map((link) => (
            <Link
              className={pathname === link.href ? "navbar-link is-active" : "navbar-link"}
              href={link.href}
              key={link.href}
              onClick={closeMenu}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="mobile-actions">
          <button className="wallet-connect-btn" onClick={handleWalletBtnClick} type="button">
            {isConnected ? formatAddress(account) : "Connect Wallet"}
          </button>
        </div>
      </aside>
    </>
  );
}
