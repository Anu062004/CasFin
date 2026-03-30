export const CASFIN_CONFIG = {
  appName: "CasFin",
  chainId: 421614,
  chainIdHex: "0x66eee",
  chainName: "Arbitrum Sepolia",
  explorerBaseUrl: "https://sepolia.arbiscan.io",
  publicRpcUrl: "https://sepolia-rollup.arbitrum.io/rpc",
  operatorAddress: "0x6b3a924379B9408D8110f10F084ca809863B378A",
  addresses: {
    casinoToken: "0xCFf24F7dB2583873e94B24e69a09B60552d13e27",
    stakingPool: "0xdd63C87DC097eB74c15EDf43aBD8fC7Ed953E722",
    casinoVault: "0x6F73287700f87203164e9CC408F72A5927475ac1",
    randomnessRouter: "0x96159cfbF6736d846e257F786Ce083A8830FA72A",
    coinFlipGame: "0x577459924735400E06024fFF3D45771399D96ecc",
    diceGame: "0x66ecf82b8e0e270070641d5A02de2cDC878B38dc",
    crashGame: "0xCc836C3b3C4c06C4782Bb8D7e97b6626D7CF5EED",
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

export function buildExplorerUrl(kind, value) {
  if (!value) {
    return "#";
  }

  return `${CASFIN_CONFIG.explorerBaseUrl}/${kind}/${value}`;
}
