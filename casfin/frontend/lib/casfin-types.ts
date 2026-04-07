import type { ContractTransactionResponse, JsonRpcSigner } from "ethers";
import type { CSSProperties, Dispatch, ElementType, ReactNode, SetStateAction } from "react";

export type WalletType = "privy";
export type StatusTone = "info" | "success" | "warning" | "error";
export type SerializedHandle = string | null;

export interface PendingWithdrawalState {
  amountHandle: SerializedHandle;
  exists: boolean;
}

export interface RandomnessRequestState {
  requester: string;
  context: bigint;
  randomWord: bigint;
  fulfilled: boolean;
}

export interface CasinoRouterState {
  owner: string;
  latestRequestId: bigint | null;
  latestRequestSource: string;
  latestRequest: RandomnessRequestState | null;
}

export interface CoinBetState {
  id: bigint | null;
  player: string;
  lockedAmount: bigint;
  lockedHandle: SerializedHandle;
  guessHeads: boolean | null;
  requestId: bigint;
  resolved: boolean;
  resolutionPending: boolean;
  won: boolean;
}

export interface DiceBetState {
  id: bigint | null;
  player: string;
  lockedAmount: bigint;
  lockedHandle: SerializedHandle;
  guess: number | null;
  requestId: bigint;
  resolved: boolean;
  resolutionPending: boolean;
  rolled: number;
  won: boolean;
}

export interface CrashRoundState {
  id: bigint | null;
  exists: boolean;
  requestId: bigint;
  crashMultiplierBps: number;
  closed: boolean;
}

export interface CrashPlayerBetState {
  lockedAmount: bigint;
  lockedHandle: SerializedHandle;
  cashOutMultiplierBps: number;
  exists: boolean;
  settled: boolean;
  won: boolean;
}

export interface CasinoGameState<TLatest> {
  houseEdgeBps: number;
  maxBetAmount: bigint;
  nextBetId: bigint;
  latestBet: TLatest | null;
}

export interface CrashGameState {
  nextRoundId: bigint;
  maxCashOutMultiplierBps: number;
  latestRound: CrashRoundState | null;
  latestPlayerBet: CrashPlayerBetState | null;
}

export interface CasinoState {
  isFhe: boolean;
  vaultOwner: string;
  vaultBalance: bigint;
  playerBalance: bigint;
  playerLockedBalance: bigint;
  playerBalanceHandle: SerializedHandle;
  playerLockedBalanceHandle: SerializedHandle;
  pendingWithdrawal: PendingWithdrawalState | null;
  router: CasinoRouterState;
  coin: CasinoGameState<CoinBetState>;
  dice: CasinoGameState<DiceBetState>;
  crash: CrashGameState;
}

export interface PredictionFeeConfig {
  platformFeeBps: number;
  lpFeeBps: number;
  resolverFeeBps: number;
}

export interface PredictionMarketMetaState {
  market: string;
  amm: string;
  pool: string;
  resolver: string;
  creator: string;
  createdAt: bigint;
  oracleType: number;
}

export interface PredictionMarketResolverState {
  address: string;
  manualResolver: string;
  feeRecipient: string;
  oracleType: number;
  resolutionRequested: boolean;
}

export interface PredictionMarketState {
  address: string;
  question: string;
  description: string;
  resolvesAt: bigint;
  resolved: boolean;
  finalized: boolean;
  winningOutcome: number;
  creator: string;
  collateralPool: bigint;
  outcomeLabels: string[];
  totalShares: bigint[];
  userShares: bigint[];
  hasClaimed: boolean;
  poolBalance: bigint;
  meta: PredictionMarketMetaState;
  resolver: PredictionMarketResolverState;
}

export interface PredictionState {
  factoryOwner: string;
  totalMarkets: number;
  approvedCreator: boolean;
  feeConfig: PredictionFeeConfig;
  markets: PredictionMarketState[];
}

export interface VaultFormState {
  depositAmount: string;
  withdrawAmount: string;
  bankrollAmount: string;
}

export interface CreateMarketFormState {
  question: string;
  description: string;
  outcomes: string;
  resolveAt: string;
  disputeWindowHours: string;
  initialLiquidity: string;
}

export interface MarketFormState {
  buyOutcome: string;
  buyAmount: string;
  buyMinSharesOut: string;
  sellOutcome: string;
  sellShares: string;
  resolveOutcome: string;
}

export interface CoinFormState {
  amount: string;
  guessHeads: boolean;
  resolveBetId: string;
}

export interface DiceFormState {
  amount: string;
  guess: string;
  resolveBetId: string;
}

export interface CrashFormState {
  roundId: string;
  amount: string;
  cashOutMultiplier: string;
  settlePlayer: string;
}

export interface LastTransactionState {
  label: string;
  hash: string;
  status: "submitted" | "confirmed";
  timestamp: number;
}

export interface WalletSnapshot {
  provider: InjectedEthereumProvider | null;
  account: string;
  balance: bigint;
  chainId: number | null;
}

export interface SyncWalletOptions {
  provider?: InjectedEthereumProvider | null;
  providedAccounts?: string[];
  requestAccounts?: boolean;
  loadProtocol?: boolean;
}

export type RunTransactionHandler = (signer: JsonRpcSigner) => Promise<ContractTransactionResponse>;
export type RunTransaction = (label: string, handler: RunTransactionHandler) => Promise<void>;

export interface WalletContextValue {
  walletAvailable: boolean;
  account: string;
  walletBalance: bigint;
  chainId: number | null;
  isConnected: boolean;
  isCorrectChain: boolean;
  isOperator: boolean;
  walletBlocked: boolean;
  cofheSessionReady: boolean;
  cofheSessionInitializing: boolean;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
  ensureTargetNetwork: () => Promise<WalletSnapshot>;
  ensureEncryptedSession: (currentAccount?: string) => Promise<void>;
  refreshWalletState: (options?: SyncWalletOptions) => Promise<WalletSnapshot>;
  syncWallet: (options?: SyncWalletOptions) => Promise<WalletSnapshot>;
  runTransaction: RunTransaction;
  pendingAction: string;
  statusMessage: string;
  statusTone: StatusTone;
  statusEventId: number;
  lastTransaction: LastTransactionState | null;
  loadError: string;
  casinoLoadError: string;
  predictionLoadError: string;
  casinoState: CasinoState;
  predictionState: PredictionState;
  loadProtocolState: (currentAccount?: string) => Promise<void>;
}

export type SetState<T> = Dispatch<SetStateAction<T>>;

export interface FheVaultState {
  owner: string;
  totalDeposits: bigint;
  encryptedBalance: SerializedHandle;
  encryptedLockedBalance: SerializedHandle;
  pendingWithdrawal: PendingWithdrawalState | null;
}

export interface FheCoinBetState {
  id: bigint | null;
  player: string;
  lockedHandle: SerializedHandle;
  encGuessHeads: SerializedHandle;
  requestId: bigint;
  resolved: boolean;
  resolutionPending: boolean;
  won: boolean;
}

export interface FheDiceBetState {
  id: bigint | null;
  player: string;
  lockedHandle: SerializedHandle;
  encGuess: SerializedHandle;
  requestId: bigint;
  resolved: boolean;
  resolutionPending: boolean;
  rolled: number;
  won: boolean;
}

export interface FheState {
  vault: FheVaultState;
  coin: {
    nextBetId: bigint;
    latestBet: FheCoinBetState | null;
  };
  dice: {
    nextBetId: bigint;
    latestBet: FheDiceBetState | null;
  };
  crash: {
    nextRoundId: bigint;
    maxCashOutMultiplierBps: number;
    latestRound: CrashRoundState | null;
    latestPlayerBet: CrashPlayerBetState | null;
  };
}

export interface GlassCardProps {
  action?: ReactNode;
  as?: ElementType;
  children?: ReactNode;
  className?: string;
  description?: string;
  eyebrow?: string;
  stagger?: number;
  style?: CSSProperties;
  title?: string;
}
