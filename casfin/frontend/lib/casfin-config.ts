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

const PRIMARY_ALCHEMY_ARB_SEPOLIA_RPC =
  process.env.NEXT_PUBLIC_ALCHEMY_ARB_SEPOLIA_RPC_1 ||
  process.env.NEXT_PUBLIC_ALCHEMY_ARB_SEPOLIA_RPC_2 ||
  process.env.NEXT_PUBLIC_ALCHEMY_ARB_SEPOLIA_RPC_3 ||
  process.env.NEXT_PUBLIC_ALCHEMY_ARB_SEPOLIA_RPC_4 ||
  "";

export const CASFIN_CONFIG: CasfinConfig = {
  appName: "CasFin",
  chainId: 421614,
  chainIdHex: "0x66eee",
  chainName: "Arbitrum Sepolia",
  explorerBaseUrl: "https://sepolia.arbiscan.io",
  publicRpcUrl: PRIMARY_ALCHEMY_ARB_SEPOLIA_RPC,
  fheRpcUrl: PRIMARY_ALCHEMY_ARB_SEPOLIA_RPC,
  pollingRpcUrl: PRIMARY_ALCHEMY_ARB_SEPOLIA_RPC,
  walletRpcUrl: PRIMARY_ALCHEMY_ARB_SEPOLIA_RPC,
  operatorAddress: process.env.NEXT_PUBLIC_OPERATOR_ADDRESS || "0x6b3a924379B9408D8110f10F084ca809863B378A",
  addresses: {
    casinoToken: process.env.NEXT_PUBLIC_CASINO_TOKEN_ADDRESS || ethers.ZeroAddress,
    stakingPool: process.env.NEXT_PUBLIC_STAKING_POOL_ADDRESS || ethers.ZeroAddress,
    casinoVault: process.env.NEXT_PUBLIC_FHE_VAULT_ADDRESS || ethers.ZeroAddress,
    randomnessRouter: process.env.NEXT_PUBLIC_RANDOMNESS_ROUTER_ADDRESS || ethers.ZeroAddress,
    coinFlipGame: process.env.NEXT_PUBLIC_FHE_COIN_FLIP_ADDRESS || ethers.ZeroAddress,
    diceGame: process.env.NEXT_PUBLIC_FHE_DICE_ADDRESS || ethers.ZeroAddress,
    crashGame: process.env.NEXT_PUBLIC_FHE_CRASH_ADDRESS || ethers.ZeroAddress,
    marketFactory: process.env.NEXT_PUBLIC_FHE_MARKET_FACTORY_ADDRESS || ethers.ZeroAddress,
    encryptedMarketFactory: process.env.NEXT_PUBLIC_FHE_MARKET_FACTORY_ADDRESS || ethers.ZeroAddress,
    feeDistributor: process.env.NEXT_PUBLIC_FEE_DISTRIBUTOR_ADDRESS || ethers.ZeroAddress,
    disputeRegistry: process.env.NEXT_PUBLIC_DISPUTE_REGISTRY_ADDRESS || ethers.ZeroAddress
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
