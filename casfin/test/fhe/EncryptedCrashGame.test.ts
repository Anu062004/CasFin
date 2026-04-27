import { expect } from "chai";
import { ethers, network } from "hardhat";
import {
  asHandle,
  deployMockFheEnvironment,
  mockDecrypt,
  mockEncryptUint128Input,
  mockResolveDecrypt,
  mockSetPlaintext,
} from "./helpers/deployFheMocks";

async function expectRevert(promise: Promise<unknown>, message: string): Promise<void> {
  try {
    await promise;
    expect.fail(`Expected revert containing "${message}"`);
  } catch (error) {
    expect((error as Error).message).to.include(message);
  }
}

describe("EncryptedCrashGame", function () {
  let owner: Awaited<ReturnType<typeof ethers.getSigners>>[number];
  let player: Awaited<ReturnType<typeof ethers.getSigners>>[number];
  let playerTwo: Awaited<ReturnType<typeof ethers.getSigners>>[number];
  let playerThree: Awaited<ReturnType<typeof ethers.getSigners>>[number];
  let resolver: Awaited<ReturnType<typeof ethers.getSigners>>[number];
  let vault: any;
  let crash: any;

  async function decryptVaultBalance(signer: typeof player): Promise<bigint> {
    return mockDecrypt(asHandle(await vault.connect(signer).getEncryptedBalance()));
  }

  async function startRound(): Promise<void> {
    await (await crash.connect(owner).startRound()).wait();
  }

  async function fundAndBet(
    signer: typeof player,
    roundId: bigint,
    amountWei: bigint,
    cashOutBps: number,
  ): Promise<void> {
    await (await vault.connect(signer).depositETH({ value: amountWei })).wait();
    const encAmount = await mockEncryptUint128Input(amountWei, signer);
    await (await crash.connect(signer).placeBet(roundId, encAmount, cashOutBps)).wait();
  }

  async function closeAndFinalize(roundId: bigint, crashMultiplierBps: bigint): Promise<void> {
    await (await crash.connect(resolver).closeRound(roundId)).wait();
    const round = await crash.rounds(roundId);
    const crashHandle = asHandle(round[1]);

    await mockSetPlaintext(crashHandle, crashMultiplierBps);
    await mockResolveDecrypt(crashHandle);
    await (await crash.connect(resolver).finalizeRound(roundId)).wait();
  }

  beforeEach(async function () {
    await network.provider.request({ method: "hardhat_reset", params: [] });

    [owner, player, playerTwo, playerThree, resolver] = await ethers.getSigners();
    await deployMockFheEnvironment();

    vault = await ethers.deployContract("EncryptedCasinoVault", [await owner.getAddress()]);
    await vault.waitForDeployment();

    crash = await ethers.deployContract("EncryptedCrashGame", [
      await owner.getAddress(),
      await vault.getAddress(),
      200,
      50000,
    ]);
    await crash.waitForDeployment();

    await (await vault.connect(owner).authorizeGame(await crash.getAddress(), true)).wait();
    await (await crash.connect(owner).setResolver(await resolver.getAddress(), true)).wait();
  });

  it("full round lifecycle - start->bet->close->finalize->settle", async function () {
    const amountWei = ethers.parseEther("0.01");

    await startRound();
    await fundAndBet(player, 0n, amountWei, 15000);
    await closeAndFinalize(0n, 20000n);
    await (await crash.connect(resolver).settleBet(0n, await player.getAddress())).wait();

    const round = await crash.rounds(0n);
    const playerBet = await crash.playerBets(0n, await player.getAddress());

    expect(round[3]).to.equal(20000n);
    expect(playerBet[4]).to.equal(true);
    expect(playerBet[5]).to.equal(true);
    expect(await decryptVaultBalance(player)).to.equal(ethers.parseEther("0.0147"));
  });

  it("player loses if cashOut target > crashMultiplier", async function () {
    await startRound();
    await fundAndBet(player, 0n, ethers.parseEther("0.01"), 30000);
    await closeAndFinalize(0n, 15000n);
    await (await crash.connect(resolver).settleBet(0n, await player.getAddress())).wait();

    const playerBet = await crash.playerBets(0n, await player.getAddress());
    expect(playerBet[5]).to.equal(false);
    expect(await decryptVaultBalance(player)).to.equal(0n);
  });

  it("instant crash at 1.0x - all players lose", async function () {
    const amountWei = ethers.parseEther("0.01");

    await startRound();
    await fundAndBet(player, 0n, amountWei, 11000);
    await fundAndBet(playerTwo, 0n, amountWei, 15000);
    await fundAndBet(playerThree, 0n, amountWei, 20000);
    await closeAndFinalize(0n, 10000n);

    await (await crash.connect(resolver).settleBet(0n, await player.getAddress())).wait();
    await (await crash.connect(resolver).settleBet(0n, await playerTwo.getAddress())).wait();
    await (await crash.connect(resolver).settleBet(0n, await playerThree.getAddress())).wait();

    expect(await decryptVaultBalance(player)).to.equal(0n);
    expect(await decryptVaultBalance(playerTwo)).to.equal(0n);
    expect(await decryptVaultBalance(playerThree)).to.equal(0n);
  });

  it("rejects cashOut target below minimum (1.1x = 11000 bps)", async function () {
    await startRound();
    await (await vault.connect(player).depositETH({ value: ethers.parseEther("0.01") })).wait();
    const encAmount = await mockEncryptUint128Input(ethers.parseEther("0.01"), player);

    await expectRevert(
      crash.connect(player).placeBet(0n, encAmount, 10500),
      "BAD_CASHOUT",
    );
  });

  it("multiple players settle independently in same round", async function () {
    const amountWei = ethers.parseEther("0.01");

    await startRound();
    await fundAndBet(player, 0n, amountWei, 15000);
    await fundAndBet(playerTwo, 0n, amountWei, 20000);
    await fundAndBet(playerThree, 0n, amountWei, 30000);
    await closeAndFinalize(0n, 25000n);

    await (await crash.connect(resolver).settleBet(0n, await player.getAddress())).wait();
    await (await crash.connect(resolver).settleBet(0n, await playerTwo.getAddress())).wait();
    await (await crash.connect(resolver).settleBet(0n, await playerThree.getAddress())).wait();

    expect(await decryptVaultBalance(player)).to.equal(ethers.parseEther("0.0147"));
    expect(await decryptVaultBalance(playerTwo)).to.equal(ethers.parseEther("0.0196"));
    expect(await decryptVaultBalance(playerThree)).to.equal(0n);
  });

  it("cannot placeBet after round is closed", async function () {
    await startRound();
    await closeAndFinalize(0n, 20000n);
    await (await vault.connect(player).depositETH({ value: ethers.parseEther("0.01") })).wait();
    const encAmount = await mockEncryptUint128Input(ethers.parseEther("0.01"), player);

    await expectRevert(
      crash.connect(player).placeBet(0n, encAmount, 15000),
      "ROUND_CLOSED",
    );
  });

  it("cannot bet twice in same round (same player)", async function () {
    await startRound();
    await fundAndBet(player, 0n, ethers.parseEther("0.02"), 15000);
    const secondAmount = await mockEncryptUint128Input(ethers.parseEther("0.01"), player);

    await expectRevert(
      crash.connect(player).placeBet(0n, secondAmount, 20000),
      "BET_EXISTS",
    );
  });

  it("cannot finalizeRound before closeRound", async function () {
    await startRound();

    await expectRevert(
      crash.connect(resolver).finalizeRound(0n),
      "ROUND_CLOSE_NOT_REQUESTED",
    );
  });

  it("cannot settleBet twice", async function () {
    await startRound();
    await fundAndBet(player, 0n, ethers.parseEther("0.01"), 15000);
    await closeAndFinalize(0n, 20000n);
    await (await crash.connect(resolver).settleBet(0n, await player.getAddress())).wait();

    await expectRevert(
      crash.connect(resolver).settleBet(0n, await player.getAddress()),
      "BET_SETTLED",
    );
  });

  it("crash exactly at cashOut target - player LOSES", async function () {
    await startRound();
    await fundAndBet(player, 0n, ethers.parseEther("0.01"), 15000);
    await closeAndFinalize(0n, 15000n);
    await (await crash.connect(resolver).settleBet(0n, await player.getAddress())).wait();

    const playerBet = await crash.playerBets(0n, await player.getAddress());
    expect(playerBet[5]).to.equal(false);
    expect(await decryptVaultBalance(player)).to.equal(0n);
  });
});
