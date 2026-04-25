const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { ethers, network } = hre;
const { deployContract, serializeDeployment, trackTransaction, verifyMany, writeDeploymentFile } = require("./deployUtils");

const DEFAULT_DEPLOYMENT_FILE = path.resolve(__dirname, "..", "deployments", "arbitrumSepolia", "fhe-casino.json");
const DEFAULT_VAULT_ADDRESS = "0xDe635798122487CF0a61512D2D7229D28436d9f8";
const DEFAULT_HOUSE_EDGE_BPS = 200;

function isRecord(value) {
  return typeof value === "object" && value !== null;
}

function getAddress(entry) {
  if (!isRecord(entry)) {
    return null;
  }

  const { address } = entry;
  return typeof address === "string" && address.length > 0 ? address : null;
}

function resolveDeploymentFile() {
  const configuredPath = process.env.CASFIN_DEPLOYMENT_FILE;
  return configuredPath ? path.resolve(configuredPath) : DEFAULT_DEPLOYMENT_FILE;
}

function readDeployment(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function resolveOwner(deployerAddress) {
  return process.env.FHE_OWNER_ADDRESS || process.env.CASINO_OWNER_ADDRESS || deployerAddress;
}

function resolveResolver(defaultAddress) {
  return process.env.FHE_RESOLVER_ADDRESS || process.env.CASINO_RESOLVER_ADDRESS || defaultAddress;
}

function resolveVaultAddress(existingContracts, existingPreviousContracts) {
  return (
    process.env.FHE_EXISTING_VAULT_ADDRESS ||
    getAddress(existingContracts.encryptedCasinoVault) ||
    getAddress(existingPreviousContracts.encryptedCasinoVault) ||
    DEFAULT_VAULT_ADDRESS
  );
}

function resolveHouseEdgeBps(existingDeployment) {
  const configured = process.env.FHE_HOUSE_EDGE_BPS;
  if (configured !== undefined) {
    return Number(configured);
  }

  return Number(existingDeployment.houseEdgeBps || DEFAULT_HOUSE_EDGE_BPS);
}

function assertAddress(label, address) {
  if (!ethers.isAddress(address)) {
    throw new Error(`Invalid address for ${label}: ${address}`);
  }
}

async function authorizeGameIfNeeded(vaultContract, label, gameAddress) {
  const alreadyAuthorized = await vaultContract.authorizedGames(gameAddress);
  if (alreadyAuthorized) {
    return {
      label,
      skipped: true,
      alreadyAuthorized: true
    };
  }

  return trackTransaction(label, vaultContract.authorizeGame(gameAddress, true));
}

async function setResolverIfNeeded(gameContract, label, resolverAddress) {
  const alreadyAuthorized = await gameContract.authorizedResolvers(resolverAddress);
  if (alreadyAuthorized) {
    return {
      label,
      skipped: true,
      alreadyAuthorized: true
    };
  }

  return trackTransaction(label, gameContract.setResolver(resolverAddress, true));
}

function pickCurrentContract(existingContracts, existingPreviousContracts, key) {
  return existingContracts[key] || existingPreviousContracts[key] || null;
}

async function main() {
  if (network.name !== "arbitrumSepolia") {
    throw new Error("RUN_WITH_ARBITRUM_SEPOLIA_NETWORK");
  }

  const [deployer] = await ethers.getSigners();
  const deploymentFile = resolveDeploymentFile();
  const existingDeployment = readDeployment(deploymentFile);
  const existingContracts = isRecord(existingDeployment.contracts) ? existingDeployment.contracts : {};
  const existingPreviousContracts = isRecord(existingDeployment.previousContracts) ? existingDeployment.previousContracts : {};
  const existingAuthorizationTxs = isRecord(existingDeployment.authorizationTxs) ? existingDeployment.authorizationTxs : {};
  const existingResolverTxs = isRecord(existingDeployment.resolverTxs) ? existingDeployment.resolverTxs : {};
  const existingVerification = isRecord(existingDeployment.verification) ? existingDeployment.verification : {};
  const existingFrontendEnv = isRecord(existingDeployment.frontendEnv) ? existingDeployment.frontendEnv : {};

  const vaultAddress = resolveVaultAddress(existingContracts, existingPreviousContracts);
  const owner = resolveOwner(deployer.address);
  const resolver = resolveResolver(deployer.address);
  const houseEdgeBps = resolveHouseEdgeBps(existingDeployment);

  assertAddress("vault", vaultAddress);
  assertAddress("owner", owner);
  assertAddress("resolver", resolver);

  const vault = await ethers.getContractAt("EncryptedCasinoVault", vaultAddress);
  const vaultOwner = await vault.owner();
  if (vaultOwner.toLowerCase() !== deployer.address.toLowerCase()) {
    throw new Error(`DEPLOYER_NOT_VAULT_OWNER: signer=${deployer.address} vaultOwner=${vaultOwner}`);
  }

  console.log("Redeploying EncryptedCoinFlip from:", deployer.address);
  console.log("Network:", network.name);
  console.log("Vault:", vaultAddress);
  console.log("Owner:", owner);
  console.log("Resolver:", resolver);
  console.log("House edge bps:", houseEdgeBps);

  const previousCoinFlip = pickCurrentContract(existingContracts, existingPreviousContracts, "encryptedCoinFlip");
  if (previousCoinFlip && getAddress(previousCoinFlip)) {
    console.log("Previous CoinFlip:", getAddress(previousCoinFlip));
  }

  const coinFlip = await deployContract(ethers, "EncryptedCoinFlip", [owner, vaultAddress, houseEdgeBps]);
  const authorizeCoinFlipVault = await authorizeGameIfNeeded(vault, "authorizeCoinFlipVault", coinFlip.address);
  const setCoinFlipResolver = await setResolverIfNeeded(coinFlip.contract, "setCoinFlipResolver", resolver);
  const verification = await verifyMany(hre, [coinFlip]);

  const output = {
    ...existingDeployment,
    network: network.name,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    owner,
    resolver,
    houseEdgeBps,
    previousContracts: {
      encryptedCasinoVault: {
        address: vaultAddress
      },
      encryptedCoinFlip: previousCoinFlip,
      encryptedDiceGame: pickCurrentContract(existingContracts, existingPreviousContracts, "encryptedDiceGame"),
      encryptedCrashGame: pickCurrentContract(existingContracts, existingPreviousContracts, "encryptedCrashGame")
    },
    contracts: {
      ...existingContracts,
      encryptedCasinoVault: {
        address: vaultAddress
      },
      encryptedCoinFlip: serializeDeployment(coinFlip)
    },
    authorizationTxs: {
      ...existingAuthorizationTxs,
      authorizeCoinFlipVault
    },
    resolverTxs: {
      ...existingResolverTxs,
      setCoinFlipResolver
    },
    verification: {
      ...existingVerification,
      ...verification
    },
    frontendEnv: {
      ...existingFrontendEnv,
      NEXT_PUBLIC_FHE_VAULT_ADDRESS: vaultAddress,
      NEXT_PUBLIC_FHE_COIN_FLIP_ADDRESS: coinFlip.address
    }
  };

  const outFile = writeDeploymentFile(__dirname, network.name, "fhe-casino.json", output);

  console.log("Replacement EncryptedCoinFlip:", coinFlip.address);
  console.log("Updated deployment file:", outFile);
  console.log("Frontend env value:");
  console.log(`NEXT_PUBLIC_FHE_COIN_FLIP_ADDRESS=${coinFlip.address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
