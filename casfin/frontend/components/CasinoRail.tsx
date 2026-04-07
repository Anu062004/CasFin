"use client";

import { ethers } from "ethers";
import { CASFIN_CONFIG } from "@/lib/casfin-config";
import {
  formatAddress,
  formatBps,
  formatEth,
  formatMultiplier,
  formatNumber,
  parseCashOutMultiplier,
  parseRequiredEth,
  parseRequiredInteger
} from "@/lib/casfin-client";
import {
  ENCRYPTED_COIN_FLIP_ABI,
  ENCRYPTED_CRASH_ABI,
  ENCRYPTED_DICE_ABI,
  ENCRYPTED_VAULT_ABI
} from "@/lib/casfin-abis";
import { ActionButton, AddressLink } from "@/components/ProtocolBits";
import { useCofhe } from "@/lib/cofhe-provider";

export default function CasinoRail({
  casinoState,
  coinForm,
  crashForm,
  diceForm,
  isOperator,
  latestCoinBetId,
  latestCrashRoundId,
  latestDiceBetId,
  pendingAction,
  runTransaction,
  setCoinForm,
  setCrashForm,
  setDiceForm,
  setVaultForm,
  vaultForm,
  walletBlocked
}) {
  const { encryptUint128, encryptUint8, encryptBool, connected: cofheConnected } = useCofhe();

  return (
    <div className="rail-grid">
      <section className="stack-column">
        <article className="panel-card">
          <div className="panel-head">
            <div>
              <p className="section-kicker">Vault</p>
              <h3>Deposit, withdraw, and monitor the shared casino balance.</h3>
            </div>
            <AddressLink address={CASFIN_CONFIG.addresses.casinoVault} label="Vault contract" />
          </div>

          <div className="info-grid">
            <div className="info-block">
              <span>Vault TVL</span>
              <strong>{formatEth(casinoState.vaultBalance)} ETH</strong>
            </div>
            <div className="info-block">
              <span>Your available balance</span>
              <strong>{formatEth(casinoState.playerBalance)} ETH</strong>
            </div>
            <div className="info-block">
              <span>Your locked balance</span>
              <strong>{formatEth(casinoState.playerLockedBalance)} ETH</strong>
            </div>
            <div className="info-block">
              <span>Vault owner</span>
              <strong>{formatAddress(casinoState.vaultOwner)}</strong>
            </div>
          </div>

          <div className="action-grid two-up">
            <label className="field-card">
              <span>Deposit ETH</span>
              <input
                onChange={(event) => setVaultForm((current) => ({ ...current, depositAmount: event.target.value }))}
                type="number"
                value={vaultForm.depositAmount}
              />
              <ActionButton
                disabled={walletBlocked}
                onClick={() =>
                  runTransaction("Vault deposit", async (signer) => {
                    const vault = new ethers.Contract(CASFIN_CONFIG.addresses.casinoVault, ENCRYPTED_VAULT_ABI, signer);
                    return vault.depositETH({ value: parseRequiredEth(vaultForm.depositAmount, "Deposit") });
                  })
                }
              >
                {pendingAction === "Vault deposit" ? "Depositing..." : "Deposit"}
              </ActionButton>
            </label>

            <label className="field-card">
              <span>Withdraw ETH</span>
              <input
                onChange={(event) => setVaultForm((current) => ({ ...current, withdrawAmount: event.target.value }))}
                type="number"
                value={vaultForm.withdrawAmount}
              />
              <ActionButton
                disabled={walletBlocked || !cofheConnected}
                onClick={() =>
                  runTransaction("Withdraw vault balance", async (signer) => {
                    const vault = new ethers.Contract(CASFIN_CONFIG.addresses.casinoVault, ENCRYPTED_VAULT_ABI, signer);
                    const withdrawWei = casinoState.pendingWithdrawal?.exists
                      ? 0n
                      : parseRequiredEth(vaultForm.withdrawAmount, "Withdraw amount");
                    const encAmount = await encryptUint128(withdrawWei);
                    return vault.withdrawETH(encAmount);
                  })
                }
              >
                {pendingAction === "Withdraw vault balance" ? "Withdrawing..." : "Withdraw"}
              </ActionButton>
            </label>
          </div>

          {isOperator ? (
            <label className="field-card operator-card">
              <span>Operator bankroll top-up</span>
              <input
                onChange={(event) => setVaultForm((current) => ({ ...current, bankrollAmount: event.target.value }))}
                type="number"
                value={vaultForm.bankrollAmount}
              />
              <ActionButton
                disabled={walletBlocked}
                onClick={() =>
                  runTransaction("Fund house bankroll", async (signer) => {
                    const vault = new ethers.Contract(CASFIN_CONFIG.addresses.casinoVault, ENCRYPTED_VAULT_ABI, signer);
                    return vault.fundHouseBankroll({ value: parseRequiredEth(vaultForm.bankrollAmount, "Bankroll") });
                  })
                }
              >
                {pendingAction === "Fund house bankroll" ? "Funding..." : "Fund bankroll"}
              </ActionButton>
            </label>
          ) : null}
        </article>

        <article className="panel-card">
          <div className="panel-head">
            <div>
              <p className="section-kicker">Coin Flip</p>
              <h3>Fast 2x loop with VRF-backed randomness and transparent settlement.</h3>
            </div>
            <AddressLink address={CASFIN_CONFIG.addresses.coinFlipGame} label="Coin flip contract" />
          </div>

          <div className="info-grid compact">
            <div className="info-block">
              <span>House edge</span>
              <strong>{formatBps(casinoState.coin.houseEdgeBps)}</strong>
            </div>
            <div className="info-block">
              <span>Max bet</span>
              <strong>{formatEth(casinoState.coin.maxBetAmount)} ETH</strong>
            </div>
            <div className="info-block">
              <span>Latest bet id</span>
              <strong>{latestCoinBetId}</strong>
            </div>
          </div>

          <div className="action-grid two-up">
            <label className="field-card">
              <span>Bet amount</span>
              <input
                onChange={(event) => setCoinForm((current) => ({ ...current, amount: event.target.value }))}
                type="number"
                value={coinForm.amount}
              />
              <div className="toggle-row">
                <button
                  className={coinForm.guessHeads ? "toggle-pill active" : "toggle-pill"}
                  onClick={() => setCoinForm((current) => ({ ...current, guessHeads: true }))}
                  type="button"
                >
                  Heads
                </button>
                <button
                  className={!coinForm.guessHeads ? "toggle-pill active" : "toggle-pill"}
                  onClick={() => setCoinForm((current) => ({ ...current, guessHeads: false }))}
                  type="button"
                >
                  Tails
                </button>
              </div>
              <ActionButton
                disabled={walletBlocked || !cofheConnected}
                onClick={() =>
                  runTransaction("Place coin flip bet", async (signer) => {
                    const coin = new ethers.Contract(CASFIN_CONFIG.addresses.coinFlipGame, ENCRYPTED_COIN_FLIP_ABI, signer);
                    const amountWei = parseRequiredEth(coinForm.amount, "Bet amount");
                    const encAmount = await encryptUint128(amountWei);
                    const encGuess = await encryptBool(coinForm.guessHeads);
                    return coin.placeBet(encAmount, encGuess);
                  })
                }
              >
                {pendingAction === "Place coin flip bet" ? "Placing..." : "Place bet"}
              </ActionButton>
            </label>

            <label className="field-card">
              <span>Resolve bet id</span>
              <input
                onChange={(event) => setCoinForm((current) => ({ ...current, resolveBetId: event.target.value }))}
                placeholder={latestCoinBetId}
                type="number"
                value={coinForm.resolveBetId}
              />
              <ActionButton
                disabled={walletBlocked}
                onClick={() =>
                  runTransaction("Resolve coin flip bet", async (signer) => {
                    const coin = new ethers.Contract(CASFIN_CONFIG.addresses.coinFlipGame, ENCRYPTED_COIN_FLIP_ABI, signer);
                    return coin.requestResolution(parseRequiredInteger(coinForm.resolveBetId || latestCoinBetId, "Bet id"));
                  })
                }
                variant="secondary"
              >
                {pendingAction === "Resolve coin flip bet" ? "Resolving..." : "Resolve"}
              </ActionButton>
            </label>
          </div>
        </article>

        <article className="panel-card">
          <div className="panel-head">
            <div>
              <p className="section-kicker">Dice</p>
              <h3>Pick a face from 1 to 6, then resolve after the randomness request is fulfilled.</h3>
            </div>
            <AddressLink address={CASFIN_CONFIG.addresses.diceGame} label="Dice contract" />
          </div>

          <div className="action-grid two-up">
            <label className="field-card">
              <span>Bet amount and guess</span>
              <input
                onChange={(event) => setDiceForm((current) => ({ ...current, amount: event.target.value }))}
                type="number"
                value={diceForm.amount}
              />
              <input
                max="6"
                min="1"
                onChange={(event) => setDiceForm((current) => ({ ...current, guess: event.target.value }))}
                type="number"
                value={diceForm.guess}
              />
              <ActionButton
                disabled={walletBlocked || !cofheConnected}
                onClick={() =>
                  runTransaction("Place dice bet", async (signer) => {
                    const dice = new ethers.Contract(CASFIN_CONFIG.addresses.diceGame, ENCRYPTED_DICE_ABI, signer);
                    const amountWei = parseRequiredEth(diceForm.amount, "Bet amount");
                    const guessValue = parseRequiredInteger(diceForm.guess, "Guess");

                    if (guessValue < 1 || guessValue > 6) {
                      throw new Error("Guess must be between 1 and 6.");
                    }

                    const encAmount = await encryptUint128(amountWei);
                    const encGuess = await encryptUint8(guessValue);
                    return dice.placeBet(encAmount, encGuess);
                  })
                }
              >
                {pendingAction === "Place dice bet" ? "Placing..." : "Place bet"}
              </ActionButton>
            </label>

            <label className="field-card">
              <span>Resolve bet id</span>
              <input
                onChange={(event) => setDiceForm((current) => ({ ...current, resolveBetId: event.target.value }))}
                placeholder={latestDiceBetId}
                type="number"
                value={diceForm.resolveBetId}
              />
              <ActionButton
                disabled={walletBlocked}
                onClick={() =>
                  runTransaction("Resolve dice bet", async (signer) => {
                    const dice = new ethers.Contract(CASFIN_CONFIG.addresses.diceGame, ENCRYPTED_DICE_ABI, signer);
                    return dice.requestResolution(parseRequiredInteger(diceForm.resolveBetId || latestDiceBetId, "Bet id"));
                  })
                }
                variant="secondary"
              >
                {pendingAction === "Resolve dice bet" ? "Resolving..." : "Resolve"}
              </ActionButton>
            </label>
          </div>
        </article>

        <article className="panel-card">
          <div className="panel-head">
            <div>
              <p className="section-kicker">Crash</p>
              <h3>Start a round, place a target, then close and settle against the crash point.</h3>
            </div>
            <AddressLink address={CASFIN_CONFIG.addresses.crashGame} label="Crash contract" />
          </div>

          <div className="info-grid compact">
            <div className="info-block">
              <span>Latest round</span>
              <strong>{latestCrashRoundId}</strong>
            </div>
            <div className="info-block">
              <span>Max cash out</span>
              <strong>{formatMultiplier(casinoState.crash.maxCashOutMultiplierBps)}</strong>
            </div>
            <div className="info-block">
              <span>Latest round state</span>
              <strong>
                {casinoState.crash.latestRound
                  ? casinoState.crash.latestRound.closed
                    ? `Closed at ${formatMultiplier(casinoState.crash.latestRound.crashMultiplierBps)}`
                    : "Open"
                  : "None"}
              </strong>
            </div>
          </div>

          <div className="action-grid three-up">
            {isOperator ? (
              <label className="field-card">
                <span>Operator control</span>
                <p className="field-copy">Start the next crash round from the owner wallet.</p>
                <ActionButton
                  disabled={walletBlocked}
                  onClick={() =>
                    runTransaction("Start crash round", async (signer) => {
                      const crash = new ethers.Contract(CASFIN_CONFIG.addresses.crashGame, ENCRYPTED_CRASH_ABI, signer);
                      return crash.startRound();
                    })
                  }
                >
                  {pendingAction === "Start crash round" ? "Starting..." : "Start round"}
                </ActionButton>
              </label>
            ) : null}

            <label className="field-card">
              <span>Place crash bet</span>
              <input
                onChange={(event) => setCrashForm((current) => ({ ...current, roundId: event.target.value }))}
                placeholder={latestCrashRoundId}
                type="number"
                value={crashForm.roundId}
              />
              <input
                onChange={(event) => setCrashForm((current) => ({ ...current, amount: event.target.value }))}
                type="number"
                value={crashForm.amount}
              />
              <input
                onChange={(event) =>
                  setCrashForm((current) => ({ ...current, cashOutMultiplier: event.target.value }))
                }
                type="number"
                value={crashForm.cashOutMultiplier}
              />
              <ActionButton
                disabled={walletBlocked || !cofheConnected}
                onClick={() =>
                  runTransaction("Place crash bet", async (signer) => {
                    const crash = new ethers.Contract(CASFIN_CONFIG.addresses.crashGame, ENCRYPTED_CRASH_ABI, signer);
                    const roundId = parseRequiredInteger(crashForm.roundId || latestCrashRoundId, "Round id");
                    const amountWei = parseRequiredEth(crashForm.amount, "Crash amount");
                    const cashOut = parseCashOutMultiplier(crashForm.cashOutMultiplier);
                    const encAmount = await encryptUint128(amountWei);
                    return crash.placeBet(roundId, encAmount, cashOut);
                  })
                }
              >
                {pendingAction === "Place crash bet" ? "Placing..." : "Place bet"}
              </ActionButton>
            </label>

            <label className="field-card">
              <span>Close or settle</span>
              <input
                onChange={(event) => setCrashForm((current) => ({ ...current, roundId: event.target.value }))}
                placeholder={latestCrashRoundId}
                type="number"
                value={crashForm.roundId}
              />
              <input
                onChange={(event) => setCrashForm((current) => ({ ...current, settlePlayer: event.target.value }))}
                placeholder="Player address"
                type="text"
                value={crashForm.settlePlayer}
              />
              <div className="inline-actions">
                <ActionButton
                  disabled={walletBlocked}
                  onClick={() =>
                    runTransaction("Close crash round", async (signer) => {
                      const crash = new ethers.Contract(CASFIN_CONFIG.addresses.crashGame, ENCRYPTED_CRASH_ABI, signer);
                      return crash.closeRound(parseRequiredInteger(crashForm.roundId || latestCrashRoundId, "Round id"));
                    })
                  }
                  variant="secondary"
                >
                  {pendingAction === "Close crash round" ? "Closing..." : "Close"}
                </ActionButton>
                <ActionButton
                  disabled={walletBlocked || !ethers.isAddress(crashForm.settlePlayer)}
                  onClick={() =>
                    runTransaction("Settle crash bet", async (signer) => {
                      const crash = new ethers.Contract(CASFIN_CONFIG.addresses.crashGame, ENCRYPTED_CRASH_ABI, signer);
                      return crash.settleBet(
                        parseRequiredInteger(crashForm.roundId || latestCrashRoundId, "Round id"),
                        crashForm.settlePlayer
                      );
                    })
                  }
                >
                  {pendingAction === "Settle crash bet" ? "Settling..." : "Settle"}
                </ActionButton>
              </div>
            </label>
          </div>
        </article>
      </section>

      <aside className="stack-column sidebar-column">
        <article className="panel-card">
          <div className="panel-head">
            <div>
              <p className="section-kicker">Flow</p>
              <h3>Casino rail in four steps.</h3>
            </div>
          </div>

          <div className="timeline-list">
            <div className="timeline-step">
              <span>01</span>
              <p>Deposit ETH into the vault so every game can reserve stake from the same balance.</p>
            </div>
            <div className="timeline-step">
              <span>02</span>
              <p>Place a bet on coin flip, dice, or crash using the shared vault-backed amount.</p>
            </div>
            <div className="timeline-step">
              <span>03</span>
              <p>Wait for Chainlink VRF to fulfill the latest randomness request for the game you entered.</p>
            </div>
            <div className="timeline-step">
              <span>04</span>
              <p>Resolve or settle the bet, then withdraw directly from the vault when you want to exit.</p>
            </div>
          </div>
        </article>

        <article className="panel-card">
          <div className="panel-head">
            <div>
              <p className="section-kicker">VRF Status</p>
              <h3>Read-only randomness status for the most recent live request.</h3>
            </div>
            <AddressLink address={CASFIN_CONFIG.addresses.randomnessRouter} label="Router contract" />
          </div>

          <div className="info-grid compact">
            <div className="info-block">
              <span>Owner</span>
              <strong>{formatAddress(casinoState.router.owner)}</strong>
            </div>
            <div className="info-block">
              <span>Latest request id</span>
              <strong>
                {casinoState.router.latestRequestId === null ? "None" : formatNumber(casinoState.router.latestRequestId)}
              </strong>
            </div>
            <div className="info-block">
              <span>Latest source</span>
              <strong>{casinoState.router.latestRequestSource || "No requests yet"}</strong>
            </div>
          </div>

          <div className="state-callout">
            <p>Latest request state</p>
            <span>
              {casinoState.router.latestRequest
                ? casinoState.router.latestRequest.fulfilled
                  ? "Fulfilled and ready for game resolution."
                  : "Pending Chainlink VRF fulfillment."
                : "No live randomness requests found."}
            </span>
          </div>

          <div className="state-callout">
            <p>Latest randomness word</p>
            <span>
              {casinoState.router.latestRequest?.fulfilled
                ? formatNumber(casinoState.router.latestRequest.randomWord)
                : "Waiting on VRF fulfillment."}
            </span>
          </div>
        </article>
      </aside>
    </div>
  );
}
