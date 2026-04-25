// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "./base/Ownable.sol";
import {Pausable} from "./base/Pausable.sol";
import {Initializable} from "./base/Initializable.sol";
import {IStakingPool} from "./interfaces/IStakingPool.sol";

contract FeeDistributor is Ownable, Pausable, Initializable {
    uint16 private constant BPS_DENOMINATOR = 10_000;

    address public treasury;
    address public stakingPool;
    uint16 public stakingShareBps;

    event PlatformFeeRouted(address indexed sender, uint256 treasuryAmount, uint256 stakingAmount);
    event ResolverFeeRouted(address indexed resolver, uint256 amount);
    event StakingPoolUpdated(address indexed stakingPool, uint16 stakingShareBps);
    event TreasuryUpdated(address indexed treasury);

    constructor() {
        _disableInitializers();
    }

    function initialize(address initialOwner, address initialTreasury) external initializer {
        _initializeOwner(initialOwner);
        _setTreasury(initialTreasury);
    }

    function setTreasury(address newTreasury) external onlyOwner {
        _setTreasury(newTreasury);
    }

    function setStakingPool(address newStakingPool, uint16 newStakingShareBps) external onlyOwner {
        require(newStakingShareBps <= BPS_DENOMINATOR, "BAD_STAKING_SHARE");
        if (newStakingShareBps > 0) {
            require(newStakingPool != address(0), "ZERO_STAKING_POOL");
        }

        stakingPool = newStakingPool;
        stakingShareBps = newStakingShareBps;
        emit StakingPoolUpdated(newStakingPool, newStakingShareBps);
    }

    function routePlatformFee() external payable whenNotPaused {
        require(msg.value > 0, "ZERO_FEE");

        uint256 stakingAmount = 0;
        if (stakingPool != address(0) && stakingShareBps > 0) {
            stakingAmount = (msg.value * stakingShareBps) / BPS_DENOMINATOR;
            IStakingPool(stakingPool).notifyReward{value: stakingAmount}();
        }

        uint256 treasuryAmount = msg.value - stakingAmount;
        if (treasuryAmount > 0) {
            _sendValue(payable(treasury), treasuryAmount, "TREASURY_TRANSFER_FAILED");
        }

        emit PlatformFeeRouted(msg.sender, treasuryAmount, stakingAmount);
    }

    function routeResolverFee(address resolver) external payable whenNotPaused {
        require(resolver != address(0), "ZERO_RESOLVER");
        require(msg.value > 0, "ZERO_FEE");

        _sendValue(payable(resolver), msg.value, "RESOLVER_TRANSFER_FAILED");
        emit ResolverFeeRouted(resolver, msg.value);
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

    function _sendValue(address payable recipient, uint256 amount, string memory errorMessage) internal {
        (bool ok,) = recipient.call{value: amount}("");
        require(ok, errorMessage);
    }

    receive() external payable {}
}
