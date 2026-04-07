"use client";

import { useEffect, useState } from "react";
import { ethers } from "ethers";
import GlassCard from "@/components/GlassCard";
import { useWallet } from "@/components/WalletProvider";
import { ENCRYPTED_VAULT_ABI } from "@/lib/casfin-abis";
import { CASFIN_CONFIG } from "@/lib/casfin-config";
import { formatEth, parseRequiredEth } from "@/lib/casfin-client";
import { useCofhe } from "@/lib/cofhe-provider";

const DEPOSIT_PRESETS = ["0.01", "0.05", "0.10", "0.25"];
const WITHDRAW_PRESETS = ["0.01", "0.05", "0.10", "0.25"];
const BANKROLL_PRESETS = ["0.10", "0.25", "0.50", "1.00"];

export default function VaultCard({
  casinoState,
  className = "",
  isOperator,
  large = false,
  pendingAction,
  runTransaction,
  setVaultForm,
  stagger = 0,
  vaultForm,
  walletBlocked
}) {
  const { decryptForView, encryptUint128, FheTypes, connected: cofheConnected } = useCofhe();
  const { connectWallet, ensureTargetNetwork, isConnected, isCorrectChain } = useWallet();
  const [decryptedBalance, setDecryptedBalance] = useState(null);
  const [decryptionFailed, setDecryptionFailed] = useState(false);
  const classes = ["vault-card", large ? "is-large" : "", className].filter(Boolean).join(" ");
  const usesEncryptedVault = casinoState.isFhe;
  const availableBalanceLabel =
    decryptedBalance !== null
      ? `${ethers.formatEther(decryptedBalance)} ETH`
      : usesEncryptedVault
        ? cofheConnected
          ? decryptionFailed
            ? "Encrypted"
            : "Decrypting..."
          : "Encrypted"
        : `${formatEth(casinoState.playerBalance)} ETH`;
  const lockedBalanceLabel = usesEncryptedVault ? "Encrypted" : `${formatEth(casinoState.playerLockedBalance)} ETH`;
  const hasPendingWithdrawal = Boolean(casinoState.pendingWithdrawal?.exists);
  const actionsBusy = Boolean(pendingAction) || Boolean(walletBlocked);

  async function ensureWalletActionReady(context: string) {
    try {
      if (!isConnected) {
        await connectWallet();
        return false;
      }

      if (!isCorrectChain) {
        await ensureTargetNetwork();
        return false;
      }

      return true;
    } catch (error) {
      console.warn(`[VaultCard] Failed to prepare wallet for ${context}.`, error);
      return false;
    }
  }

  function applyPreset(field, value) {
    setVaultForm((current) => ({ ...current, [field]: value }));
  }

  async function handleDeposit() {
    if (!(await ensureWalletActionReady("deposit"))) {
      return;
    }

    await runTransaction("Vault deposit", async (signer) => {
      const vault = new ethers.Contract(CASFIN_CONFIG.addresses.casinoVault, ENCRYPTED_VAULT_ABI, signer);
      return vault.depositETH({ value: parseRequiredEth(vaultForm.depositAmount, "Deposit") });
    });
  }

  async function handleWithdraw() {
    if (!(await ensureWalletActionReady("withdraw"))) {
      return;
    }

    await runTransaction("Withdraw vault balance", async (signer) => {
      const vault = new ethers.Contract(CASFIN_CONFIG.addresses.casinoVault, ENCRYPTED_VAULT_ABI, signer);
      const withdrawWei = hasPendingWithdrawal
        ? 0n
        : parseRequiredEth(vaultForm.withdrawAmount, "Withdraw amount");
      const encAmount = await encryptUint128(withdrawWei);
      return vault.withdrawETH(encAmount);
    });
  }

  async function handleFundBankroll() {
    if (!(await ensureWalletActionReady("fund bankroll"))) {
      return;
    }

    await runTransaction("Fund house bankroll", async (signer) => {
      const vault = new ethers.Contract(CASFIN_CONFIG.addresses.casinoVault, ENCRYPTED_VAULT_ABI, signer);
      return vault.fundHouseBankroll({ value: parseRequiredEth(vaultForm.bankrollAmount, "Bankroll") });
    });
  }

  const depositButtonLabel = pendingAction === "Vault deposit"
    ? "Depositing..."
    : !isConnected
      ? "Connect wallet to deposit"
      : !isCorrectChain
        ? "Switch to Arbitrum Sepolia"
        : "Deposit ETH";
  const withdrawButtonLabel = pendingAction === "Withdraw vault balance"
    ? "Preparing withdrawal..."
    : !isConnected
      ? "Connect wallet to withdraw"
      : !isCorrectChain
        ? "Switch to Arbitrum Sepolia"
        : hasPendingWithdrawal
          ? "Finalize pending withdrawal"
          : "Withdraw ETH";
  const bankrollButtonLabel = pendingAction === "Fund house bankroll"
    ? "Funding bankroll..."
    : !isConnected
      ? "Connect operator wallet"
      : !isCorrectChain
        ? "Switch to Arbitrum Sepolia"
        : "Fund bankroll";

  useEffect(() => {
    let cancelled = false;

    async function loadDecryptedBalance() {
      if (!cofheConnected || !casinoState.playerBalanceHandle) {
        if (!cancelled) {
          setDecryptedBalance(null);
          setDecryptionFailed(false);
        }

        return;
      }

      try {
        const balance = await decryptForView(casinoState.playerBalanceHandle, FheTypes.Uint128);

        if (!cancelled) {
          setDecryptedBalance(balance);
          setDecryptionFailed(false);
        }
      } catch (error) {
        if (!cancelled) {
          setDecryptedBalance(null);
          setDecryptionFailed(true);
        }

        console.warn("[VaultCard] Balance decryption failed.", error);
      }
    }

    loadDecryptedBalance();

    return () => {
      cancelled = true;
    };
  }, [casinoState.playerBalanceHandle, cofheConnected, decryptForView, FheTypes.Uint128]);

  return (
    <GlassCard
      className={classes}
      description="Deposit, withdraw, and monitor the same balance used across the casino."
      eyebrow="Vault"
      stagger={stagger}
      title="One balance across every game"
    >
      <div className="vault-hero">
        <div>
          <p className="wallet-balance-label">Your Balance</p>
          <h3 className="balance-figure">{availableBalanceLabel}</h3>
          <p className="vault-support-copy">Locked balance: {lockedBalanceLabel}</p>
          {usesEncryptedVault ? (
            <p className="vault-support-copy">
              Per-player vault balances are encrypted on-chain. Connect on Arbitrum Sepolia to decrypt your own handle for local display.
            </p>
          ) : null}
          {usesEncryptedVault && decryptionFailed ? (
            <p className="vault-support-copy">Balance decryption is not available yet for this wallet session. Deposits and bets can still use the encrypted balance flow.</p>
          ) : null}
          {hasPendingWithdrawal ? (
            <p className="vault-support-copy">A withdrawal is pending. Submit the button again to finalize it after the decrypt task completes.</p>
          ) : null}
        </div>

        <div className="mini-stat-grid">
          <div className="mini-stat">
            <span>Vault TVL</span>
            <strong>{formatEth(casinoState.vaultBalance)} ETH</strong>
          </div>
          <div className="mini-stat">
            <span>Available</span>
            <strong>{availableBalanceLabel}</strong>
          </div>
          <div className="mini-stat">
            <span>Locked</span>
            <strong>{lockedBalanceLabel}</strong>
          </div>
        </div>
      </div>

      <div className="split-panel-grid">
        <div className="vault-action-grid">
          <section className="vault-action-card">
            <div className="vault-action-head">
              <span className="casino-field-label">Deposit ETH</span>
              <p>Move wallet ETH into the shared casino vault once, then use it across every game.</p>
            </div>

            <input
              className="casino-field-input"
              min="0"
              onChange={(event) => setVaultForm((current) => ({ ...current, depositAmount: event.target.value }))}
              placeholder="0.05"
              step="0.01"
              type="number"
              value={vaultForm.depositAmount}
            />

            <div className="vault-chip-row">
              {DEPOSIT_PRESETS.map((preset) => (
                <button
                  className="casino-chip-button"
                  key={preset}
                  onClick={() => applyPreset("depositAmount", preset)}
                  type="button"
                >
                  {preset}
                </button>
              ))}
            </div>

            <button
              className="casino-primary-button"
              disabled={actionsBusy}
              onClick={handleDeposit}
              type="button"
            >
              {depositButtonLabel}
            </button>
          </section>

          <section className="vault-action-card">
            <div className="vault-action-head">
              <span className="casino-field-label">Withdraw ETH</span>
              <p>
                Submit an encrypted withdrawal request from the vault. Finalize it with the same control after the
                decrypt task completes.
              </p>
            </div>

            <input
              className="casino-field-input"
              min="0"
              onChange={(event) => setVaultForm((current) => ({ ...current, withdrawAmount: event.target.value }))}
              placeholder="0.01"
              step="0.01"
              type="number"
              value={vaultForm.withdrawAmount}
            />

            <div className="vault-chip-row">
              {WITHDRAW_PRESETS.map((preset) => (
                <button
                  className="casino-chip-button"
                  key={preset}
                  onClick={() => applyPreset("withdrawAmount", preset)}
                  type="button"
                >
                  {preset}
                </button>
              ))}
            </div>

            <button
              className="casino-secondary-button"
              disabled={actionsBusy}
              onClick={handleWithdraw}
              type="button"
            >
              {withdrawButtonLabel}
            </button>

            {!cofheConnected && isConnected && isCorrectChain ? (
              <p className="vault-inline-note">The encrypted wallet session will be refreshed automatically before the withdrawal is sent.</p>
            ) : null}
          </section>
        </div>
      </div>

      {isOperator ? (
        <div className="vault-operator-card">
          <div className="vault-action-head">
            <span className="casino-field-label">Operator bankroll</span>
            <p>Top up the house bankroll from the operator wallet without leaving the vault view.</p>
          </div>

          <input
            className="casino-field-input"
            min="0"
            onChange={(event) => setVaultForm((current) => ({ ...current, bankrollAmount: event.target.value }))}
            placeholder="0.10"
            step="0.01"
            type="number"
            value={vaultForm.bankrollAmount}
          />

          <div className="vault-chip-row">
            {BANKROLL_PRESETS.map((preset) => (
              <button
                className="casino-chip-button"
                key={preset}
                onClick={() => applyPreset("bankrollAmount", preset)}
                type="button"
              >
                {preset}
              </button>
            ))}
          </div>

          <button
            className="casino-primary-button"
            disabled={actionsBusy}
            onClick={handleFundBankroll}
            type="button"
          >
            {bankrollButtonLabel}
          </button>
        </div>
      ) : null}
    </GlassCard>
  );
}
