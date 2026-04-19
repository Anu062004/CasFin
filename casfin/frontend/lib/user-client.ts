export interface UserStats {
  totalBets: number;
  totalWins: number;
  winRate: number;
  biggestWinWei: string;
}

export interface UserProfile {
  walletAddress: string;
  displayName: string | null;
  firstSeenAt: string;
  lastActiveAt: string;
  stats?: UserStats;
}

export async function fetchUserProfile(wallet: string): Promise<UserProfile | null> {
  try {
    const res = await fetch(`/api/user/profile?wallet=${wallet.toLowerCase()}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function ensureUserExists(wallet: string): Promise<UserProfile | null> {
  try {
    const res = await fetch("/api/user/ensure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet: wallet.toLowerCase() }),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function updateDisplayName(
  wallet: string,
  displayName: string,
  signer: { signMessage: (message: string) => Promise<string> }
): Promise<UserProfile> {
  const timestamp = Date.now();
  const message = `CasFin:setProfile:${wallet.toLowerCase()}:${timestamp}`;
  const signature = await signer.signMessage(message);

  const res = await fetch("/api/user/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet: wallet.toLowerCase(), displayName, signature, timestamp }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Failed to update display name");
  }

  return res.json();
}
