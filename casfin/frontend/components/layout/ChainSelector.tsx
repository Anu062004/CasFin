"use client";

import { useWallet } from "@/components/WalletProvider";
import { CASFIN_CONFIG } from "@/lib/casfin-config";

export default function ChainSelector() {
  const { connectWallet, ensureTargetNetwork, isConnected, isCorrectChain, pendingAction } = useWallet();

  const label = !isConnected
    ? CASFIN_CONFIG.chainName
    : isCorrectChain
      ? CASFIN_CONFIG.chainName
      : "Wrong network";

  const toneClass = !isConnected
    ? "is-idle"
    : isCorrectChain
      ? "is-live"
      : "is-warning";

  async function handleClick() {
    if (!isConnected) {
      await connectWallet();
      return;
    }

    if (!isCorrectChain) {
      await ensureTargetNetwork();
    }
  }

  return (
    <button
      className={`top-chain-selector ${toneClass}`}
      disabled={Boolean(pendingAction)}
      onClick={() => void handleClick()}
      type="button"
    >
      <span className="top-chain-icon" aria-hidden="true" />
      <span>{label}</span>
      <span className="top-chain-caret" aria-hidden="true">+</span>
    </button>
  );
}
