import { ethers } from "ethers";

export interface SessionKeyState {
  privateKey: string;
  address: string;
  playerAddress: string;
  expiresAt: number; // ms timestamp
  vaultAddress?: string; // vault contract this session was authorized against — drop on mismatch after redeploy
}

const STORAGE_KEY = "casfin_session_key_v1";

export function generateSessionWallet(): ethers.HDNodeWallet {
  return ethers.Wallet.createRandom();
}

export function persistSessionKey(state: SessionKeyState): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // sessionStorage unavailable (SSR or private mode)
  }
}

export function restoreSessionKey(): SessionKeyState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw) as SessionKeyState;
    if (!isSessionValid(state)) {
      clearSessionKey();
      return null;
    }
    return state;
  } catch {
    return null;
  }
}

export function clearSessionKey(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function isSessionValid(state: SessionKeyState | null): boolean {
  if (!state) return false;
  return Date.now() < state.expiresAt;
}

export function getSessionWallet(state: SessionKeyState, provider: ethers.JsonRpcProvider): ethers.Wallet {
  return new ethers.Wallet(state.privateKey, provider);
}
