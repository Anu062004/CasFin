const fs = require("fs");
const path = require("path");

function getOptionalAddress(ethers, name) {
  const value = process.env[name];
  if (!value) {
    return null;
  }
  if (!ethers.isAddress(value)) {
    throw new Error(`Invalid address in ${name}: ${value}`);
  }
  return value;
}

function getRequiredAddress(ethers, name, fallback) {
  const value = process.env[name] || fallback;
  if (!value || !ethers.isAddress(value)) {
    throw new Error(`Missing or invalid address for ${name}`);
  }
  return value;
}

function getNumber(name, fallback) {
  const value = process.env[name];
  return value === undefined ? fallback : Number(value);
}

function getBigIntWeiFromEth(ethers, name, fallbackEth) {
  const value = process.env[name];
  return ethers.parseEther(value || fallbackEth);
}

function isManualRouterForced() {
  return process.env.FORCE_MANUAL_ROUTER === "true";
}

function getRequiredVrfConfig() {
  const requiredKeys = ["VRF_COORDINATOR_ADDRESS", "VRF_KEY_HASH", "VRF_SUBSCRIPTION_ID"];
  const missing = requiredKeys.filter((key) => !process.env[key] || process.env[key].includes("your"));
  if (missing.length > 0) {
    throw new Error(
      `Missing Chainlink VRF configuration: ${missing.join(", ")}. Set FORCE_MANUAL_ROUTER=true only for local testing.`
    );
  }

  return {
    coordinatorAddress: process.env.VRF_COORDINATOR_ADDRESS,
    keyHash: process.env.VRF_KEY_HASH,
    subscriptionId: BigInt(process.env.VRF_SUBSCRIPTION_ID),
    requestConfirmations: Number(process.env.VRF_REQUEST_CONFIRMATIONS || 3),
    callbackGasLimit: Number(process.env.VRF_CALLBACK_GAS_LIMIT || 250000),
    numWords: Number(process.env.VRF_NUM_WORDS || 1),
    nativePayment: process.env.VRF_NATIVE_PAYMENT ? process.env.VRF_NATIVE_PAYMENT === "true" : true
  };
}

async function deployContract(ethers, name, args = [], contractPath) {
  const Contract = await ethers.getContractFactory(name);
  const contract = await Contract.deploy(...args);
  const deploymentTx = contract.deploymentTransaction();
  const receipt = await deploymentTx.wait();

  return {
    name,
    contract,
    address: await contract.getAddress(),
    txHash: deploymentTx.hash,
    gasUsed: receipt.gasUsed.toString(),
    constructorArguments: args,
    contractPath: contractPath || undefined
  };
}

async function trackTransaction(label, txPromise) {
  const tx = await txPromise;
  const receipt = await tx.wait();
  return {
    label,
    txHash: tx.hash,
    gasUsed: receipt.gasUsed.toString()
  };
}

async function verifyDeployment(hre, deployment, constructorArguments = deployment.constructorArguments, contractPath = undefined) {
  if (!process.env.ARBISCAN_API_KEY) {
    return { skipped: true, reason: "ARBISCAN_API_KEY not configured" };
  }

  if (["hardhat", "localhost"].includes(hre.network.name)) {
    return { skipped: true, reason: `verification skipped on ${hre.network.name}` };
  }

  try {
    const resolvedContractPath = contractPath || deployment.contractPath;
    await hre.run("verify:verify", {
      address: deployment.address,
      constructorArguments,
      ...(resolvedContractPath ? { contract: resolvedContractPath } : {})
    });
    return { skipped: false, verified: true };
  } catch (error) {
    const message = error.message || String(error);
    if (
      message.includes("Already Verified") ||
      message.includes("already verified") ||
      message.includes("Contract source code already verified")
    ) {
      return { skipped: false, verified: true, alreadyVerified: true };
    }
    return { skipped: false, verified: false, error: message };
  }
}

async function verifyMany(hre, deployments) {
  const results = {};
  for (const deployment of deployments) {
    results[deployment.name] = await verifyDeployment(hre, deployment);
  }
  return results;
}

function writeDeploymentFile(baseDir, networkName, fileName, data) {
  const outDir = path.join(baseDir, "..", "deployments", networkName);
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, fileName);
  fs.writeFileSync(outFile, `${JSON.stringify(data, null, 2)}\n`);
  return outFile;
}

function serializeDeployment(deployment, overrides = {}) {
  return {
    name: deployment.name,
    type: deployment.type || deployment.name,
    address: deployment.address,
    txHash: deployment.txHash,
    gasUsed: deployment.gasUsed,
    ...overrides
  };
}

module.exports = {
  deployContract,
  getBigIntWeiFromEth,
  getNumber,
  getOptionalAddress,
  getRequiredAddress,
  getRequiredVrfConfig,
  isManualRouterForced,
  serializeDeployment,
  trackTransaction,
  verifyMany,
  writeDeploymentFile
};
