import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

type GameContract = {
  name: string;
  address: string;
};

type DeploymentContracts = {
  encryptedCasinoVault?: { address?: string };
  encryptedCoinFlip?: { address?: string };
  encryptedDiceGame?: { address?: string };
  encryptedCrashGame?: { address?: string };
};

const DEFAULT_DEPLOYMENT_FILE = path.resolve(__dirname, "..", "deployments", "arbitrumSepolia", "fhe-casino.json");
const DEFAULT_CASINO_VAULT_ADDRESS = "0xDe635798122487CF0a61512D2D7229D28436d9f8";
const DEFAULT_GAME_CONTRACTS: GameContract[] = [
  { name: "EncryptedCoinFlip", address: "0x6dd64A41E8c2AC90eaC95b0a194c8943D40Fe945" },
  { name: "EncryptedDiceGame", address: "0x62dA6E0a33e0E1B67240348e768dD3Aed9feFDAB" },
  { name: "EncryptedCrashGame", address: "0xA204279bBb036e31Fc9cbFC7d6660c29E18D6F45" }
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getAddress(entry: unknown): string | null {
  if (!isRecord(entry)) {
    return null;
  }

  const address = entry.address;
  return typeof address === "string" && address.length > 0 ? address : null;
}

function resolveDeploymentFile(): string {
  const configuredPath = process.env.CASFIN_DEPLOYMENT_FILE;
  return configuredPath ? path.resolve(configuredPath) : DEFAULT_DEPLOYMENT_FILE;
}

function readDeploymentContracts(filePath: string): DeploymentContracts {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const parsed: unknown = JSON.parse(raw);

  if (!isRecord(parsed)) {
    return {};
  }

  if (isRecord(parsed.contracts)) {
    return parsed.contracts as DeploymentContracts;
  }

  if (isRecord(parsed.casino) && isRecord(parsed.casino.contracts)) {
    return parsed.casino.contracts as DeploymentContracts;
  }

  return {};
}

function assertAddress(label: string, address: string) {
  if (!ethers.isAddress(address)) {
    throw new Error(`Invalid address for ${label}: ${address}`);
  }
}

function resolveVaultAddress(contracts: DeploymentContracts): string {
  return getAddress(contracts.encryptedCasinoVault) || DEFAULT_CASINO_VAULT_ADDRESS;
}

function resolveGameContracts(contracts: DeploymentContracts): GameContract[] {
  const fromDeployment: GameContract[] = [
    { name: "EncryptedCoinFlip", address: getAddress(contracts.encryptedCoinFlip) || "" },
    { name: "EncryptedDiceGame", address: getAddress(contracts.encryptedDiceGame) || "" },
    { name: "EncryptedCrashGame", address: getAddress(contracts.encryptedCrashGame) || "" }
  ].filter((game) => ethers.isAddress(game.address));

  return fromDeployment.length > 0 ? fromDeployment : DEFAULT_GAME_CONTRACTS;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Authorizing games with:", deployer.address);

  const deploymentFile = resolveDeploymentFile();
  console.log("Loading deployment config:", deploymentFile);
  const contracts = readDeploymentContracts(deploymentFile);

  const casinoVaultAddress = resolveVaultAddress(contracts);
  const gameContracts = resolveGameContracts(contracts);

  assertAddress("EncryptedCasinoVault", casinoVaultAddress);
  for (const game of gameContracts) {
    assertAddress(game.name, game.address);
  }

  const casino = await ethers.getContractAt("EncryptedCasinoVault", casinoVaultAddress);

  for (const game of gameContracts) {
    const alreadyAuthorized = await casino.authorizedGames(game.address);

    if (alreadyAuthorized) {
      console.log(`[ok] ${game.name} already authorized at ${game.address}`);
      console.log(`Verified: ${game.name} authorized = ${alreadyAuthorized}`);
      continue;
    }

    console.log(`Authorizing ${game.name} at ${game.address}...`);
    const tx = await casino.authorizeGame(game.address, true);
    await tx.wait();
    console.log(`[ok] ${game.name} authorized. TX: ${tx.hash}`);

    const isAuthorized = await casino.authorizedGames(game.address);
    console.log(`Verified: ${game.name} authorized = ${isAuthorized}`);

    if (!isAuthorized) {
      throw new Error(`Authorization verification failed for ${game.name} (${game.address}).`);
    }
  }

  console.log("All games authorized successfully!");
}

main().catch((err) => {
  console.error("[error] Authorization failed:", err);
  process.exit(1);
});
