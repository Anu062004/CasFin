const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CasFin Casino Stage", function () {
  async function deployFixture() {
    const [owner, player, otherPlayer] = await ethers.getSigners();

    const CasinoVault = await ethers.getContractFactory("CasinoVault");
    const vault = await CasinoVault.deploy(owner.address);
    await vault.waitForDeployment();

    const MockCoordinator = await ethers.getContractFactory("MockVRFCoordinatorV2Plus");
    const coordinator = await MockCoordinator.deploy();
    await coordinator.waitForDeployment();

    const ChainlinkVRFAdapter = await ethers.getContractFactory("ChainlinkVRFAdapter");
    const randomnessRouter = await ChainlinkVRFAdapter.deploy(
      owner.address,
      await coordinator.getAddress(),
      "0x1111111111111111111111111111111111111111111111111111111111111111",
      7,
      3,
      250000,
      1,
      true
    );
    await randomnessRouter.waitForDeployment();

    const CoinFlipGame = await ethers.getContractFactory("CoinFlipGame");
    const coinFlip = await CoinFlipGame.deploy(
      owner.address,
      await vault.getAddress(),
      await randomnessRouter.getAddress(),
      200,
      ethers.parseEther("0.25")
    );
    await coinFlip.waitForDeployment();

    const DiceGame = await ethers.getContractFactory("DiceGame");
    const dice = await DiceGame.deploy(
      owner.address,
      await vault.getAddress(),
      await randomnessRouter.getAddress(),
      200,
      ethers.parseEther("0.15")
    );
    await dice.waitForDeployment();

    const CrashGame = await ethers.getContractFactory("CrashGame");
    const crash = await CrashGame.deploy(
      owner.address,
      await vault.getAddress(),
      await randomnessRouter.getAddress(),
      200,
      ethers.parseEther("0.20")
    );
    await crash.waitForDeployment();

    await vault.authorizeGame(await coinFlip.getAddress(), true);
    await vault.authorizeGame(await dice.getAddress(), true);
    await vault.authorizeGame(await crash.getAddress(), true);

    await randomnessRouter.authorizeGame(await coinFlip.getAddress(), true);
    await randomnessRouter.authorizeGame(await dice.getAddress(), true);
    await randomnessRouter.authorizeGame(await crash.getAddress(), true);

    await vault.fundHouseBankroll({ value: ethers.parseEther("5") });

    return { owner, player, otherPlayer, vault, coordinator, randomnessRouter, coinFlip, dice, crash };
  }

  it("settles a winning coin flip with transparent vault balances", async function () {
    const { player, vault, coordinator, coinFlip } = await deployFixture();

    await vault.connect(player).deposit({ value: ethers.parseEther("1") });
    expect(await vault.balanceOf(player.address)).to.equal(ethers.parseEther("1"));

    await coinFlip.connect(player).placeBet(ethers.parseEther("0.25"), true);
    expect(await vault.balanceOf(player.address)).to.equal(ethers.parseEther("0.75"));
    expect(await vault.lockedBalanceOf(player.address)).to.equal(ethers.parseEther("0.25"));

    await coordinator.fulfillRequest(0, 2);
    await coinFlip.resolveBet(0);

    expect(await vault.balanceOf(player.address)).to.equal(ethers.parseEther("1.24"));
    expect(await vault.lockedBalanceOf(player.address)).to.equal(0n);

    await vault.connect(player).withdraw(ethers.parseEther("1.24"));
    expect(await vault.balanceOf(player.address)).to.equal(0n);
  });

  it("caps stakes at the configured max bet", async function () {
    const { player, vault, coinFlip } = await deployFixture();

    await vault.connect(player).deposit({ value: ethers.parseEther("1") });
    await coinFlip.connect(player).placeBet(ethers.parseEther("0.90"), false);

    expect(await vault.balanceOf(player.address)).to.equal(ethers.parseEther("0.75"));
    expect(await vault.lockedBalanceOf(player.address)).to.equal(ethers.parseEther("0.25"));
  });

  it("allows emergency release of locked balances while paused", async function () {
    const { owner, player, vault, coinFlip } = await deployFixture();

    await vault.connect(player).deposit({ value: ethers.parseEther("1") });
    await coinFlip.connect(player).placeBet(ethers.parseEther("0.25"), true);

    await vault.connect(owner).pause();
    await vault.connect(owner).emergencyRelease(player.address);

    expect(await vault.lockedBalanceOf(player.address)).to.equal(0n);
    expect(await vault.balanceOf(player.address)).to.equal(ethers.parseEther("1"));
  });

  it("settles a losing dice bet with transparent balance accounting", async function () {
    const { player, vault, coordinator, dice } = await deployFixture();

    await vault.connect(player).deposit({ value: ethers.parseEther("0.5") });
    await dice.connect(player).placeBet(ethers.parseEther("0.10"), 2);

    await coordinator.fulfillRequest(0, 4);
    await dice.resolveBet(0);

    expect(await vault.balanceOf(player.address)).to.equal(ethers.parseEther("0.4"));
    expect(await vault.lockedBalanceOf(player.address)).to.equal(0n);
  });

  it("runs a crash round with VRF-backed close and settlement", async function () {
    const { player, vault, coordinator, crash } = await deployFixture();

    await vault.connect(player).deposit({ value: ethers.parseEther("1") });
    await crash.startRound();
    await crash.connect(player).placeBet(0, ethers.parseEther("0.20"), 20_000);

    await coordinator.fulfillRequest(0, 149);
    await crash.closeRound(0);
    await crash.settleBet(0, player.address);

    expect(await vault.balanceOf(player.address)).to.equal(ethers.parseEther("1.192"));
    expect(await vault.lockedBalanceOf(player.address)).to.equal(0n);
  });
});
