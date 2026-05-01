// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "../base/Ownable.sol";
import {Pausable} from "../base/Pausable.sol";
import {ReentrancyGuard} from "../base/ReentrancyGuard.sol";
import {MathLib} from "../libraries/MathLib.sol";
import {IEncryptedCasinoVault} from "./IEncryptedCasinoVault.sol";
import {GameRandomnessLib} from "./GameRandomness.sol";
import {FHE, InEuint128, InEuint8, TASK_MANAGER_ADDRESS, ebool, euint8, euint128} from "@fhenixprotocol/cofhe-contracts/FHE.sol";
import {ITaskManager} from "@fhenixprotocol/cofhe-contracts/ICofhe.sol";

contract EncryptedDiceGame is Ownable, Pausable, ReentrancyGuard {
    struct EncryptedBet {
        address player;
        euint128 lockedHandle;
        euint8 encGuess;
        euint8 rolledHandle;
        bool resolved;
        bool resolutionPending;
        ebool pendingWonFlag;
        bool won;
        uint8 rolled;
    }

    IEncryptedCasinoVault public immutable vault;
    uint16 public immutable houseEdgeBps;

    uint256 public nextBetId;
    mapping(uint256 => EncryptedBet) public bets;
    mapping(address => bool) public authorizedResolvers;

    euint128 private ENCRYPTED_ZERO;
    euint128 private ENCRYPTED_SIX;
    euint128 private ENCRYPTED_BPS_DENOMINATOR;
    euint128 private ENCRYPTED_NET_PAYOUT_BPS;

    event EncryptedDiceBetPlaced(uint256 indexed betId, address indexed player);
    event ResolutionRequested(uint256 indexed betId, address indexed player);
    event EncryptedDiceBetResolved(uint256 indexed betId, address indexed player, uint8 rolled, bool won);

    constructor(address initialOwner, address vaultAddress, uint16 initialHouseEdgeBps) {
        require(vaultAddress != address(0), "ZERO_VAULT");
        require(initialHouseEdgeBps < MathLib.BPS_DENOMINATOR, "BAD_HOUSE_EDGE");

        _initializeOwner(initialOwner);
        vault = IEncryptedCasinoVault(vaultAddress);
        houseEdgeBps = initialHouseEdgeBps;

        // Dice reuses encrypted zero for failed reserves and losing payouts.
        ENCRYPTED_ZERO = FHE.asEuint128(0);
        // The game keeps access because this constant is reused across multiple FHE branches.
        FHE.allowThis(ENCRYPTED_ZERO);
        // Dice pays 6x gross on a correct face before house edge.
        ENCRYPTED_SIX = FHE.asEuint128(6);
        // The game keeps access because the multiplier is reused in every resolution.
        FHE.allowThis(ENCRYPTED_SIX);
        // Basis-point division stays encrypted so house edge math never reveals stake size.
        ENCRYPTED_BPS_DENOMINATOR = FHE.asEuint128(MathLib.BPS_DENOMINATOR);
        // The game keeps access because the denominator is reused in every payout calculation.
        FHE.allowThis(ENCRYPTED_BPS_DENOMINATOR);
        // The encrypted net payout factor avoids recomputing a plaintext-to-encrypted conversion on every resolve.
        ENCRYPTED_NET_PAYOUT_BPS = FHE.asEuint128(MathLib.BPS_DENOMINATOR - initialHouseEdgeBps);
        // The game keeps access because the payout factor is reused in every resolution.
        FHE.allowThis(ENCRYPTED_NET_PAYOUT_BPS);
    }

    modifier onlyResolver() {
        require(authorizedResolvers[msg.sender] || msg.sender == owner, "NOT_RESOLVER");
        _;
    }

    function placeBet(InEuint128 calldata encAmount, InEuint8 calldata encGuess)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 betId)
    {
        // The guess is verified to be in range [1,6] homomorphically - no plaintext check needed
        euint8 requestedGuess = FHE.asEuint8(encGuess);
        euint8 one = FHE.asEuint8(1);
        FHE.allowThis(one);
        euint8 six = FHE.asEuint8(6);
        FHE.allowThis(six);
        ebool guessAbove0 = FHE.gte(requestedGuess, one);
        FHE.allowThis(guessAbove0);
        ebool guessBelow7 = FHE.lte(requestedGuess, six);
        FHE.allowThis(guessBelow7);
        // Safe guess: out-of-range inputs collapse to 1 (valid auto-correction)
        ebool validGuess = FHE.and(guessAbove0, guessBelow7);
        FHE.allowThis(validGuess);
        // The encrypted range check chooses the stored guess without revealing whether correction was needed.
        euint8 safeGuess = FHE.select(validGuess, requestedGuess, one);
        // The game must retain access to the encrypted guess for later resolution
        FHE.allowThis(safeGuess);

        // The user's encrypted input is verified by the FHE runtime before the game forwards it to the vault.
        euint128 requestedAmount = FHE.asEuint128(encAmount);
        // The vault needs access to consume the encrypted amount during reserveFunds.
        FHE.allow(requestedAmount, address(vault));
        euint8 rolledHandle = GameRandomnessLib.randomDiceRoll();

        address player = vault.resolvePlayer(msg.sender);
        euint128 lockedHandle = vault.reserveFunds(player, requestedAmount);

        betId = nextBetId++;
        bets[betId] = EncryptedBet({
            player: player,
            lockedHandle: lockedHandle,
            encGuess: safeGuess,
            rolledHandle: rolledHandle,
            resolved: false,
            resolutionPending: false,
            // WARNING: Zero-handle - must never be read via FHE.getDecryptResultSafe
            // unless resolutionPending is true. The guard in finalizeResolution enforces this.
            pendingWonFlag: ebool.wrap(bytes32(0)),
            won: false,
            rolled: 0
        });

        // The game must retain access to the stored encrypted stake for later payout settlement.
        FHE.allowThis(lockedHandle);

        emit EncryptedDiceBetPlaced(betId, msg.sender);
    }

    function requestResolution(uint256 betId) external nonReentrant whenNotPaused onlyResolver {
        EncryptedBet storage bet = bets[betId];
        require(bet.player != address(0), "UNKNOWN_BET");
        require(!bet.resolved, "BET_RESOLVED");
        require(!bet.resolutionPending, "RESOLUTION_PENDING");

        ebool encWonFlag = FHE.eq(bet.encGuess, bet.rolledHandle);
        FHE.allowThis(encWonFlag);
        bet.pendingWonFlag = encWonFlag;
        bet.resolutionPending = true;
        _requestDecrypt(encWonFlag);
        _requestDecrypt(bet.rolledHandle);

        emit ResolutionRequested(betId, bet.player);
    }

    function finalizeResolution(uint256 betId) external nonReentrant whenNotPaused onlyResolver {
        EncryptedBet storage bet = bets[betId];
        require(bet.player != address(0), "UNKNOWN_BET");
        require(!bet.resolved, "BET_RESOLVED");
        require(bet.resolutionPending, "RESOLUTION_NOT_REQUESTED");

        // The contract retrieves the decrypted win flag only after the earlier decrypt task has completed.
        (bool won, bool decrypted) = FHE.getDecryptResultSafe(bet.pendingWonFlag);
        require(decrypted, "WIN_FLAG_PENDING");
        (uint8 rolled, bool rollReady) = FHE.getDecryptResultSafe(bet.rolledHandle);
        require(rollReady, "ROLL_PENDING");

        // Winning returns start from the encrypted 6x gross payout.
        euint128 grossReturn = FHE.mul(bet.lockedHandle, ENCRYPTED_SIX);
        // The game must retain access to the intermediate gross payout before applying house edge.
        FHE.allowThis(grossReturn);
        euint128 winReturn = _applyHouseEdge(grossReturn);
        // won is plaintext from getDecryptResultSafe — use a direct ternary, not FHE.select.
        euint128 returnHandle = won ? winReturn : ENCRYPTED_ZERO;

        // The vault needs access to consume the encrypted return during settlement.
        FHE.allow(returnHandle, address(vault));
        vault.settleBet(bet.player, bet.lockedHandle, returnHandle);

        bet.resolved = true;
        bet.resolutionPending = false;
        bet.won = won;
        bet.rolled = rolled;

        emit EncryptedDiceBetResolved(betId, bet.player, rolled, won);
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

    function _requestDecrypt(ebool value) internal {
        // The CoFHE runtime needs an explicit decrypt task so the result can be fetched in a later transaction.
        ITaskManager(TASK_MANAGER_ADDRESS).createDecryptTask(uint256(bytes32(ebool.unwrap(value))), address(this));
    }

    function _requestDecrypt(euint8 value) internal {
        ITaskManager(TASK_MANAGER_ADDRESS).createDecryptTask(uint256(bytes32(euint8.unwrap(value))), address(this));
    }
}
