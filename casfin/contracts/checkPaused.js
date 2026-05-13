const { ethers } = require("hardhat");

async function main() {
  const vaultAddress = "0xA6406C70FaF7E86B9B8b1cdbC21F7148f6d3E175";
  const vault = await ethers.getContractAt("EncryptedCasinoVault", vaultAddress);
  
  const isPaused = await vault.paused();
  console.log("Is the vault paused?", isPaused);
}

main().catch(console.error);
