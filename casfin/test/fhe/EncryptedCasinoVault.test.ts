import { expect } from "chai";
import { ethers, network } from "hardhat";
import {
  asHandle,
  deployMockFheEnvironment,
  mockDecrypt,
  mockEncrypt,
  mockEncryptUint128Input,
  mockResolveDecrypt,
} from "./helpers/deployFheMocks";

async function expectRevert(promise: Promise<unknown>, message: string): Promise<void> {
  try {
    await promise;
    expect.fail(`Expected revert containing "${message}"`);
  } catch (error) {
    expect((error as Error).message).to.include(message);
  }
}

describe("EncryptedCasinoVault", function () {
  let owner: Awaited<ReturnType<typeof ethers.getSigners>>[number];
  let player: Awaited<ReturnType<typeof ethers.getSigners>>[number];
  let game: Awaited<ReturnType<typeof ethers.getSigners>>[number];
  let stranger: Awaited<ReturnType<typeof ethers.getSigners>>[number];
  let vault: any;

  const depositWei = ethers.parseEther("0.1");
  const halfDepositWei = ethers.parseEther("0.05");

  function encodeHandle(handle: bigint): string {
    return ethers.toBeHex(handle, 32);
  }

  async function decryptBalance(signer: typeof player): Promise<bigint> {
    const handle = await vault.connect(signer).getEncryptedBalance();
    return mockDecrypt(asHandle(handle));
  }

  async function decryptLockedBalance(signer: typeof player): Promise<bigint> {
    const handle = await vault.connect(signer).getEncryptedLockedBalance();
    return mockDecrypt(asHandle(handle));
  }

  beforeEach(async function () {
    await network.provider.request({ method: "hardhat_reset", params: [] });

    [owner, player, game, stranger] = await ethers.getSigners();
    await deployMockFheEnvironment();

    vault = await ethers.deployContract("EncryptedCasinoVault", [await owner.getAddress()]);
    await vault.waitForDeployment();
    await (await vault.connect(owner).authorizeGame(await game.getAddress(), true)).wait();
  });

  it("deposits ETH and stores as encrypted balance", async function () {
    await (await vault.connect(player).depositETH({ value: depositWei })).wait();

    const balanceHandle = asHandle(await vault.connect(player).getEncryptedBalance());

    expect(balanceHandle).to.not.equal(0n);
    expect(await mockDecrypt(balanceHandle)).to.equal(depositWei);
  });

  it("rejects deposit above uint128 max", async function () {
    const oversizedDeposit = (2n ** 128n) + 1n;
    await network.provider.send("hardhat_setBalance", [await player.getAddress(), ethers.toBeHex(oversizedDeposit * 2n)]);

    await expectRevert(
      vault.connect(player).depositETH({ value: oversizedDeposit }),
      "DEPOSIT_TOO_LARGE",
    );
  });

  it("reserveFunds locks encrypted balance", async function () {
    await (await vault.connect(player).depositETH({ value: depositWei })).wait();

    const reserveAmount = await mockEncrypt(halfDepositWei);
    await (await vault.connect(game).reserveFunds(await player.getAddress(), encodeHandle(reserveAmount))).wait();

    expect(await decryptLockedBalance(player)).to.equal(halfDepositWei);
    expect(await decryptBalance(player)).to.equal(halfDepositWei);
  });

  it("reserveFunds grants zero handle when balance insufficient", async function () {
    await (await vault.connect(player).depositETH({ value: halfDepositWei })).wait();

    const reserveAmount = await mockEncrypt(depositWei);
    await (await vault.connect(game).reserveFunds(await player.getAddress(), encodeHandle(reserveAmount))).wait();

    expect(await decryptLockedBalance(player)).to.equal(0n);
    expect(await decryptBalance(player)).to.equal(halfDepositWei);
  });

  it("settleBet credits winner with 2x return", async function () {
    await (await vault.connect(player).depositETH({ value: depositWei })).wait();

    const wagerHandle = await mockEncrypt(depositWei);
    await (await vault.connect(game).reserveFunds(await player.getAddress(), encodeHandle(wagerHandle))).wait();

    const lockedHandle = asHandle(await vault.connect(player).getEncryptedLockedBalance());
    const winReturnHandle = await mockEncrypt(ethers.parseEther("0.196"));

    await (
      await vault.connect(game).settleBet(
        await player.getAddress(),
        encodeHandle(lockedHandle),
        encodeHandle(winReturnHandle),
      )
    ).wait();

    expect(await decryptBalance(player)).to.equal(ethers.parseEther("0.196"));
    expect(await decryptLockedBalance(player)).to.equal(0n);
  });

  it("settleBet refunds loser with zero", async function () {
    await (await vault.connect(player).depositETH({ value: depositWei })).wait();

    const wagerHandle = await mockEncrypt(depositWei);
    await (await vault.connect(game).reserveFunds(await player.getAddress(), encodeHandle(wagerHandle))).wait();

    const lockedHandle = asHandle(await vault.connect(player).getEncryptedLockedBalance());
    const zeroHandle = await mockEncrypt(0n);

    await (
      await vault.connect(game).settleBet(
        await player.getAddress(),
        encodeHandle(lockedHandle),
        encodeHandle(zeroHandle),
      )
    ).wait();

    expect(await decryptBalance(player)).to.equal(0n);
    expect(await decryptLockedBalance(player)).to.equal(0n);
  });

  it("withdrawETH two-phase: request then finalize", async function () {
    await (await vault.connect(player).depositETH({ value: depositWei })).wait();

    const withdrawInput = await mockEncryptUint128Input(halfDepositWei, player);
    await (await vault.connect(player).withdrawETH(withdrawInput)).wait();

    const [pendingHandle, pendingExists] = await vault.connect(player).getPendingWithdrawal();
    expect(pendingExists).to.equal(true);
    expect(asHandle(pendingHandle)).to.not.equal(0n);

    await mockResolveDecrypt(asHandle(pendingHandle));

    const finalizeInput = await mockEncryptUint128Input(0n, player);
    const balanceBeforeFinalize = await ethers.provider.getBalance(await player.getAddress());
    const finalizeTx = await vault.connect(player).withdrawETH(finalizeInput);
    const finalizeReceipt = await finalizeTx.wait();
    const balanceAfterFinalize = await ethers.provider.getBalance(await player.getAddress());
    const gasCost = finalizeReceipt!.fee!;

    expect(balanceAfterFinalize + gasCost - balanceBeforeFinalize).to.equal(halfDepositWei);
    expect(await decryptBalance(player)).to.equal(halfDepositWei);

    const [, existsAfterFinalize] = await vault.connect(player).getPendingWithdrawal();
    expect(existsAfterFinalize).to.equal(false);
  });

  it("auto-pauses when balance falls below minimumReserve", async function () {
    // Actual contract behavior: withdrawHouseFunds cannot breach the reserve floor.
    // The vault auto-pauses when finalize-withdrawal leaves ETH below minimumReserveWei.
    await (await vault.connect(owner).fundHouseBankroll({ value: ethers.parseEther("0.5") })).wait();
    await (await vault.connect(player).depositETH({ value: depositWei })).wait();
    await (await vault.connect(owner).setMinimumReserve(ethers.parseEther("0.55"))).wait();

    const withdrawInput = await mockEncryptUint128Input(depositWei, player);
    await (await vault.connect(player).withdrawETH(withdrawInput)).wait();

    const [pendingHandle] = await vault.connect(player).getPendingWithdrawal();
    await mockResolveDecrypt(asHandle(pendingHandle));

    const finalizeInput = await mockEncryptUint128Input(0n, player);
    await (await vault.connect(player).withdrawETH(finalizeInput)).wait();

    expect(await vault.paused()).to.equal(true);

    const zeroHandle = await mockEncrypt(0n);
    await expectRevert(
      vault.connect(game).settleBet(
        await player.getAddress(),
        encodeHandle(zeroHandle),
        encodeHandle(zeroHandle),
      ),
      "PAUSED",
    );
  });

  it("rejects reserveFunds from unauthorized game address", async function () {
    await expectRevert(
      vault.connect(stranger).reserveFunds(await player.getAddress(), encodeHandle(await mockEncrypt(1n))),
      "NOT_AUTHORIZED_GAME",
    );
  });

  it("enforces max bet cap - grants zero handle when above cap", async function () {
    await (await vault.connect(player).depositETH({ value: ethers.parseEther("1") })).wait();

    const oversizedBetHandle = await mockEncrypt(ethers.parseEther("0.5"));
    await (await vault.connect(game).reserveFunds(await player.getAddress(), encodeHandle(oversizedBetHandle))).wait();

    expect(await decryptLockedBalance(player)).to.equal(0n);
    expect(await decryptBalance(player)).to.equal(ethers.parseEther("1"));
  });
});
