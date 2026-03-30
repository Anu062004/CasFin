const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CHIPS and Staking", function () {
  async function deployClone(implementationAddress) {
    const creationCode = `0x3d602d80600a3d3981f3363d3d373d3d3d363d73${implementationAddress
      .slice(2)
      .toLowerCase()}5af43d82803e903d91602b57fd5bf3`;
    const [deployer] = await ethers.getSigners();
    const tx = await deployer.sendTransaction({ data: creationCode });
    const receipt = await tx.wait();
    return receipt.contractAddress;
  }

  async function deployFeeDistributor(owner, treasury) {
    const FeeDistributor = await ethers.getContractFactory("FeeDistributor");
    const implementation = await FeeDistributor.deploy();
    await implementation.waitForDeployment();

    const cloneAddress = await deployClone(await implementation.getAddress());
    const feeDistributor = await ethers.getContractAt("FeeDistributor", cloneAddress);
    await feeDistributor.initialize(owner.address, treasury.address);
    return feeDistributor;
  }

  it("stakes CHIPS and receives a routed platform-fee reward", async function () {
    const [owner, treasury, staker] = await ethers.getSigners();

    const CasinoToken = await ethers.getContractFactory("CasinoToken");
    const chips = await CasinoToken.deploy(owner.address, ethers.parseEther("1000"));
    await chips.waitForDeployment();

    const StakingPool = await ethers.getContractFactory("StakingPool");
    const stakingPool = await StakingPool.deploy(owner.address, await chips.getAddress());
    await stakingPool.waitForDeployment();

    const feeDistributor = await deployFeeDistributor(owner, treasury);

    await stakingPool.setRewardNotifier(await feeDistributor.getAddress(), true);
    await feeDistributor.setStakingPool(await stakingPool.getAddress(), 2500);

    await chips.transfer(staker.address, ethers.parseEther("100"));
    await chips.connect(staker).approve(await stakingPool.getAddress(), ethers.parseEther("100"));
    await stakingPool.connect(staker).stake(ethers.parseEther("100"));

    await feeDistributor.routePlatformFee({ value: ethers.parseEther("1") });
    expect(await stakingPool.pendingReward(staker.address)).to.equal(ethers.parseEther("0.25"));

    await stakingPool.connect(staker).claimRewards();
  });

  it("queues rewards when nobody is staked and distributes them to the first staker", async function () {
    const [owner, staker] = await ethers.getSigners();

    const CasinoToken = await ethers.getContractFactory("CasinoToken");
    const chips = await CasinoToken.deploy(owner.address, ethers.parseEther("1000"));
    await chips.waitForDeployment();

    const StakingPool = await ethers.getContractFactory("StakingPool");
    const stakingPool = await StakingPool.deploy(owner.address, await chips.getAddress());
    await stakingPool.waitForDeployment();

    await stakingPool.notifyReward({ value: ethers.parseEther("0.5") });
    expect(await stakingPool.queuedRewards()).to.equal(ethers.parseEther("0.5"));

    await chips.transfer(staker.address, ethers.parseEther("50"));
    await chips.connect(staker).approve(await stakingPool.getAddress(), ethers.parseEther("50"));
    await stakingPool.connect(staker).stake(ethers.parseEther("50"));

    expect(await stakingPool.queuedRewards()).to.equal(0n);
    expect(await stakingPool.pendingReward(staker.address)).to.equal(ethers.parseEther("0.5"));
  });

  it("enforces the CHIPS max supply cap", async function () {
    const [owner] = await ethers.getSigners();

    const CasinoToken = await ethers.getContractFactory("CasinoToken");
    const chips = await CasinoToken.deploy(owner.address, ethers.parseEther("100000000"));
    await chips.waitForDeployment();

    let reverted = false;
    try {
      await chips.mint(owner.address, 1);
    } catch (error) {
      reverted = true;
      expect(String(error.message).includes("MAX_SUPPLY_EXCEEDED")).to.equal(true);
    }

    expect(reverted).to.equal(true);
  });
});
