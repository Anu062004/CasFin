require("dotenv").config();
require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-verify");
require("hardhat-abi-exporter");

const configuredPrivateKey =
  process.env.PRIVATE_KEY && process.env.PRIVATE_KEY !== "your_private_key_here" ? process.env.PRIVATE_KEY : null;

module.exports = {
  networks: {
    hardhat: {},
    arbitrumSepolia: {
      url: process.env.ARBITRUM_SEPOLIA_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc",
      chainId: 421614,
      accounts: configuredPrivateKey ? [configuredPrivateKey] : []
    }
  },
  etherscan: {
    apiKey: {
      arbitrumSepolia: process.env.ARBISCAN_API_KEY || ""
    }
  },
  solidity: {
    version: "0.8.24",
    settings: {
      viaIR: true,
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  abiExporter: {
    path: "./frontend/lib/generated-abis",
    clear: false,
    flat: true,
    pretty: true,
    runOnCompile: true
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  }
};
