const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Chainlink VRF Adapter", function () {
  it("requests and fulfills randomness through the coordinator-style adapter", async function () {
    const [owner, game] = await ethers.getSigners();

    const MockCoordinator = await ethers.getContractFactory("MockVRFCoordinatorV2Plus");
    const coordinator = await MockCoordinator.deploy();
    await coordinator.waitForDeployment();

    const ChainlinkVRFAdapter = await ethers.getContractFactory("ChainlinkVRFAdapter");
    const adapter = await ChainlinkVRFAdapter.deploy(
      owner.address,
      await coordinator.getAddress(),
      "0x1111111111111111111111111111111111111111111111111111111111111111",
      7,
      3,
      250000,
      1,
      true
    );
    await adapter.waitForDeployment();

    await adapter.authorizeGame(game.address, true);

    const context = ethers.keccak256(ethers.toUtf8Bytes("coin-flip"));
    await adapter.connect(game).requestRandomness(context);

    const stored = await coordinator.getStoredRequest(0);
    expect(stored.subId).to.equal(7n);
    expect(stored.requestConfirmations).to.equal(3n);
    expect(stored.callbackGasLimit).to.equal(250000n);
    expect(stored.numWords).to.equal(1n);

    await coordinator.fulfillRequest(0, 777);
    const result = await adapter.getRandomness(0);
    expect(result[0]).to.equal(777n);
    expect(result[1]).to.equal(true);
  });
});
