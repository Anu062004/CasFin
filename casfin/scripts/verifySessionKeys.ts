// Smoke-test script to verify session key functions are live on the deployed vault.
// Run after redeploying the vault: npx hardhat run scripts/verifySessionKeys.ts --network arbitrumSepolia

const hre = require("hardhat");
const { ethers } = hre;

const VAULT_ADDRESS = process.env.FHE_VAULT_ADDRESS || process.env.NEXT_PUBLIC_FHE_VAULT_ADDRESS || "";

async function main() {
  if (!ethers.isAddress(VAULT_ADDRESS)) {
    throw new Error(`Set FHE_VAULT_ADDRESS env var to the deployed vault. Got: "${VAULT_ADDRESS}"`);
  }

  const [deployer] = await ethers.getSigners();
  console.log("Verifying session key support on vault:", VAULT_ADDRESS);
  console.log("Deployer:", deployer.address);

  const vault = await ethers.getContractAt("EncryptedCasinoVault", VAULT_ADDRESS);

  // Verify resolvePlayer returns the caller when no delegation exists
  const resolved = await vault.resolvePlayer(deployer.address);
  if (resolved.toLowerCase() !== deployer.address.toLowerCase()) {
    throw new Error(`resolvePlayer returned ${resolved} instead of ${deployer.address}`);
  }
  console.log("[ok] resolvePlayer(deployer) =", resolved);

  // Generate a test session key and authorize it
  const sessionWallet = ethers.Wallet.createRandom();
  console.log("Test session key:", sessionWallet.address);

  const authTx = await vault.authorizeSessionKey(sessionWallet.address, 3600);
  await authTx.wait();
  console.log("[ok] authorizeSessionKey tx:", authTx.hash);

  // Verify sessionKeyOwner mapping
  const owner = await vault.sessionKeyOwner(sessionWallet.address);
  if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
    throw new Error(`sessionKeyOwner returned ${owner} instead of ${deployer.address}`);
  }
  console.log("[ok] sessionKeyOwner =", owner);

  // Verify resolvePlayer returns the real player for the session key
  const resolvedViaSessionKey = await vault.resolvePlayer(sessionWallet.address);
  if (resolvedViaSessionKey.toLowerCase() !== deployer.address.toLowerCase()) {
    throw new Error(`resolvePlayer(sessionKey) returned ${resolvedViaSessionKey}`);
  }
  console.log("[ok] resolvePlayer(sessionKey) =", resolvedViaSessionKey);

  // Revoke the test session key
  const revokeTx = await vault.revokeSessionKey(sessionWallet.address);
  await revokeTx.wait();
  console.log("[ok] revokeSessionKey tx:", revokeTx.hash);

  // Verify revoked key resolves to itself
  const resolvedAfterRevoke = await vault.resolvePlayer(sessionWallet.address);
  if (resolvedAfterRevoke.toLowerCase() !== sessionWallet.address.toLowerCase()) {
    throw new Error(`After revoke, resolvePlayer returned ${resolvedAfterRevoke}`);
  }
  console.log("[ok] After revoke, resolvePlayer(sessionKey) =", resolvedAfterRevoke);

  console.log("\nAll session key checks passed.");
}

main().catch((err) => {
  console.error("[error]", err);
  process.exit(1);
});

export {};
