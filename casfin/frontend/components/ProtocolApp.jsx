"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ethers } from "ethers";
import { CASFIN_CONFIG, buildExplorerUrl } from "@/lib/casfin-config";
import {
  EMPTY_PREDICTION_STATE,
  EMPTY_CASINO_STATE,
  extractError,
  formatAddress,
  formatEth,
  loadCasinoState,
  loadPredictionState,
  toLocalDateTimeValue
} from "@/lib/casfin-client";
import { ActionButton, AddressLink, StatCard } from "@/components/ProtocolBits";
import CasinoRail from "@/components/CasinoRail";
import PredictionRail from "@/components/PredictionRail";

export default function ProtocolApp() {
  const protocolRef = useRef(null);
  const [isTransitionPending, startTransition] = useTransition();
  const [entered, setEntered] = useState(false);
  const [activeRail, setActiveRail] = useState("casino");
  const [walletAvailable, setWalletAvailable] = useState(false);
  const [account, setAccount] = useState("");
  const [chainId, setChainId] = useState(null);
  const [pendingAction, setPendingAction] = useState("");
  const [statusMessage, setStatusMessage] = useState("Read-only data is live from Arbitrum Sepolia.");
  const [lastTransaction, setLastTransaction] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [casinoState, setCasinoState] = useState(EMPTY_CASINO_STATE);
  const [predictionState, setPredictionState] = useState(EMPTY_PREDICTION_STATE);
  const [vaultForm, setVaultForm] = useState({ depositAmount: "0.05", withdrawAmount: "0.01", bankrollAmount: "0.10" });
  const [coinForm, setCoinForm] = useState({ amount: "0.01", guessHeads: true, resolveBetId: "" });
  const [diceForm, setDiceForm] = useState({ amount: "0.01", guess: "3", resolveBetId: "" });
  const [crashForm, setCrashForm] = useState({ roundId: "", amount: "0.01", cashOutMultiplier: "2.00", settlePlayer: "" });
  const [createMarketForm, setCreateMarketForm] = useState({
    question: "Will ETH close above $4,000 this week?",
    description: "Manual test market deployed from the CasFin frontend on Arbitrum Sepolia.",
    outcomes: CASFIN_CONFIG.predictionDefaults.outcomes,
    resolveAt: "",
    disputeWindowHours: String(CASFIN_CONFIG.predictionDefaults.disputeWindowHours),
    initialLiquidity: CASFIN_CONFIG.predictionDefaults.initialLiquidity
  });
  const [marketForms, setMarketForms] = useState({});

  const isConnected = Boolean(account);
  const isCorrectChain = chainId === CASFIN_CONFIG.chainId;
  const isOperator = account.toLowerCase() === CASFIN_CONFIG.operatorAddress.toLowerCase();
  const walletBlocked = Boolean(pendingAction) || !isConnected || !isCorrectChain;

  function getMarketForm(address) {
    return (
      marketForms[address] || {
        buyOutcome: "0",
        buyAmount: "0.01",
        buyMinSharesOut: "",
        sellOutcome: "0",
        sellShares: "1",
        resolveOutcome: "0"
      }
    );
  }

  function updateMarketForm(address, patch) {
    setMarketForms((current) => ({
      ...current,
      [address]: {
        buyOutcome: "0",
        buyAmount: "0.01",
        buyMinSharesOut: "",
        sellOutcome: "0",
        sellShares: "1",
        resolveOutcome: "0",
        ...current[address],
        ...patch
      }
    }));
  }

  async function syncWallet() {
    if (typeof window === "undefined" || !window.ethereum) {
      setWalletAvailable(false);
      setAccount("");
      setChainId(null);
      return "";
    }

    setWalletAvailable(true);

    const [accounts, currentChainId] = await Promise.all([
      window.ethereum.request({ method: "eth_accounts" }),
      window.ethereum.request({ method: "eth_chainId" })
    ]);

    const nextAccount = accounts[0] || "";
    setAccount(nextAccount);
    setChainId(parseInt(currentChainId, 16));
    return nextAccount;
  }

  async function ensureTargetNetwork() {
    if (typeof window === "undefined" || !window.ethereum) {
      throw new Error("A wallet is required for write actions.");
    }

    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: CASFIN_CONFIG.chainIdHex }]
      });
    } catch (error) {
      if (error?.code !== 4902) {
        throw error;
      }

      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: CASFIN_CONFIG.chainIdHex,
            chainName: CASFIN_CONFIG.chainName,
            rpcUrls: [CASFIN_CONFIG.publicRpcUrl],
            nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
            blockExplorerUrls: [CASFIN_CONFIG.explorerBaseUrl]
          }
        ]
      });
    }

    return syncWallet();
  }

  async function connectWallet() {
    if (typeof window === "undefined" || !window.ethereum) {
      setStatusMessage("Install MetaMask or another injected wallet to unlock write actions.");
      return;
    }

    try {
      await window.ethereum.request({ method: "eth_requestAccounts" });
      const nextAccount = await syncWallet();
      setStatusMessage(nextAccount ? "Wallet connected. Live write actions are unlocked." : "Wallet connection failed.");
      await loadProtocolState(nextAccount);
    } catch (error) {
      setStatusMessage(extractError(error));
    }
  }

  async function loadProtocolState(currentAccount = account) {
    try {
      const [nextCasinoState, nextPredictionState] = await Promise.all([
        loadCasinoState(currentAccount),
        loadPredictionState(currentAccount)
      ]);

      setCasinoState(nextCasinoState);
      setPredictionState(nextPredictionState);
      setLoadError("");
    } catch (error) {
      setLoadError(extractError(error));
    }
  }

  async function runTransaction(label, handler) {
    if (!walletAvailable) {
      setStatusMessage("Connect a wallet before sending transactions.");
      return;
    }

    setPendingAction(label);
    setStatusMessage(`${label} is waiting for wallet confirmation.`);

    try {
      const nextAccount = await ensureTargetNetwork();
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      const signer = await browserProvider.getSigner();
      const transaction = await handler(signer);

      setLastTransaction({ label, hash: transaction.hash });
      setStatusMessage(`${label} submitted to Arbitrum Sepolia.`);

      await transaction.wait();
      setStatusMessage(`${label} confirmed.`);
      await loadProtocolState(nextAccount);
    } catch (error) {
      setStatusMessage(extractError(error));
    } finally {
      setPendingAction("");
    }
  }

  useEffect(() => {
    let disposed = false;

    async function boot() {
      const nextAccount = await syncWallet();
      if (!disposed) {
        await loadProtocolState(nextAccount);
      }
    }

    boot();

    if (typeof window === "undefined" || !window.ethereum) {
      return undefined;
    }

    function handleAccountsChanged(accounts) {
      const nextAccount = accounts[0] || "";
      setAccount(nextAccount);
      loadProtocolState(nextAccount);
    }

    function handleChainChanged(nextChainId) {
      setChainId(parseInt(nextChainId, 16));
      syncWallet().then(loadProtocolState);
    }

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    return () => {
      disposed = true;
      window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum.removeListener("chainChanged", handleChainChanged);
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      loadProtocolState(account);
    }, 20000);

    return () => clearInterval(interval);
  }, [account]);

  useEffect(() => {
    if (!casinoState.crash.latestRound || crashForm.roundId) {
      return;
    }

    setCrashForm((current) => ({ ...current, roundId: casinoState.crash.latestRound.id.toString() }));
  }, [casinoState.crash.latestRound, crashForm.roundId]);

  useEffect(() => {
    setCreateMarketForm((current) => {
      if (current.resolveAt) {
        return current;
      }

      return { ...current, resolveAt: toLocalDateTimeValue(48) };
    });
  }, []);

  function enterProtocol(targetRail = "casino") {
    startTransition(() => {
      setEntered(true);
      setActiveRail(targetRail);
    });

    requestAnimationFrame(() => {
      protocolRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  const summaryCards = [
    {
      label: "Vault Liquidity",
      value: `${formatEth(casinoState.vaultBalance)} ETH`,
      detail: "Shared bankroll available for casino settlement and operator top-ups."
    },
    {
      label: "Live Markets",
      value: String(predictionState.totalMarkets),
      detail: "Prediction markets deployed by the factory and available for share buying."
    },
    {
      label: "VRF Status",
      value: casinoState.router.latestRequest
        ? casinoState.router.latestRequest.fulfilled
          ? "Fulfilled"
          : "Pending"
        : "Idle",
      detail: casinoState.router.latestRequestSource
        ? `Latest request source: ${casinoState.router.latestRequestSource}.`
        : "No live randomness requests have been observed yet."
    },
    {
      label: "Wallet Rail",
      value: isConnected ? formatAddress(account) : "Read only",
      detail: isCorrectChain ? CASFIN_CONFIG.chainName : "Switch to Arbitrum Sepolia for write actions."
    }
  ];

  return (
    <main className="protocol-page">
      <div className="noise-grid" />
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <section className="hero-shell">
        <header className="hero-topbar">
          <div className="brand-cluster">
            <div className="brand-mark">CF</div>
            <div>
              <p className="hero-kicker">CasFin Protocol</p>
              <h1>Enter the dark green rail for games, markets, and live contract control.</h1>
            </div>
          </div>

          <div className="hero-actions">
            <ActionButton disabled={false} onClick={() => enterProtocol("casino")}>Enter Protocol</ActionButton>
            <ActionButton disabled={false} onClick={connectWallet} variant="secondary">
              {isConnected ? formatAddress(account) : "Connect Wallet"}
            </ActionButton>
          </div>
        </header>

        <div className="hero-grid">
          <div className="hero-copy-card">
            <p className="status-chip">Live Arbitrum Sepolia deployment connected</p>
            <p className="hero-copy">
              CasFin now runs as a transparent protocol surface for casino games and prediction markets on Arbitrum
              Sepolia. The app is wired to the deployed vault, games, randomness adapter, and market factory so users
              can move from protocol entry to action in one workspace.
            </p>

            <div className="entry-grid">
              <article className="entry-card">
                <span className="entry-tag">Play Games</span>
                <h2>Deposit once, then run coin flip, dice, and crash from the same vault balance.</h2>
                <p>Use the casino rail for deposits, bankroll monitoring, game bets, and live VRF request tracking.</p>
                <ActionButton disabled={false} onClick={() => enterProtocol("casino")}>Open Casino Rail</ActionButton>
              </article>

              <article className="entry-card">
                <span className="entry-tag">Place Bet</span>
                <h2>Create a market, buy outcome shares, and close the full prediction loop from one surface.</h2>
                <p>Use the market rail for launch, share buying, manual resolution, finalization, and claiming.</p>
                <ActionButton disabled={false} onClick={() => enterProtocol("prediction")} variant="secondary">
                  Open Market Rail
                </ActionButton>
              </article>
            </div>
          </div>

          <aside className="hero-console">
            <div className="console-head">
              <span>Deployment Surface</span>
              <span>{CASFIN_CONFIG.chainName}</span>
            </div>

            <div className="console-list">
              <div className="console-row"><span>Vault</span><AddressLink address={CASFIN_CONFIG.addresses.casinoVault} /></div>
              <div className="console-row"><span>Randomness Router</span><AddressLink address={CASFIN_CONFIG.addresses.randomnessRouter} /></div>
              <div className="console-row"><span>Coin Flip</span><AddressLink address={CASFIN_CONFIG.addresses.coinFlipGame} /></div>
              <div className="console-row"><span>Dice</span><AddressLink address={CASFIN_CONFIG.addresses.diceGame} /></div>
              <div className="console-row"><span>Crash</span><AddressLink address={CASFIN_CONFIG.addresses.crashGame} /></div>
              <div className="console-row"><span>Market Factory</span><AddressLink address={CASFIN_CONFIG.addresses.marketFactory} /></div>
            </div>
          </aside>
        </div>
      </section>

      <section className={`workspace-shell ${entered ? "workspace-active" : ""}`} ref={protocolRef}>
        <div className="workspace-header">
          <div>
            <p className="section-kicker">Protocol Workspace</p>
            <h2>Choose your rail and operate against the deployed contracts.</h2>
          </div>

          <div className="wallet-panel">
            <div>
              <span className="wallet-label">Wallet</span>
              <strong>{isConnected ? formatAddress(account) : "Not connected"}</strong>
              <p>{isCorrectChain ? CASFIN_CONFIG.chainName : "Switch to Arbitrum Sepolia for write access."}</p>
            </div>

            <div className="wallet-actions">
              <ActionButton disabled={Boolean(pendingAction)} onClick={connectWallet} variant="secondary">
                {isConnected ? "Reconnect" : "Connect"}
              </ActionButton>
              <ActionButton disabled={!walletAvailable || Boolean(pendingAction)} onClick={ensureTargetNetwork}>
                Switch Network
              </ActionButton>
            </div>
          </div>
        </div>

        <div className="status-strip">
          <div>
            <strong>Status</strong>
            <p>{loadError || statusMessage}</p>
          </div>

          <div className="status-meta">
            {lastTransaction ? (
              <a href={buildExplorerUrl("tx", lastTransaction.hash)} rel="noreferrer" target="_blank">
                Latest tx: {lastTransaction.label}
              </a>
            ) : (
              <span>Latest tx: none yet</span>
            )}
            <button className="text-link" onClick={() => loadProtocolState(account)} type="button">Refresh now</button>
          </div>
        </div>

        <div className="metric-grid">
          {summaryCards.map((card) => (
            <StatCard detail={card.detail} key={card.label} label={card.label} value={card.value} />
          ))}
        </div>

        <div className="rail-selector">
          <button className={activeRail === "casino" ? "rail-tab active" : "rail-tab"} onClick={() => startTransition(() => setActiveRail("casino"))} type="button">
            Play Games
          </button>
          <button className={activeRail === "prediction" ? "rail-tab active" : "rail-tab"} onClick={() => startTransition(() => setActiveRail("prediction"))} type="button">
            Place Bet
          </button>
        </div>

        {!entered ? (
          <div className="entry-overlay">
            <p>Start with the protocol gate, then choose your rail.</p>
            <ActionButton disabled={false} onClick={() => enterProtocol("casino")}>Enter Protocol</ActionButton>
          </div>
        ) : null}

        {activeRail === "casino" ? (
          <CasinoRail
            casinoState={casinoState}
            coinForm={coinForm}
            crashForm={crashForm}
            diceForm={diceForm}
            isOperator={isOperator}
            latestCoinBetId={casinoState.coin.nextBetId > 0n ? (casinoState.coin.nextBetId - 1n).toString() : "None"}
            latestCrashRoundId={casinoState.crash.latestRound ? casinoState.crash.latestRound.id.toString() : "None"}
            latestDiceBetId={casinoState.dice.nextBetId > 0n ? (casinoState.dice.nextBetId - 1n).toString() : "None"}
            pendingAction={pendingAction}
            runTransaction={runTransaction}
            setCoinForm={setCoinForm}
            setCrashForm={setCrashForm}
            setDiceForm={setDiceForm}
            setVaultForm={setVaultForm}
            vaultForm={vaultForm}
            walletBlocked={walletBlocked}
          />
        ) : (
          <PredictionRail
            account={account}
            createMarketForm={createMarketForm}
            getMarketForm={getMarketForm}
            pendingAction={pendingAction}
            predictionState={predictionState}
            runTransaction={runTransaction}
            setCreateMarketForm={setCreateMarketForm}
            updateMarketForm={updateMarketForm}
            walletBlocked={walletBlocked}
          />
        )}

        {isTransitionPending ? <p className="transition-note">Updating workspace...</p> : null}
      </section>
    </main>
  );
}
