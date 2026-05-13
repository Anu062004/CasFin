const { ethers } = require("hardhat");

async function main() {
  const vaultAddress = "0xA6406C70FaF7E86B9B8b1cdbC21F7148f6d3E175";
  const vault = await ethers.getContractAt("EncryptedCasinoVault", vaultAddress);
  
  const [deployer] = await ethers.getSigners();
  console.log("Using operator:", deployer.address);
  
  const balance = await ethers.provider.getBalance(vaultAddress);
  console.log("Vault Balance:", ethers.formatEther(balance), "ETH");
  
  const minimumReserve = await vault.minimumReserveWei();
  console.log("Minimum Reserve:", ethers.formatEther(minimumReserve), "ETH");
  
  if (balance < minimumReserve) {
    console.log("Funding vault to meet minimum reserve...");
    const shortfall = minimumReserve - balance;
    // Add a little extra buffer (0.01 ETH)
    const amountToFund = shortfall + ethers.parseEther("0.01");
    
    const fundTx = await vault.fundHouseBankroll({ value: amountToFund });
    await fundTx.wait();
    console.log("Funded vault with", ethers.formatEther(amountToFund), "ETH");
  } else {
    console.log("Vault already has sufficient funds.");
  }
  
  const isPaused = await vault.paused();
  if (isPaused) {
    console.log("Unpausing the vault...");
    const unpauseTx = await vault.unpause();
    await unpauseTx.wait();
    console.log("Vault successfully unpaused!");
  } else {
    console.log("Vault is not paused.");
  }
}

main().catch(console.error);
