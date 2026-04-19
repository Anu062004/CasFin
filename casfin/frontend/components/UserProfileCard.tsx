"use client";

import { useState } from "react";
import { ethers } from "ethers";
import GlassCard from "@/components/GlassCard";
import { useWallet } from "@/components/WalletProvider";
import { formatAddress } from "@/lib/casfin-client";
import { updateDisplayName } from "@/lib/user-client";
import type { UserProfile } from "@/lib/user-client";

interface Props {
  profile: UserProfile | null;
  onProfileUpdated: (profile: UserProfile) => void;
  stagger?: number;
}

export default function UserProfileCard({ profile, onProfileUpdated, stagger }: Props) {
  const { account, isConnected, signMessage } = useWallet();
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [copied, setCopied] = useState(false);

  const avatarLetters = account ? account.slice(2, 4).toUpperCase() : "??";

  function startEditing() {
    setNameInput(profile?.displayName ?? "");
    setSaveError("");
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setSaveError("");
  }

  function handleCopy() {
    if (!account) return;
    navigator.clipboard.writeText(account).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function handleSave() {
    if (!account) return;
    const trimmed = nameInput.trim();
    if (trimmed && !/^[a-zA-Z0-9 ]{1,24}$/.test(trimmed)) {
      setSaveError("Max 24 chars — letters, numbers and spaces only.");
      return;
    }

    setSaving(true);
    setSaveError("");
    try {
      const updated = await updateDisplayName(account, trimmed, { signMessage });
      onProfileUpdated(updated);
      setEditing(false);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  }

  function formatWinRate(rate: number) {
    return `${(rate * 100).toFixed(1)}%`;
  }

  function formatBiggestWin(wei: string) {
    if (!wei || wei === "0") return "None";
    const eth = Number(ethers.formatEther(wei));
    return eth < 0.0001 ? "<0.0001 ETH" : `${eth.toFixed(4)} ETH`;
  }

  if (!isConnected) {
    return (
      <GlassCard eyebrow="Profile" stagger={stagger} title="Player Profile">
        <p className="profile-empty">Connect your wallet to view your profile.</p>
      </GlassCard>
    );
  }

  return (
    <GlassCard eyebrow="Profile" stagger={stagger} title="Player Profile">
      <div className="profile-body">
        <div className="profile-identity">
          <div className="profile-avatar">{avatarLetters}</div>
          <div className="profile-identity-info">
            {editing ? (
              <div className="profile-edit-row">
                <input
                  autoFocus
                  className="profile-name-input"
                  maxLength={24}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void handleSave(); if (e.key === "Escape") cancelEditing(); }}
                  placeholder="Display name"
                  type="text"
                  value={nameInput}
                />
                <button className="profile-save-btn" disabled={saving} onClick={() => void handleSave()} type="button">
                  {saving ? "…" : "Save"}
                </button>
                <button className="profile-cancel-btn" disabled={saving} onClick={cancelEditing} type="button">
                  Cancel
                </button>
              </div>
            ) : (
              <div className="profile-name-row">
                <span className="profile-display-name">
                  {profile?.displayName ?? "Anonymous Player"}
                </span>
                <button className="profile-edit-btn" onClick={startEditing} title="Edit name" type="button">
                  ✎
                </button>
              </div>
            )}
            {saveError ? <p className="profile-save-error">{saveError}</p> : null}
            <div className="profile-address-row">
              <span className="profile-address">{formatAddress(account)}</span>
              <button className="profile-copy-btn" onClick={handleCopy} title="Copy address" type="button">
                {copied ? "✓" : "⎘"}
              </button>
            </div>
          </div>
        </div>

        {profile?.firstSeenAt ? (
          <p className="profile-member-since">Member since {formatDate(profile.firstSeenAt)}</p>
        ) : null}

        {profile?.stats ? (
          <div className="profile-stats-grid">
            {[
              ["Total Bets", String(profile.stats.totalBets)],
              ["Wins", String(profile.stats.totalWins)],
              ["Win Rate", formatWinRate(profile.stats.winRate)],
              ["Biggest Win", formatBiggestWin(profile.stats.biggestWinWei)],
            ].map(([label, value]) => (
              <div className="profile-stat" key={label}>
                <span className="profile-stat-label">{label}</span>
                <strong className="profile-stat-value">{value}</strong>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </GlassCard>
  );
}
