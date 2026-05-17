"use client";

import ChainSelector from "@/components/layout/ChainSelector";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import { CASFIN_CONFIG } from "@/lib/casfin-config";
import { formatAddress, formatEth } from "@/lib/casfin-client";

const NAV_LINKS = [
  { href: "/casino/coin-toss", label: "Casino" },
  { href: "/predictions", label: "Prediction Markets" },
  { href: "/wallet", label: "Wallet" }
];

function railStatusLabel(isConnected: boolean, isCorrectChain: boolean) {
  if (!isConnected) return "Read only";
  if (!isCorrectChain) return "Switch required";
  return "Encrypted rail live";
}

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
    : "Connect Wallet";

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

  function linkIsActive(href: string) {
    if (href === "/casino/coin-toss") {
      return pathname.startsWith("/casino");
    }

    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <>
      <header className="top-nav">
        <div className="top-nav-inner">
          <Link aria-label="Back to home" className="top-nav-brand" href="/">
            <span className="top-nav-mark">CF</span>
            <span className="top-nav-wordmark">
              <strong>CasFin</strong>
              <span>Encrypted casino rail</span>
            </span>
          </Link>

          <ChainSelector />

          <nav aria-label="Primary" className="top-nav-center">
            {NAV_LINKS.map((link) => (
              <Link
                className={linkIsActive(link.href) ? "top-nav-link is-active" : "top-nav-link"}
                href={link.href}
                key={link.href}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="top-nav-right">
            <div className="nav-inline-pill">
              <span className="nav-inline-dot" />
              <span>{railStatusLabel(isConnected, isCorrectChain)}</span>
            </div>

            <button
              className={`wallet-launcher ${!isConnected ? "is-primary" : ""}`}
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

            <button
              className="top-nav-menu-toggle"
              onClick={() => setMenuOpen((current) => !current)}
              type="button"
            >
              <span />
              <span />
              <span />
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

      <button
        aria-hidden={!menuOpen}
        className={menuOpen ? "mobile-backdrop is-open" : "mobile-backdrop"}
        onClick={closeMenu}
        type="button"
      />
      <aside className={menuOpen ? "top-nav-drawer is-open" : "top-nav-drawer"}>
        <div className="top-nav-drawer-links">
          {NAV_LINKS.map((link) => (
            <Link
              className={linkIsActive(link.href) ? "top-nav-link is-active" : "top-nav-link"}
              href={link.href}
              key={link.href}
              onClick={closeMenu}
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="top-nav-drawer-actions">
          <ChainSelector />
          <button className={`wallet-launcher ${!isConnected ? "is-primary" : ""}`} onClick={handleWalletBtnClick} type="button">
            {isConnected ? formatAddress(account) : "Connect Wallet"}
          </button>
        </div>
      </aside>
    </>
  );
}
