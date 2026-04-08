const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { ethers, network } = hre;
const { deployContract, serializeDeployment, trackTransaction, verifyMany, writeDeploymentFile } = require("./deployUtils");

const DEFAULT_DEPLOYMENT_FILE = path.resolve(__dirname, "..", "deployments", "arbitrumSepolia", "fhe-casino.json");
const DEFAULT_VAULT_ADDRESS = "0xDe635798122487CF0a61512D2D7229D28436d9f8";

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

function readDeploymentContracts(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw);

  if (!isRecord(parsed)) {
    return {};
  }

  if (isRecord(parsed.contracts)) {
    return parsed.contracts;
  }

  if (isRecord(parsed.casino) && isRecord(parsed.casino.contracts)) {
    return parsed.casino.contracts;
  }

  return {};
}

function resolveOwner(deployerAddress) {
  const configured = process.env.FHE_OWNER_ADDRESS || process.env.CASINO_OWNER_ADDRESS;
  return configured || deployerAddress;
}

function resolveResolver(defaultAddress) {
  return process.env.FHE_RESOLVER_ADDRESS || process.env.CASINO_RESOLVER_ADDRESS || defaultAddress;
}

function resolveVaultAddress(contracts) {
  return process.env.FHE_EXISTING_VAULT_ADDRESS || getAddress(contracts.encryptedCasinoVault) || DEFAULT_VAULT_ADDRESS;
}

function resolveHouseEdgeBps() {
  return Number(process.env.FHE_HOUSE_EDGE_BPS || 200);
}

function resolveCrashRoundId() {
  return Number(process.env.FHE_CRASH_INITIAL_ROUND_ID || 100000);
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

async function main() {
  if (network.name !== "arbitrumSepolia") {
    throw new Error("RUN_WITH_ARBITRUM_SEPOLIA_NETWORK");
  }

  const [deployer] = await ethers.getSigners();
  const deploymentFile = resolveDeploymentFile();
  const previousContracts = readDeploymentContracts(deploymentFile);
  const vaultAddress = resolveVaultAddress(previousContracts);
  const owner = resolveOwner(deployer.address);
  const resolver = resolveResolver(deployer.address);
  const houseEdgeBps = resolveHouseEdgeBps();
  const crashInitialRoundId = resolveCrashRoundId();

  assertAddress("vault", vaultAddress);
  assertAddress("owner", owner);
  assertAddress("resolver", resolver);

  const vault = await ethers.getContractAt("EncryptedCasinoVault", vaultAddress);
  const vaultOwner = await vault.owner();
  if (vaultOwner.toLowerCase() !== deployer.address.toLowerCase()) {
    throw new Error(`DEPLOYER_NOT_VAULT_OWNER: signer=${deployer.address} vaultOwner=${vaultOwner}`);
  }

  console.log("Redeploying FHE games from:", deployer.address);
  console.log("Network:", network.name);
  console.log("Vault:", vaultAddress);
  console.log("Owner:", owner);
  console.log("Resolver:", resolver);
  console.log("House edge bps:", houseEdgeBps);
  console.log("Crash initial round id:", crashInitialRoundId);

  const coinFlip = await deployContract(ethers, "EncryptedCoinFlip", [owner, vaultAddress, houseEdgeBps]);
  const dice = await deployContract(ethers, "EncryptedDiceGame", [owner, vaultAddress, houseEdgeBps]);
  const crash = await deployContract(ethers, "EncryptedCrashGame", [owner, vaultAddress, houseEdgeBps, crashInitialRoundId]);

  const authorizationTxs = {
    authorizeCoinFlipVault: await authorizeGameIfNeeded(vault, "authorizeCoinFlipVault", coinFlip.address),
    authorizeDiceVault: await authorizeGameIfNeeded(vault, "authorizeDiceVault", dice.address),
    authorizeCrashVault: await authorizeGameIfNeeded(vault, "authorizeCrashVault", crash.address)
  };

  const resolverTxs = {
    setCoinFlipResolver: await setResolverIfNeeded(coinFlip.contract, "setCoinFlipResolver", resolver),
    setDiceResolver: await setResolverIfNeeded(dice.contract, "setDiceResolver", resolver),
    setCrashResolver: await setResolverIfNeeded(crash.contract, "setCrashResolver", resolver)
  };

  const verification = await verifyMany(hre, [coinFlip, dice, crash]);

  const output = {
    network: network.name,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    owner,
    resolver,
    houseEdgeBps,
    crashInitialRoundId,
    previousContracts: {
      encryptedCasinoVault: {
        address: vaultAddress
      },
      encryptedCoinFlip: previousContracts.encryptedCoinFlip || null,
      encryptedDiceGame: previousContracts.encryptedDiceGame || null,
      encryptedCrashGame: previousContracts.encryptedCrashGame || null
    },
    contracts: {
      encryptedCasinoVault: {
        address: vaultAddress
      },
      encryptedCoinFlip: serializeDeployment(coinFlip),
      encryptedDiceGame: serializeDeployment(dice),
      encryptedCrashGame: serializeDeployment(crash)
    },
    authorizationTxs,
    resolverTxs,
    verification,
    frontendEnv: {
      NEXT_PUBLIC_FHE_VAULT_ADDRESS: vaultAddress,
      NEXT_PUBLIC_FHE_COIN_FLIP_ADDRESS: coinFlip.address,
      NEXT_PUBLIC_FHE_DICE_ADDRESS: dice.address,
      NEXT_PUBLIC_FHE_CRASH_ADDRESS: crash.address
    }
  };

  const outFile = writeDeploymentFile(__dirname, network.name, "fhe-casino.json", output);

  console.log("Replacement EncryptedCoinFlip:", coinFlip.address);
  console.log("Replacement EncryptedDiceGame:", dice.address);
  console.log("Replacement EncryptedCrashGame:", crash.address);
  console.log("Updated deployment file:", outFile);
  console.log("Frontend env values:");
  console.log(`NEXT_PUBLIC_FHE_VAULT_ADDRESS=${vaultAddress}`);
  console.log(`NEXT_PUBLIC_FHE_COIN_FLIP_ADDRESS=${coinFlip.address}`);
  console.log(`NEXT_PUBLIC_FHE_DICE_ADDRESS=${dice.address}`);
  console.log(`NEXT_PUBLIC_FHE_CRASH_ADDRESS=${crash.address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
