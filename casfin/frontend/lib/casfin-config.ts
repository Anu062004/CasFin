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
  operatorAddress: process.env.NEXT_PUBLIC_OPERATOR_ADDRESS || "0x6b3a924379B9408D8110f10F084ca809863B378A",
  addresses: {
    casinoToken: process.env.NEXT_PUBLIC_CASINO_TOKEN_ADDRESS || "0x9161f1901Ca4d98e36c4EFC23146193E7C34468B",
    stakingPool: process.env.NEXT_PUBLIC_STAKING_POOL_ADDRESS || "0xbC5090fcEDbc70E172849fa42eF29aa3684A2408",
    casinoVault: process.env.NEXT_PUBLIC_FHE_VAULT_ADDRESS || "0xA6406C70FaF7E86B9B8b1cdbC21F7148f6d3E175",
    randomnessRouter: process.env.NEXT_PUBLIC_RANDOMNESS_ROUTER_ADDRESS || "0xA35D1C633D6E4178dD3DCE567ddb76d6C341f111",
    coinFlipGame: process.env.NEXT_PUBLIC_FHE_COIN_FLIP_ADDRESS || "0x084408DC6278f599C9A41A0CF594852afd26b662",
    diceGame: process.env.NEXT_PUBLIC_FHE_DICE_ADDRESS || "0xDfC7da5259aEe8BaEd8A07449FD771ce6683896E",
    crashGame: process.env.NEXT_PUBLIC_FHE_CRASH_ADDRESS || "0xd920Ca5F942Cf7EfE4E389E8F98830d4664de668",
    pokerGame: process.env.NEXT_PUBLIC_FHE_POKER_ADDRESS || "0x843fDBE340a02b41002E986d347246C6E3bE063F",
    marketFactory: process.env.NEXT_PUBLIC_FHE_MARKET_FACTORY_ADDRESS || "0x6753A055CC37240De70DF635ce1E1E15cF466283",
    encryptedMarketFactory: process.env.NEXT_PUBLIC_FHE_MARKET_FACTORY_ADDRESS || "0x6753A055CC37240De70DF635ce1E1E15cF466283",
    feeDistributor: process.env.NEXT_PUBLIC_FEE_DISTRIBUTOR_ADDRESS || "0xaF50737B65f2D7A267Bd7509aF7376Cd916e4382",
    disputeRegistry: process.env.NEXT_PUBLIC_DISPUTE_REGISTRY_ADDRESS || "0x59E39d174C5Bb5D498f81C7AAcCa546a91Fdd6Ea"
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
