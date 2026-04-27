import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-verify";
import "hardhat-abi-exporter";
import * as dotenv from "dotenv";

dotenv.config();

const configuredPrivateKey =
  process.env.PRIVATE_KEY && process.env.PRIVATE_KEY !== "your_private_key_here" ? process.env.PRIVATE_KEY : null;
const configuredFhenixPrivateKey =
  process.env.FHENIX_PRIVATE_KEY && process.env.FHENIX_PRIVATE_KEY !== "your_private_key_here"
    ? process.env.FHENIX_PRIVATE_KEY
    : null;
const fhenixAccounts = configuredFhenixPrivateKey
  ? [configuredFhenixPrivateKey]
  : configuredPrivateKey
    ? [configuredPrivateKey]
    : [];

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.24",
        settings: {
          evmVersion: "cancun",
          optimizer: {
            enabled: true,
            runs: 200,
          },
          viaIR: true,
        },
      },
      {
        version: "0.8.25",
        settings: {
          evmVersion: "cancun",
          optimizer: {
            enabled: true,
            runs: 200,
          },
          viaIR: true,
        },
      },
    ],
  },
  networks: {
    hardhat: process.env.HARDHAT_FORK === "true"
      ? {
          forking: {
            url: process.env.ARBITRUM_SEPOLIA_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc",
          },
        }
      : {},
    arbitrumSepolia: {
      url: process.env.ARBITRUM_SEPOLIA_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc",
      chainId: 421614,
      accounts: fhenixAccounts,
    },
    fhenixHelium: {
      url: process.env.FHENIX_RPC_URL || "https://api.helium.fhenix.zone",
      chainId: 8008135,
      accounts: fhenixAccounts,
    },
  },
  mocha: {
    timeout: 120000,
  },
  abiExporter: {
    path: "./frontend/lib/generated-abis",
    clear: false,
    flat: true,
    pretty: true,
    runOnCompile: true,
  },
  paths: {
    sources: "./contracts",
    tests: "./test/fhe",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};

export default config;
