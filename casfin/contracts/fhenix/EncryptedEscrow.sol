// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "../base/Ownable.sol";
import {Pausable} from "../base/Pausable.sol";
import {ReentrancyGuard} from "../base/ReentrancyGuard.sol";
import {Initializable} from "../base/Initializable.sol";
import {FHE, TASK_MANAGER_ADDRESS, euint128} from "@fhenixprotocol/cofhe-contracts/FHE.sol";
import {ITaskManager} from "@fhenixprotocol/cofhe-contracts/ICofhe.sol";

contract EncryptedEscrow is Ownable, Pausable, ReentrancyGuard, Initializable {
    struct PendingRelease {
        euint128 amount;
        bool exists;
    }

    mapping(address => bool) public authorizedMarkets;
    mapping(address => mapping(address => euint128)) private deposits;
    mapping(address => mapping(address => PendingRelease)) private pendingReleases;

    event MarketAuthorizationUpdated(address indexed market, bool allowed);
    event EscrowDeposited(address indexed market, address indexed player);
    event ReleaseRequested(address indexed market, address indexed player);
    event ReleaseFinalized(address indexed market, address indexed player);

    constructor() {
        _disableInitializers();
    }

    modifier onlyMarket() {
        require(authorizedMarkets[msg.sender], "NOT_MARKET");
        _;
    }

    function initialize(address initialOwner) external initializer {
        _initializeOwner(initialOwner);
    }

    function setMarketAuthorization(address market, bool allowed) external onlyOwner {
        require(market != address(0), "ZERO_MARKET");
        authorizedMarkets[market] = allowed;
        emit MarketAuthorizationUpdated(market, allowed);
    }

    function depositForMarket(address market) external payable nonReentrant whenNotPaused returns (euint128) {
        require(authorizedMarkets[market], "MARKET_NOT_AUTHORIZED");
        require(msg.value > 0, "ZERO_DEPOSIT");
        require(msg.value <= type(uint128).max, "DEPOSIT_TOO_LARGE");

        euint128 encryptedDeposit = FHE.asEuint128(msg.value);
        FHE.allowThis(encryptedDeposit);

        euint128 updatedBalance = FHE.add(deposits[market][msg.sender], encryptedDeposit);
        _storeDeposit(market, msg.sender, updatedBalance);

        emit EscrowDeposited(market, msg.sender);
        return updatedBalance;
    }

    function getEncryptedDeposit(address market) external view returns (euint128) {
        return deposits[market][msg.sender];
    }

    function requestRelease(address player) external onlyMarket whenNotPaused {
        require(player != address(0), "ZERO_PLAYER");
        PendingRelease storage pending = pendingReleases[msg.sender][player];
        require(!pending.exists, "RELEASE_PENDING");

        euint128 amount = deposits[msg.sender][player];
        pending.amount = amount;
        pending.exists = true;

        FHE.allowThis(amount);
        FHE.allowSender(amount);
        _requestDecrypt(amount);

        emit ReleaseRequested(msg.sender, player);
    }

    function finalizeRelease(address player) external onlyMarket whenNotPaused nonReentrant {
        require(player != address(0), "ZERO_PLAYER");
        PendingRelease storage pending = pendingReleases[msg.sender][player];
        require(pending.exists, "RELEASE_NOT_REQUESTED");

        (uint128 amount, bool ready) = FHE.getDecryptResultSafe(pending.amount);
        require(ready, "RELEASE_NOT_READY");

        delete pendingReleases[msg.sender][player];
        euint128 zeroValue = FHE.asEuint128(0);
        FHE.allowThis(zeroValue);
        _storeDeposit(msg.sender, player, zeroValue);

        if (amount == 0) {
            return;
        }

        require(address(this).balance >= amount, "INSUFFICIENT_BALANCE");
        (bool ok,) = player.call{value: amount}("");
        require(ok, "TRANSFER_FAILED");

        emit ReleaseFinalized(msg.sender, player);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _storeDeposit(address market, address player, euint128 value) internal {
        deposits[market][player] = value;
        FHE.allowThis(value);
        FHE.allow(value, player);
    }

    function _requestDecrypt(euint128 value) internal {
        ITaskManager(TASK_MANAGER_ADDRESS).createDecryptTask(uint256(bytes32(euint128.unwrap(value))), address(this));
    }

    receive() external payable {}
}
