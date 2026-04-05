interface CasfinConfig {
  appName: string;
  chainId: number;
  chainIdHex: string;
  chainName: string;
  explorerBaseUrl: string;
  publicRpcUrl: string;
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
    feeDistributor: string;
    disputeRegistry: string;
  };
  predictionDefaults: {
    disputeWindowHours: number;
    initialLiquidity: string;
    outcomes: string;
  };
}

export const CASFIN_CONFIG: CasfinConfig = {
  appName: "CasFin",
  chainId: 421614,
  chainIdHex: "0x66eee",
  chainName: "Arbitrum Sepolia",
  explorerBaseUrl: "https://sepolia.arbiscan.io",
  publicRpcUrl: process.env.NEXT_PUBLIC_ARB_SEPOLIA_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc",
  operatorAddress: "0x6b3a924379B9408D8110f10F084ca809863B378A",
  addresses: {
    casinoToken: "0x64982D01A94298FD5b8294A30DAaB6Fdad2d3203",
    stakingPool: "0x2E42d445FdA2644cb7Da85572Ce77D03019a4fcB",
    casinoVault: "0xDe635798122487CF0a61512D2D7229D28436d9f8",
    randomnessRouter: "0xA35D1C633D6E4178dD3DCE567ddb76d6C341f111",
    coinFlipGame: "0x6dd64A41E8c2AC90eaC95b0a194c8943D40Fe945",
    diceGame: "0x62dA6E0a33e0E1B67240348e768dD3Aed9feFDAB",
    crashGame: "0xA204279bBb036e31Fc9cbFC7d6660c29E18D6F45",
    marketFactory: "0xC876De943508B4938d3d8f010cc97dbac7Ab0B43",
    feeDistributor: "0xFDD1E5A48739831DbF655338DE5996D283a79295",
    disputeRegistry: "0x5c15ABfe97bAF24540fbc13d9a9d35d052C655db"
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
