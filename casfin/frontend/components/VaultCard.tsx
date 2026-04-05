"use client";

import { ethers } from "ethers";
import GlassButton from "@/components/GlassButton";
import GlassCard from "@/components/GlassCard";
import GlassInput from "@/components/GlassInput";
import { ENCRYPTED_VAULT_ABI } from "@/lib/casfin-abis";
import { CASFIN_CONFIG } from "@/lib/casfin-config";
import { formatEth, parseRequiredEth } from "@/lib/casfin-client";

const DUMMY_ENCRYPTED_UINT128 = {
  ctHash: 0,
  securityZone: 0,
  utype: 6,
  signature: "0x"
};

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
  const classes = ["vault-card", large ? "is-large" : "", className].filter(Boolean).join(" ");
  const usesEncryptedVault = casinoState.isFhe;
  const availableBalanceLabel = usesEncryptedVault ? "Encrypted" : `${formatEth(casinoState.playerBalance)} ETH`;
  const lockedBalanceLabel = usesEncryptedVault ? "Encrypted" : `${formatEth(casinoState.playerLockedBalance)} ETH`;
  const hasPendingWithdrawal = Boolean(casinoState.pendingWithdrawal?.exists);

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
              Per-player vault balances are encrypted on-chain. This frontend can read handles and keeper status, but it does not decrypt balances locally.
            </p>
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
        <div className="action-panel">
          <GlassInput
            label="Deposit ETH"
            min="0"
            onChange={(event) => setVaultForm((current) => ({ ...current, depositAmount: event.target.value }))}
            step="0.01"
            type="number"
            value={vaultForm.depositAmount}
          />
          <GlassButton
            disabled={walletBlocked}
            fullWidth
            loading={pendingAction === "Vault deposit"}
            onClick={() =>
              runTransaction("Vault deposit", async (signer) => {
                const vault = new ethers.Contract(CASFIN_CONFIG.addresses.casinoVault, ENCRYPTED_VAULT_ABI, signer);
                return vault.depositETH({ value: parseRequiredEth(vaultForm.depositAmount, "Deposit") });
              })
            }
          >
            Deposit
          </GlassButton>
        </div>

        <div className="action-panel">
          <GlassInput
            label="Withdraw ETH"
            min="0"
            onChange={(event) => setVaultForm((current) => ({ ...current, withdrawAmount: event.target.value }))}
            step="0.01"
            type="number"
            value={vaultForm.withdrawAmount}
          />
          <GlassButton
            disabled={walletBlocked || (usesEncryptedVault && !hasPendingWithdrawal)}
            fullWidth
            loading={pendingAction === "Withdraw vault balance"}
            onClick={() =>
              runTransaction("Withdraw vault balance", async (signer) => {
                const vault = new ethers.Contract(CASFIN_CONFIG.addresses.casinoVault, ENCRYPTED_VAULT_ABI, signer);

                if (hasPendingWithdrawal) {
                  return vault.withdrawETH(DUMMY_ENCRYPTED_UINT128);
                }

                throw new Error("Encrypted withdrawals require an FHE input proof. This frontend does not generate encrypted withdrawal payloads yet.");
              })
            }
            variant="secondary"
          >
            {hasPendingWithdrawal ? "Finalize Pending Withdrawal" : usesEncryptedVault ? "ENCRYPTED INPUT REQUIRED" : "Withdraw"}
          </GlassButton>
        </div>
      </div>

      {isOperator ? (
        <div className="operator-strip">
          <GlassInput
            label="Operator Bankroll"
            min="0"
            onChange={(event) => setVaultForm((current) => ({ ...current, bankrollAmount: event.target.value }))}
            step="0.01"
            type="number"
            value={vaultForm.bankrollAmount}
          />
          <GlassButton
            disabled={walletBlocked}
            loading={pendingAction === "Fund house bankroll"}
            onClick={() =>
              runTransaction("Fund house bankroll", async (signer) => {
                const vault = new ethers.Contract(CASFIN_CONFIG.addresses.casinoVault, ENCRYPTED_VAULT_ABI, signer);
                return vault.fundHouseBankroll({ value: parseRequiredEth(vaultForm.bankrollAmount, "Bankroll") });
              })
            }
          >
            Fund Bankroll
          </GlassButton>
        </div>
      ) : null}
    </GlassCard>
  );
}
