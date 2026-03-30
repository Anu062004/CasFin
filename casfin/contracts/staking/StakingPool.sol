// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "../base/Ownable.sol";
import {Pausable} from "../base/Pausable.sol";
import {ReentrancyGuard} from "../base/ReentrancyGuard.sol";
import {CasinoToken} from "../token/CasinoToken.sol";
import {IStakingPool} from "../interfaces/IStakingPool.sol";

contract StakingPool is Ownable, Pausable, ReentrancyGuard, IStakingPool {
    uint256 public constant ACC_REWARD_PRECISION = 1e24;

    CasinoToken public immutable chips;
    uint256 public totalStaked;
    uint256 public accRewardPerShare;
    uint256 public queuedRewards;

    mapping(address => uint256) public stakedAmount;
    mapping(address => uint256) public rewardDebt;
    mapping(address => uint256) public pendingRewards;
    mapping(address => bool) public rewardNotifiers;

    event RewardNotifierUpdated(address indexed notifier, bool allowed);
    event Staked(address indexed account, uint256 amount);
    event Unstaked(address indexed account, uint256 amount);
    event RewardNotified(address indexed notifier, uint256 amount);
    event RewardsClaimed(address indexed account, uint256 amount);

    constructor(address initialOwner, address chipsAddress) {
        require(chipsAddress != address(0), "ZERO_CHIPS");
        _initializeOwner(initialOwner);
        chips = CasinoToken(chipsAddress);
        rewardNotifiers[initialOwner] = true;
        emit RewardNotifierUpdated(initialOwner, true);
    }

    modifier onlyNotifier() {
        require(rewardNotifiers[msg.sender], "NOT_NOTIFIER");
        _;
    }

    function setRewardNotifier(address notifier, bool allowed) external onlyOwner {
        rewardNotifiers[notifier] = allowed;
        emit RewardNotifierUpdated(notifier, allowed);
    }

    function stake(uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "ZERO_STAKE");
        _accrue(msg.sender);
        require(chips.transferFrom(msg.sender, address(this), amount), "STAKE_TRANSFER_FAILED");
        stakedAmount[msg.sender] += amount;
        totalStaked += amount;
        rewardDebt[msg.sender] = _cumulativeRewards(stakedAmount[msg.sender]);
        _distributeQueuedRewards();
        emit Staked(msg.sender, amount);
    }

    function unstake(uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "ZERO_UNSTAKE");
        require(stakedAmount[msg.sender] >= amount, "STAKE_TOO_LOW");
        _accrue(msg.sender);
        stakedAmount[msg.sender] -= amount;
        totalStaked -= amount;
        rewardDebt[msg.sender] = _cumulativeRewards(stakedAmount[msg.sender]);
        require(chips.transfer(msg.sender, amount), "UNSTAKE_TRANSFER_FAILED");
        emit Unstaked(msg.sender, amount);
    }

    function claimRewards() external nonReentrant whenNotPaused {
        _accrue(msg.sender);
        uint256 reward = pendingRewards[msg.sender];
        require(reward > 0, "NO_REWARD");
        pendingRewards[msg.sender] = 0;
        (bool ok,) = msg.sender.call{value: reward}("");
        require(ok, "REWARD_TRANSFER_FAILED");
        emit RewardsClaimed(msg.sender, reward);
    }

    function notifyReward() external payable onlyNotifier {
        require(msg.value > 0, "ZERO_REWARD");
        if (totalStaked == 0) {
            queuedRewards += msg.value;
        } else {
            accRewardPerShare += (msg.value * ACC_REWARD_PRECISION) / totalStaked;
        }
        emit RewardNotified(msg.sender, msg.value);
    }

    function pendingReward(address account) external view returns (uint256) {
        uint256 accrued = pendingRewards[account];
        uint256 staked = stakedAmount[account];
        if (staked == 0) {
            return accrued;
        }
        uint256 cumulative = _cumulativeRewards(staked);
        if (cumulative <= rewardDebt[account]) {
            return accrued;
        }
        return accrued + (cumulative - rewardDebt[account]);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _accrue(address account) internal {
        uint256 staked = stakedAmount[account];
        if (staked > 0) {
            uint256 cumulative = _cumulativeRewards(staked);
            uint256 debt = rewardDebt[account];
            if (cumulative > debt) {
                pendingRewards[account] += cumulative - debt;
            }
        }
        rewardDebt[account] = _cumulativeRewards(stakedAmount[account]);
    }

    function _distributeQueuedRewards() internal {
        if (queuedRewards > 0 && totalStaked > 0) {
            accRewardPerShare += (queuedRewards * ACC_REWARD_PRECISION) / totalStaked;
            queuedRewards = 0;
        }
    }

    function _cumulativeRewards(uint256 staked) internal view returns (uint256) {
        return (staked * accRewardPerShare) / ACC_REWARD_PRECISION;
    }

    receive() external payable {}
}
