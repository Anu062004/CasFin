// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "../base/Ownable.sol";
import {Pausable} from "../base/Pausable.sol";
import {ReentrancyGuard} from "../base/ReentrancyGuard.sol";
import {MathLib} from "../libraries/MathLib.sol";
import {IEncryptedCasinoVault} from "./IEncryptedCasinoVault.sol";
import {GameRandomnessLib} from "./GameRandomness.sol";
import {FHE, InEuint128, TASK_MANAGER_ADDRESS, ebool, euint32, euint128} from "@fhenixprotocol/cofhe-contracts/FHE.sol";
import {ITaskManager} from "@fhenixprotocol/cofhe-contracts/ICofhe.sol";

contract EncryptedCrashGame is Ownable, Pausable, ReentrancyGuard {
    struct Round {
        bool exists;
        euint32 crashMultiplierHandle;
        bool closeRequested;
        uint32 crashMultiplierBps;
        bool closed;
    }

    struct PlayerBet {
        euint128 lockedHandle;
        uint32 cashOutMultiplierBps;
        euint128 encCashOutBps;
        bool exists;
        bool settled;
        bool won;
    }

    uint32 public constant MIN_CASHOUT_BPS = 11_000;

    IEncryptedCasinoVault public immutable vault;
    uint16 public immutable houseEdgeBps;

    uint32 public maxCashOutMultiplierBps;
    uint256 public nextRoundId;

    mapping(uint256 => Round) public rounds;
    mapping(uint256 => mapping(address => PlayerBet)) public playerBets;
    mapping(address => bool) public authorizedResolvers;

    euint128 private ENCRYPTED_ZERO;
    euint128 private ENCRYPTED_BPS_DENOMINATOR;
    euint128 private ENCRYPTED_NET_PAYOUT_BPS;

    event RoundStarted(uint256 indexed roundId);
    event RoundCloseRequested(uint256 indexed roundId);
    event RoundClosed(uint256 indexed roundId, uint32 crashMultiplierBps);
    event CrashBetPlaced(uint256 indexed roundId, address indexed player);
    event CrashBetSettled(uint256 indexed roundId, address indexed player, bool won);
    event MaxCashOutUpdated(uint32 maxCashOutMultiplierBps);

    constructor(address initialOwner, address vaultAddress, uint16 initialHouseEdgeBps, uint32 initialMaxCashOutMultiplierBps) {
        require(vaultAddress != address(0), "ZERO_VAULT");
        require(initialHouseEdgeBps < MathLib.BPS_DENOMINATOR, "BAD_HOUSE_EDGE");
        require(initialMaxCashOutMultiplierBps >= MIN_CASHOUT_BPS, "BAD_MAX_CASHOUT");

        _initializeOwner(initialOwner);
        vault = IEncryptedCasinoVault(vaultAddress);
        houseEdgeBps = initialHouseEdgeBps;
        maxCashOutMultiplierBps = initialMaxCashOutMultiplierBps;

        // Crash reuses encrypted zero for failed reserves and losing payouts.
        ENCRYPTED_ZERO = FHE.asEuint128(0);
        // The game keeps access because this constant is reused across multiple FHE branches.
        FHE.allowThis(ENCRYPTED_ZERO);
        // Basis-point division stays encrypted so cash-out and house-edge math never reveals stake size.
        ENCRYPTED_BPS_DENOMINATOR = FHE.asEuint128(MathLib.BPS_DENOMINATOR);
        // The game keeps access because the denominator is reused in every payout calculation.
        FHE.allowThis(ENCRYPTED_BPS_DENOMINATOR);
        // The encrypted net payout factor avoids recomputing a plaintext-to-encrypted conversion on every settle.
        ENCRYPTED_NET_PAYOUT_BPS = FHE.asEuint128(MathLib.BPS_DENOMINATOR - initialHouseEdgeBps);
        // The game keeps access because the payout factor is reused in every settlement.
        FHE.allowThis(ENCRYPTED_NET_PAYOUT_BPS);

        emit MaxCashOutUpdated(initialMaxCashOutMultiplierBps);
    }

    modifier onlyResolver() {
        require(authorizedResolvers[msg.sender] || msg.sender == owner, "NOT_RESOLVER");
        _;
    }

    function setMaxCashOutMultiplierBps(uint32 newMaxCashOutMultiplierBps) external onlyOwner {
        require(newMaxCashOutMultiplierBps >= MIN_CASHOUT_BPS, "BAD_MAX_CASHOUT");
        maxCashOutMultiplierBps = newMaxCashOutMultiplierBps;
        emit MaxCashOutUpdated(newMaxCashOutMultiplierBps);
    }

    function startRound() external onlyOwner nonReentrant whenNotPaused returns (uint256 roundId) {
        roundId = nextRoundId++;
        rounds[roundId] = Round({
            exists: true,
            crashMultiplierHandle: euint32.wrap(bytes32(0)),
            closeRequested: false,
            crashMultiplierBps: 0,
            closed: false
        });
        emit RoundStarted(roundId);
    }

    function placeBet(uint256 roundId, InEuint128 calldata encAmount, uint32 cashOutMultiplierBps)
        external
        nonReentrant
        whenNotPaused
    {
        Round storage round = rounds[roundId];
        require(round.exists, "UNKNOWN_ROUND");
        require(!round.closed, "ROUND_CLOSED");
        require(!round.closeRequested, "ROUND_CLOSE_PENDING");
        require(cashOutMultiplierBps >= MIN_CASHOUT_BPS, "BAD_CASHOUT");
        require(cashOutMultiplierBps <= maxCashOutMultiplierBps, "CASHOUT_TOO_HIGH");
        require(!playerBets[roundId][msg.sender].exists, "BET_EXISTS");

        // The user's encrypted input is verified by the FHE runtime before the game forwards it to the vault.
        euint128 requestedAmount = FHE.asEuint128(encAmount);
        // The vault needs access to consume the encrypted amount during reserveFunds.
        FHE.allow(requestedAmount, address(vault));

        euint128 lockedHandle = vault.reserveFunds(msg.sender, requestedAmount);
        // Pre-encrypt the cash-out multiplier at bet time so settleBet avoids redundant encryption
        euint128 encCashOutBps = FHE.asEuint128(cashOutMultiplierBps);
        // The game must retain access to reuse this during settlement
        FHE.allowThis(encCashOutBps);

        playerBets[roundId][msg.sender] = PlayerBet({
            lockedHandle: lockedHandle,
            cashOutMultiplierBps: cashOutMultiplierBps,
            encCashOutBps: encCashOutBps,
            exists: true,
            settled: false,
            won: false
        });

        // The game must retain access to the stored encrypted stake for later settlement.
        FHE.allowThis(lockedHandle);
        // The vault also needs access again when this stored handle is passed back during settlement.
        FHE.allow(lockedHandle, address(vault));

        emit CrashBetPlaced(roundId, msg.sender);
    }

    function closeRound(uint256 roundId) external nonReentrant whenNotPaused onlyResolver {
        Round storage round = rounds[roundId];
        require(round.exists, "UNKNOWN_ROUND");
        require(!round.closed, "ROUND_CLOSED");
        require(!round.closeRequested, "ROUND_CLOSE_PENDING");

        euint32 crashMultiplierHandle = GameRandomnessLib.randomCrashMultiplierBps();
        round.crashMultiplierHandle = crashMultiplierHandle;
        round.closeRequested = true;
        _requestDecrypt(crashMultiplierHandle);

        emit RoundCloseRequested(roundId);
    }

    function finalizeRound(uint256 roundId) external nonReentrant whenNotPaused onlyResolver {
        Round storage round = rounds[roundId];
        require(round.exists, "UNKNOWN_ROUND");
        require(round.closeRequested, "ROUND_CLOSE_NOT_REQUESTED");
        require(!round.closed, "ROUND_CLOSED");

        (uint32 crashMultiplierBps, bool ready) = FHE.getDecryptResultSafe(round.crashMultiplierHandle);
        require(ready, "ROUND_PENDING");

        round.closed = true;
        round.crashMultiplierBps = crashMultiplierBps;

        emit RoundClosed(roundId, crashMultiplierBps);
    }

    function settleBet(uint256 roundId, address player) external nonReentrant whenNotPaused onlyResolver {
        Round storage round = rounds[roundId];
        PlayerBet storage bet = playerBets[roundId][player];

        require(round.closed, "ROUND_NOT_CLOSED");
        require(bet.exists, "UNKNOWN_BET");
        require(!bet.settled, "BET_SETTLED");

        bool won = bet.cashOutMultiplierBps < round.crashMultiplierBps;

        // Reuse the pre-encrypted cash-out multiplier stored at bet time - avoids fresh encryption cost
        euint128 grossNumerator = FHE.mul(bet.lockedHandle, bet.encCashOutBps);
        // The game must retain access to the intermediate gross numerator before the encrypted division.
        FHE.allowThis(grossNumerator);
        // Basis-point division keeps the gross return encrypted before house edge is applied.
        euint128 grossReturn = FHE.div(grossNumerator, ENCRYPTED_BPS_DENOMINATOR);
        euint128 winReturn = _applyHouseEdge(grossReturn);
        ebool encWon = FHE.asEbool(won);
        euint128 returnHandle = FHE.select(encWon, winReturn, ENCRYPTED_ZERO);

        // The vault needs access to consume the encrypted return during settlement.
        FHE.allow(returnHandle, address(vault));
        vault.settleBet(player, bet.lockedHandle, returnHandle);

        bet.settled = true;
        bet.won = won;

        emit CrashBetSettled(roundId, player, won);
    }

    function setResolver(address resolver, bool allowed) external onlyOwner {
        authorizedResolvers[resolver] = allowed;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _applyHouseEdge(euint128 grossReturn) internal returns (euint128) {
        // House edge is applied homomorphically so the gross and net return stay encrypted end to end.
        euint128 netNumerator = FHE.mul(grossReturn, ENCRYPTED_NET_PAYOUT_BPS);
        // The game must retain access to the intermediate numerator before the encrypted division.
        FHE.allowThis(netNumerator);
        // Final basis-point division keeps the payout encrypted until the vault later exposes it to the player.
        return FHE.div(netNumerator, ENCRYPTED_BPS_DENOMINATOR);
    }

    function _requestDecrypt(euint32 value) internal {
        ITaskManager(TASK_MANAGER_ADDRESS).createDecryptTask(uint256(bytes32(euint32.unwrap(value))), address(this));
    }
}
