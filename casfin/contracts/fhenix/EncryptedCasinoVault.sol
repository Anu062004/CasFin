// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "../base/Ownable.sol";
import {Pausable} from "../base/Pausable.sol";
import {ReentrancyGuard} from "../base/ReentrancyGuard.sol";
import {FHE, InEuint128, TASK_MANAGER_ADDRESS, ebool, euint128} from "@fhenixprotocol/cofhe-contracts/FHE.sol";
import {ITaskManager} from "@fhenixprotocol/cofhe-contracts/ICofhe.sol";

contract EncryptedCasinoVault is Ownable, Pausable, ReentrancyGuard {
    struct PendingWithdrawal {
        euint128 requestedAmount;
        bool exists;
    }

    mapping(address => euint128) private balances;
    mapping(address => euint128) private lockedBalances;
    mapping(address => PendingWithdrawal) private pendingWithdrawals;
    mapping(address => bool) public authorizedGames;

    // Session key delegation: sessionKey → player address (and expiry)
    mapping(address => address) public sessionKeyOwner;
    mapping(address => uint256) public sessionKeyExpiry;

    euint128 private ENCRYPTED_ZERO;
    euint128 private ENCRYPTED_MAX_BET;

    uint256 public totalDeposits;
    uint256 public minimumReserveWei;

    event Deposited(address indexed player);
    event BetSettled(address indexed player);
    event GameAuthorized(address indexed game, bool allowed);
    event HouseBankrollFunded(address indexed funder);
    event WithdrawalRequested(address indexed player);
    event Withdrawn(address indexed player);
    event MaxBetUpdated();
    event HouseFundsWithdrawn(address indexed to);
    event SessionKeyAuthorized(address indexed player, address indexed sessionKey, uint256 expiresAt);
    event SessionKeyRevoked(address indexed player, address indexed sessionKey);
    /// @notice Emitted when a withdrawal leaves the vault below the configured minimum reserve.
    event VaultLowBalance(uint256 remainingBalance, uint256 minimumReserve);
    /// @notice Emitted when the owner updates the vault minimum reserve requirement.
    event MinimumReserveUpdated(uint256 newMinimumReserveWei);

    constructor(address initialOwner) {
        _initializeOwner(initialOwner);
        minimumReserveWei = 0.5 ether;

        // The vault reuses encrypted zero across insufficient-balance selects and async withdrawals.
        ENCRYPTED_ZERO = FHE.asEuint128(0);
        // The vault must retain access to this constant because it is reused in later FHE operations.
        FHE.allowThis(ENCRYPTED_ZERO);
        // Default max bet: 0.25 ETH in wei
        ENCRYPTED_MAX_BET = FHE.asEuint128(0.25 ether);
        // The vault must retain access to this stored encrypted limit for later reserve checks.
        FHE.allowThis(ENCRYPTED_MAX_BET);
    }

    modifier onlyGame() {
        require(authorizedGames[msg.sender], "NOT_AUTHORIZED_GAME");
        _;
    }

    /// @notice Returns the player address for a given caller, resolving session key delegation.
    function resolvePlayer(address caller) public view returns (address) {
        address owner = sessionKeyOwner[caller];
        if (owner != address(0) && block.timestamp <= sessionKeyExpiry[caller]) {
            return owner;
        }
        return caller;
    }

    /// @notice Authorize a session key to act on behalf of msg.sender for game transactions.
    /// @param sessionKey The ephemeral wallet address to authorize.
    /// @param durationSeconds How long the session should last (max 86400 = 24 hours).
    function authorizeSessionKey(address sessionKey, uint256 durationSeconds) external whenNotPaused {
        require(sessionKeyOwner[msg.sender] == address(0), "SESSION_KEY_CANNOT_DELEGATE");
        require(sessionKey != address(0), "ZERO_SESSION_KEY");
        require(sessionKey != msg.sender, "CANNOT_SELF_DELEGATE");
        require(durationSeconds > 0 && durationSeconds <= 86400, "BAD_DURATION");
        sessionKeyOwner[sessionKey] = msg.sender;
        sessionKeyExpiry[sessionKey] = block.timestamp + durationSeconds;
        emit SessionKeyAuthorized(msg.sender, sessionKey, block.timestamp + durationSeconds);
    }

    /// @notice Revoke a session key. Can be called by the player or the session key itself.
    function revokeSessionKey(address sessionKey) external {
        address player = sessionKeyOwner[sessionKey];
        require(player == msg.sender || sessionKey == msg.sender, "NOT_AUTHORIZED");
        delete sessionKeyOwner[sessionKey];
        delete sessionKeyExpiry[sessionKey];
        emit SessionKeyRevoked(player, sessionKey);
    }

    function depositETH() external payable whenNotPaused nonReentrant {
        require(sessionKeyOwner[msg.sender] == address(0), "SESSION_KEY_CANNOT_DEPOSIT");
        require(msg.value > 0, "ZERO_DEPOSIT");
        require(msg.value <= type(uint128).max, "DEPOSIT_TOO_LARGE");

        // The deposit enters the encrypted domain immediately so the vault never stores a plaintext player balance.
        euint128 encryptedDeposit = FHE.asEuint128(msg.value);
        // The new balance is computed homomorphically from the prior encrypted balance and the encrypted deposit.
        euint128 updatedBalance = FHE.add(balances[msg.sender], encryptedDeposit);

        _storeBalance(msg.sender, updatedBalance);

        totalDeposits += msg.value;
        emit Deposited(msg.sender);
    }

    function fundHouseBankroll() external payable onlyOwner {
        require(msg.value > 0, "ZERO_DEPOSIT");
        emit HouseBankrollFunded(msg.sender);
    }

    function getEncryptedBalance() external view returns (euint128) {
        return balances[resolvePlayer(msg.sender)];
    }

    function getEncryptedLockedBalance() external view returns (euint128) {
        return lockedBalances[resolvePlayer(msg.sender)];
    }

    function getPendingWithdrawal() external view returns (euint128 amountHandle, bool exists) {
        PendingWithdrawal storage pending = pendingWithdrawals[resolvePlayer(msg.sender)];
        return (pending.requestedAmount, pending.exists);
    }

    function reserveFunds(address player, euint128 encAmount)
        external
        onlyGame
        whenNotPaused
        returns (euint128 lockedHandle)
    {
        require(player != address(0), "ZERO_PLAYER");

        // Check player has sufficient balance (encrypted comparison, no plaintext branch)
        ebool hasEnoughBalance = FHE.gte(balances[player], encAmount);
        // Check the bet does not exceed the encrypted maximum stake cap
        ebool withinMaxBet = FHE.lte(encAmount, ENCRYPTED_MAX_BET);
        // Only reserve funds when BOTH conditions are satisfied - prevents vault insolvency
        ebool canReserve = FHE.and(hasEnoughBalance, withinMaxBet);
        lockedHandle = FHE.select(canReserve, encAmount, ENCRYPTED_ZERO);
        // The available balance decreases by the encrypted amount that was actually locked.
        euint128 updatedBalance = FHE.sub(balances[player], lockedHandle);
        // Locked balance is tracked homomorphically so settlement can release only previously reserved funds.
        euint128 updatedLockedBalance = FHE.add(lockedBalances[player], lockedHandle);

        _storeBalance(player, updatedBalance);
        _storeLockedBalance(player, updatedLockedBalance);

        // The calling game must decrypt or reuse the returned handle in later settlement logic.
        FHE.allow(lockedHandle, msg.sender);
        return lockedHandle;
    }

    function settleBet(address player, euint128 lockedHandle, euint128 returnHandle) external onlyGame whenNotPaused {
        require(player != address(0), "ZERO_PLAYER");

        // Settlement verifies the game is only releasing encrypted funds that the vault still has locked.
        ebool canSettle = FHE.gte(lockedBalances[player], lockedHandle);
        // If the encrypted lock is valid, release it; otherwise release zero and preserve balances.
        euint128 releasedLock = FHE.select(canSettle, lockedHandle, ENCRYPTED_ZERO);
        // If the encrypted lock is invalid, the credited return is forced to zero as well.
        euint128 creditedReturn = FHE.select(canSettle, returnHandle, ENCRYPTED_ZERO);
        // The locked balance decreases only by the encrypted amount actually released.
        euint128 updatedLockedBalance = FHE.sub(lockedBalances[player], releasedLock);
        // The player balance increases by the encrypted return chosen by the settlement select.
        euint128 updatedBalance = FHE.add(balances[player], creditedReturn);

        _storeLockedBalance(player, updatedLockedBalance);
        _storeBalance(player, updatedBalance);

        emit BetSettled(player);
    }

    function withdrawETH(InEuint128 calldata encAmount) external nonReentrant whenNotPaused {
        require(sessionKeyOwner[msg.sender] == address(0), "SESSION_KEY_CANNOT_WITHDRAW");
        PendingWithdrawal storage pending = pendingWithdrawals[msg.sender];

        if (pending.exists) {
            _finalizeWithdrawal(msg.sender, pending);
            return;
        }

        // The user-supplied encrypted request is verified by the FHE runtime before the vault consumes it.
        euint128 requestedAmount = FHE.asEuint128(encAmount);
        // Withdrawals keep the balance check encrypted so an overdraw request resolves to an encrypted zero.
        ebool canWithdraw = FHE.gte(balances[msg.sender], requestedAmount);
        // The vault only queues the encrypted amount that the player can actually withdraw.
        euint128 actualWithdrawal = FHE.select(canWithdraw, requestedAmount, ENCRYPTED_ZERO);
        // The spendable balance is reduced immediately so pending withdrawals cannot be double-spent.
        euint128 updatedBalance = FHE.sub(balances[msg.sender], actualWithdrawal);

        _storeBalance(msg.sender, updatedBalance);

        pending.requestedAmount = actualWithdrawal;
        pending.exists = true;

        // The vault stores the pending handle and must keep access so it can finalize the withdrawal later.
        FHE.allowThis(actualWithdrawal);
        // The player also needs access because the async decrypt task is requested on their behalf.
        FHE.allowSender(actualWithdrawal);

        _requestDecrypt(actualWithdrawal);

        emit WithdrawalRequested(msg.sender);
    }

    function authorizeGame(address game, bool allowed) external onlyOwner {
        require(game != address(0), "ZERO_GAME");
        authorizedGames[game] = allowed;
        emit GameAuthorized(game, allowed);
    }

    function setMaxBet(uint128 newMaxBetWei) external onlyOwner {
        require(newMaxBetWei > 0, "ZERO_MAX_BET");
        // The vault must retain access to the updated encrypted limit for later reserve checks.
        ENCRYPTED_MAX_BET = FHE.asEuint128(newMaxBetWei);
        FHE.allowThis(ENCRYPTED_MAX_BET);
        emit MaxBetUpdated();
    }

    /// @notice Updates the minimum plaintext ETH reserve the vault must retain before pausing.
    /// @param newMinimumReserveWei New reserve floor denominated in wei.
    function setMinimumReserve(uint256 newMinimumReserveWei) external onlyOwner {
        minimumReserveWei = newMinimumReserveWei;
        emit MinimumReserveUpdated(newMinimumReserveWei);
    }

    function withdrawHouseFunds(uint256 amount) external onlyOwner nonReentrant {
        require(amount > 0, "ZERO_AMOUNT");
        require(address(this).balance >= amount, "INSUFFICIENT_BALANCE");
        require(address(this).balance - amount >= minimumReserveWei, "WOULD_BREACH_MINIMUM_RESERVE");

        (bool ok,) = owner.call{value: amount}("");
        require(ok, "TRANSFER_FAILED");

        emit HouseFundsWithdrawn(owner);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _storeBalance(address player, euint128 value) internal {
        balances[player] = value;

        // The vault must retain access to every stored encrypted balance for future reserve and settlement flows.
        FHE.allowThis(value);
        // The player must retain access to their stored encrypted balance for frontend decryption and withdrawals.
        FHE.allow(value, player);
    }

    function _storeLockedBalance(address player, euint128 value) internal {
        lockedBalances[player] = value;

        // The vault must retain access to every stored encrypted lock for later settlement.
        FHE.allowThis(value);
        // The player keeps access so the frontend can display locked balance handles too.
        FHE.allow(value, player);
    }

    function _requestDecrypt(euint128 value) internal {
        ITaskManager(TASK_MANAGER_ADDRESS).createDecryptTask(uint256(bytes32(euint128.unwrap(value))), address(this));
    }

    function _finalizeWithdrawal(address player, PendingWithdrawal storage pending) internal {
        // The result stays inside the safe getter so a not-yet-ready decryption does not corrupt vault state.
        (uint128 plaintextAmount, bool ready) = FHE.getDecryptResultSafe(pending.requestedAmount);
        require(ready, "WITHDRAWAL_PENDING");

        delete pendingWithdrawals[player];

        if (plaintextAmount == 0) {
            return;
        }

        require(address(this).balance >= plaintextAmount, "INSUFFICIENT_VAULT_ETH");

        (bool ok,) = player.call{value: plaintextAmount}("");
        require(ok, "WITHDRAW_TRANSFER_FAILED");

        emit Withdrawn(player);

        if (address(this).balance < minimumReserveWei) {
            _pause();
            emit VaultLowBalance(address(this).balance, minimumReserveWei);
        }
    }

    receive() external payable {}
}
