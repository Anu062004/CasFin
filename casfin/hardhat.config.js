require("dotenv").config();
require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-verify");
require("hardhat-abi-exporter");

const configuredPrivateKey =
  process.env.PRIVATE_KEY && process.env.PRIVATE_KEY !== "your_private_key_here" ? process.env.PRIVATE_KEY : null;
const configuredFhenixPrivateKey =
  process.env.FHENIX_PRIVATE_KEY && process.env.FHENIX_PRIVATE_KEY !== "your_private_key_here"
    ? process.env.FHENIX_PRIVATE_KEY
    : null;

module.exports = {
  networks: {
    hardhat: {},
    arbitrumSepolia: {
      url: process.env.ARBITRUM_SEPOLIA_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc",
      chainId: 421614,
      accounts: configuredPrivateKey ? [configuredPrivateKey] : []
    },
    fhenixHelium: {
      url: process.env.FHENIX_RPC_URL || "https://api.helium.fhenix.zone",
      chainId: 8008135,
      accounts: configuredFhenixPrivateKey ? [configuredFhenixPrivateKey] : []
    }
  },
  etherscan: {
    apiKey: {
      arbitrumSepolia: process.env.ARBISCAN_API_KEY || ""
    }
  },
  solidity: {
    compilers: [
      {
        version: "0.8.24",
        settings: {
          evmVersion: "cancun",
          viaIR: true,
          optimizer: {
            enabled: true,
            runs: 200
          }
        }
      },
      {
        version: "0.8.25",
        settings: {
          evmVersion: "cancun",
          viaIR: true,
          optimizer: {
            enabled: true,
            runs: 200
          }
        }
      }
    ]
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
