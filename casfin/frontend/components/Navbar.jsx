"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import { formatAddress, formatEth } from "@/lib/casfin-client";

const NAV_LINKS = [
  { href: "/casino", label: "Casino" },
  { href: "/predictions", label: "Predictions" },
  { href: "/wallet", label: "Wallet" }
];

export default function Navbar() {
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
    walletBalance
  } = useWallet();

  const walletLabel = isConnected ? formatAddress(account) : "Connect";
  const networkClass = !isConnected ? "is-neutral" : isCorrectChain ? "is-online" : "is-offline";
  const networkLabel = !isConnected ? "Not connected" : isCorrectChain ? "Arbitrum Sepolia" : "Wrong Network";

  function closeMenu() { setMenuOpen(false); }

  function handleWalletBtnClick() {
    setWalletModalOpen(true);
    closeMenu();
  }

  useEffect(() => {
    if (!walletModalOpen) {
      return;
    }

    void refreshWalletState({ loadProtocol: false, requestAccounts: isConnected });
  }, [isConnected, walletModalOpen]);

  return (
    <>
      <header className={`site-navbar ${pathname === "/" ? "is-home" : ""}`}>
        <div className="navbar-inner">
          {/* No branding — just nav links on left */}
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
            {isConnected && (
              <button
                className={`network-pill ${networkClass}`}
                onClick={() => !isCorrectChain && ensureTargetNetwork()}
                type="button"
              >
                <span className="network-dot" />
                {networkLabel}
              </button>
            )}

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
              onClick={() => setMenuOpen((v) => !v)}
              type="button"
            >
              <span /><span /><span />
            </button>
          </div>
        </div>
      </header>

      {/* Wallet Modal */}
      {walletModalOpen && (
        <div className="wm-backdrop" onClick={() => setWalletModalOpen(false)}>
          <div className="wm-panel" onClick={(e) => e.stopPropagation()}>
            <div className="wm-header">
              <span className="wm-title">{isConnected ? "Wallet" : "Connect Wallet"}</span>
              <button className="wm-close" onClick={() => setWalletModalOpen(false)} type="button">✕</button>
            </div>

            {isConnected ? (
              /* Connected state */
              <div className="wm-connected">
                <div className="wm-avatar">
                  {account.slice(2, 4).toUpperCase()}
                </div>
                <p className="wm-address">{account}</p>
                <p className="wm-network-row">Balance: {formatEth(walletBalance)} ETH</p>
                <p className="wm-network-row">
                  <span className={`wm-net-dot ${isCorrectChain ? "dot-ok" : "dot-bad"}`} />
                  {isCorrectChain ? "Arbitrum Sepolia" : "Wrong Network"}
                </p>
                <div className="wm-connected-actions">
                  {!isCorrectChain && (
                    <button
                      className="wm-action-btn wm-switch-btn"
                      onClick={() => { ensureTargetNetwork(); setWalletModalOpen(false); }}
                      type="button"
                    >
                      Switch to Arbitrum Sepolia
                    </button>
                  )}
                  <button
                    className="wm-action-btn"
                    onClick={() => { router.push("/wallet"); setWalletModalOpen(false); }}
                    type="button"
                  >
                    View Wallet
                  </button>
                  <button
                    className="wm-action-btn wm-disconnect-btn"
                    onClick={() => { disconnectWallet(); setWalletModalOpen(false); }}
                    type="button"
                  >
                    Disconnect
                  </button>
                </div>
              </div>
            ) : (
              /* Connect options */
              <div className="wm-options">
                <button
                  className="wm-wallet-option"
                  onClick={() => { connectWallet("metamask"); setWalletModalOpen(false); }}
                  type="button"
                >
                  <span className="wm-wallet-icon">🦊</span>
                  <div className="wm-wallet-info">
                    <strong>MetaMask</strong>
                    <span>Browser extension</span>
                  </div>
                  <span className="wm-wallet-arrow">→</span>
                </button>

                <button
                  className="wm-wallet-option"
                  onClick={() => { connectWallet("coinbase"); setWalletModalOpen(false); }}
                  type="button"
                >
                  <span className="wm-wallet-icon">🔵</span>
                  <div className="wm-wallet-info">
                    <strong>Coinbase Wallet</strong>
                    <span>Smart wallet</span>
                  </div>
                  <span className="wm-wallet-arrow">→</span>
                </button>

                <button
                  className="wm-wallet-option"
                  onClick={() => { connectWallet("injected"); setWalletModalOpen(false); }}
                  type="button"
                >
                  <span className="wm-wallet-icon">💎</span>
                  <div className="wm-wallet-info">
                    <strong>Browser Wallet</strong>
                    <span>Any injected wallet</span>
                  </div>
                  <span className="wm-wallet-arrow">→</span>
                </button>

                <p className="wm-footnote">
                  By connecting you agree to use this app at your own risk on Arbitrum Sepolia testnet.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mobile drawer */}
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
