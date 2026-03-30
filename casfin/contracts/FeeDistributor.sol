// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "./base/Ownable.sol";
import {Pausable} from "./base/Pausable.sol";
import {Initializable} from "./base/Initializable.sol";
import {IStakingPool} from "./interfaces/IStakingPool.sol";

contract FeeDistributor is Ownable, Pausable, Initializable {
    address public treasury;
    address public stakingPool;
    uint16 public stakingShareBps;

    event TreasuryUpdated(address indexed treasury);
    event StakingPoolUpdated(address indexed stakingPool, uint16 stakingShareBps);
    event PlatformFeeRouted(address indexed treasury, uint256 treasuryAmount, uint256 stakingAmount);
    event ResolverFeeRouted(address indexed recipient, uint256 amount);

    constructor() {
        _disableInitializers();
    }

    function initialize(address initialOwner, address initialTreasury) external initializer {
        _initializeOwner(initialOwner);
        _setTreasury(initialTreasury);
    }

    function routePlatformFee() external payable whenNotPaused {
        require(msg.value > 0, "NO_VALUE");

        uint256 stakingAmount;
        if (stakingPool != address(0) && stakingShareBps > 0) {
            stakingAmount = (msg.value * stakingShareBps) / 10_000;
            IStakingPool(stakingPool).notifyReward{value: stakingAmount}();
        }

        uint256 treasuryAmount = msg.value - stakingAmount;
        (bool ok,) = treasury.call{value: treasuryAmount}("");
        require(ok, "TREASURY_TRANSFER_FAILED");
        emit PlatformFeeRouted(treasury, treasuryAmount, stakingAmount);
    }

    function routeResolverFee(address recipient) external payable whenNotPaused {
        require(recipient != address(0), "ZERO_RECIPIENT");
        require(msg.value > 0, "NO_VALUE");
        (bool ok,) = recipient.call{value: msg.value}("");
        require(ok, "RESOLVER_TRANSFER_FAILED");
        emit ResolverFeeRouted(recipient, msg.value);
    }

    function setTreasury(address newTreasury) external onlyOwner {
        _setTreasury(newTreasury);
    }

    function setStakingPool(address newStakingPool, uint16 newStakingShareBps) external onlyOwner {
        require(newStakingShareBps <= 10_000, "BAD_STAKING_SHARE");
        stakingPool = newStakingPool;
        stakingShareBps = newStakingShareBps;
        emit StakingPoolUpdated(newStakingPool, newStakingShareBps);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _setTreasury(address newTreasury) internal {
        require(newTreasury != address(0), "ZERO_TREASURY");
        treasury = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }
}
