import { ethers } from "ethers";

interface CasfinConfig {
  appName: string;
  chainId: number;
  chainIdHex: string;
  chainName: string;
  explorerBaseUrl: string;
  publicRpcUrl: string;
  fheRpcUrl: string;
  pollingRpcUrl: string;
  walletRpcUrl: string;
  operatorAddress: string;
  addresses: {
    casinoToken: string;
    stakingPool: string;
    casinoVault: string;
    randomnessRouter: string;
    coinFlipGame: string;
    diceGame: string;
    crashGame: string;
    pokerGame: string;
    marketFactory: string;
    encryptedMarketFactory: string;
    feeDistributor: string;
    disputeRegistry: string;
  };
  predictionDefaults: {
    disputeWindowHours: number;
    initialLiquidity: string;
    outcomes: string;
  };
}

function readEnvString(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function resolveAddress(value: string | undefined, fallback: string, label: string): string {
  const trimmed = readEnvString(value);

  if (!trimmed) {
    return fallback;
  }

  if (ethers.isAddress(trimmed)) {
    return trimmed;
  }

  console.warn(`[casfin-config] Ignoring invalid ${label}: ${trimmed}`);
  return fallback;
}

const DEFAULT_ADDRESSES = {
  operatorAddress: "0x6b3a924379B9408D8110f10F084ca809863B378A",
  casinoToken: "0x9161f1901Ca4d98e36c4EFC23146193E7C34468B",
  stakingPool: "0xbC5090fcEDbc70E172849fa42eF29aa3684A2408",
  casinoVault: "0xA6406C70FaF7E86B9B8b1cdbC21F7148f6d3E175",
  randomnessRouter: "0xA35D1C633D6E4178dD3DCE567ddb76d6C341f111",
  coinFlipGame: "0x7Bc01d9e3437126345Cd9201ccbAB43D51201411",
  diceGame: "0x9FA71Fa44a4a1128288D88Dd48E2B4e2D00FB778",
  crashGame: "0xDA1d641BfAfef4A6D435Da67AAE1760c1Ce0eF9E",
  pokerGame: "0x843fDBE340a02b41002E986d347246C6E3bE063F",
  marketFactory: "0x6753A055CC37240De70DF635ce1E1E15cF466283",
  feeDistributor: "0xaF50737B65f2D7A267Bd7509aF7376Cd916e4382",
  disputeRegistry: "0x59E39d174C5Bb5D498f81C7AAcCa546a91Fdd6Ea"
} as const;

const PRIMARY_ALCHEMY_ARB_SEPOLIA_RPC =
  process.env.NEXT_PUBLIC_ALCHEMY_ARB_SEPOLIA_RPC_1 ||
  process.env.NEXT_PUBLIC_ALCHEMY_ARB_SEPOLIA_RPC_2 ||
  process.env.NEXT_PUBLIC_ALCHEMY_ARB_SEPOLIA_RPC_3 ||
  process.env.NEXT_PUBLIC_ALCHEMY_ARB_SEPOLIA_RPC_4 ||
  "";
const WALLET_ARB_SEPOLIA_RPC =
  process.env.NEXT_PUBLIC_ARB_SEPOLIA_WALLET_RPC_URL ||
  "https://sepolia-rollup.arbitrum.io/rpc";

export const CASFIN_CONFIG: CasfinConfig = {
  appName: "CasFin",
  chainId: 421614,
  chainIdHex: "0x66eee",
  chainName: "Arbitrum Sepolia",
  explorerBaseUrl: "https://sepolia.arbiscan.io",
  publicRpcUrl: PRIMARY_ALCHEMY_ARB_SEPOLIA_RPC || "https://sepolia-rollup.arbitrum.io/rpc",
  fheRpcUrl: PRIMARY_ALCHEMY_ARB_SEPOLIA_RPC || "https://sepolia-rollup.arbitrum.io/rpc",
  pollingRpcUrl: PRIMARY_ALCHEMY_ARB_SEPOLIA_RPC || "https://sepolia-rollup.arbitrum.io/rpc",
  walletRpcUrl: WALLET_ARB_SEPOLIA_RPC,
  operatorAddress: resolveAddress(process.env.NEXT_PUBLIC_OPERATOR_ADDRESS, DEFAULT_ADDRESSES.operatorAddress, "NEXT_PUBLIC_OPERATOR_ADDRESS"),
  addresses: {
    casinoToken: resolveAddress(process.env.NEXT_PUBLIC_CASINO_TOKEN_ADDRESS, DEFAULT_ADDRESSES.casinoToken, "NEXT_PUBLIC_CASINO_TOKEN_ADDRESS"),
    stakingPool: resolveAddress(process.env.NEXT_PUBLIC_STAKING_POOL_ADDRESS, DEFAULT_ADDRESSES.stakingPool, "NEXT_PUBLIC_STAKING_POOL_ADDRESS"),
    casinoVault: resolveAddress(process.env.NEXT_PUBLIC_FHE_VAULT_ADDRESS, DEFAULT_ADDRESSES.casinoVault, "NEXT_PUBLIC_FHE_VAULT_ADDRESS"),
    randomnessRouter: resolveAddress(process.env.NEXT_PUBLIC_RANDOMNESS_ROUTER_ADDRESS, DEFAULT_ADDRESSES.randomnessRouter, "NEXT_PUBLIC_RANDOMNESS_ROUTER_ADDRESS"),
    coinFlipGame: resolveAddress(process.env.NEXT_PUBLIC_FHE_COIN_FLIP_ADDRESS, DEFAULT_ADDRESSES.coinFlipGame, "NEXT_PUBLIC_FHE_COIN_FLIP_ADDRESS"),
    diceGame: resolveAddress(process.env.NEXT_PUBLIC_FHE_DICE_ADDRESS, DEFAULT_ADDRESSES.diceGame, "NEXT_PUBLIC_FHE_DICE_ADDRESS"),
    crashGame: resolveAddress(process.env.NEXT_PUBLIC_FHE_CRASH_ADDRESS, DEFAULT_ADDRESSES.crashGame, "NEXT_PUBLIC_FHE_CRASH_ADDRESS"),
    pokerGame: resolveAddress(process.env.NEXT_PUBLIC_FHE_POKER_ADDRESS, DEFAULT_ADDRESSES.pokerGame, "NEXT_PUBLIC_FHE_POKER_ADDRESS"),
    marketFactory: resolveAddress(process.env.NEXT_PUBLIC_FHE_MARKET_FACTORY_ADDRESS, DEFAULT_ADDRESSES.marketFactory, "NEXT_PUBLIC_FHE_MARKET_FACTORY_ADDRESS"),
    encryptedMarketFactory: resolveAddress(process.env.NEXT_PUBLIC_FHE_MARKET_FACTORY_ADDRESS, DEFAULT_ADDRESSES.marketFactory, "NEXT_PUBLIC_FHE_MARKET_FACTORY_ADDRESS"),
    feeDistributor: resolveAddress(process.env.NEXT_PUBLIC_FEE_DISTRIBUTOR_ADDRESS, DEFAULT_ADDRESSES.feeDistributor, "NEXT_PUBLIC_FEE_DISTRIBUTOR_ADDRESS"),
    disputeRegistry: resolveAddress(process.env.NEXT_PUBLIC_DISPUTE_REGISTRY_ADDRESS, DEFAULT_ADDRESSES.disputeRegistry, "NEXT_PUBLIC_DISPUTE_REGISTRY_ADDRESS")
  },
  predictionDefaults: {
    disputeWindowHours: 24,
    initialLiquidity: "0.05",
    outcomes: "Yes, No"
  }
};

export function buildExplorerUrl(kind: string, value?: string | null): string {
  if (!value) {
    return "#";
  }

  return `${CASFIN_CONFIG.explorerBaseUrl}/${kind}/${value}`;
}
