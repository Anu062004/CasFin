// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "../base/Ownable.sol";
import {Pausable} from "../base/Pausable.sol";
import {ReentrancyGuard} from "../base/ReentrancyGuard.sol";

contract CasinoVault is Ownable, Pausable, ReentrancyGuard {
    mapping(address => uint128) public balanceOf;
    mapping(address => uint128) public lockedBalanceOf;
    mapping(address => bool) public authorizedGames;

    event Deposited(address indexed player, uint256 amount);
    event HouseBankrollFunded(address indexed funder, uint256 amount);
    event GameAuthorizationUpdated(address indexed game, bool allowed);
    event FundsReserved(address indexed game, address indexed player, uint256 amount);
    event BetSettled(address indexed game, address indexed player, uint256 lockedAmount, uint256 returnAmount);
    event Withdrawn(address indexed player, uint256 amount);
    event EmergencyRelease(address indexed player, uint256 amount);

    constructor(address initialOwner) {
        _initializeOwner(initialOwner);
    }

    modifier onlyGame() {
        require(authorizedGames[msg.sender], "NOT_AUTHORIZED_GAME");
        _;
    }

    function deposit() external payable whenNotPaused nonReentrant {
        require(msg.value > 0, "ZERO_DEPOSIT");
        require(msg.value <= type(uint128).max, "DEPOSIT_TOO_LARGE");

        balanceOf[msg.sender] += uint128(msg.value);
        emit Deposited(msg.sender, msg.value);
    }

    function fundHouseBankroll() external payable onlyOwner whenNotPaused {
        require(msg.value > 0, "ZERO_DEPOSIT");
        emit HouseBankrollFunded(msg.sender, msg.value);
    }

    function authorizeGame(address game, bool allowed) external onlyOwner {
        require(game != address(0), "ZERO_GAME");
        authorizedGames[game] = allowed;
        emit GameAuthorizationUpdated(game, allowed);
    }

    function reserveFunds(address player, uint128 requestedAmount)
        external
        onlyGame
        whenNotPaused
        returns (uint128 actualReserved)
    {
        require(requestedAmount > 0, "ZERO_AMOUNT");
        uint128 availableBalance = balanceOf[player];
        require(availableBalance >= requestedAmount, "INSUFFICIENT_AVAILABLE_BALANCE");

        actualReserved = requestedAmount;
        balanceOf[player] = availableBalance - actualReserved;
        lockedBalanceOf[player] += actualReserved;

        emit FundsReserved(msg.sender, player, actualReserved);
    }

    function settleBet(address player, uint128 lockedAmount, uint128 returnAmount)
        external
        onlyGame
        whenNotPaused
        returns (uint128 updatedBalance)
    {
        uint128 lockedBalance = lockedBalanceOf[player];
        require(lockedBalance >= lockedAmount, "LOCKED_BALANCE_TOO_LOW");

        lockedBalanceOf[player] = lockedBalance - lockedAmount;
        updatedBalance = balanceOf[player] + returnAmount;
        balanceOf[player] = updatedBalance;

        emit BetSettled(msg.sender, player, lockedAmount, returnAmount);
    }

    function withdraw(uint128 requestedAmount) external nonReentrant whenNotPaused {
        require(requestedAmount > 0, "ZERO_WITHDRAW");

        uint128 availableBalance = balanceOf[msg.sender];
        require(availableBalance >= requestedAmount, "INSUFFICIENT_AVAILABLE_BALANCE");

        balanceOf[msg.sender] = availableBalance - requestedAmount;

        (bool ok,) = msg.sender.call{value: requestedAmount}("");
        require(ok, "WITHDRAW_TRANSFER_FAILED");

        emit Withdrawn(msg.sender, requestedAmount);
    }

    function emergencyRelease(address player) external onlyOwner whenPaused {
        require(player != address(0), "ZERO_PLAYER");
        uint128 lockedAmount = lockedBalanceOf[player];
        require(lockedAmount > 0, "NO_LOCKED_BALANCE");

        lockedBalanceOf[player] = 0;
        balanceOf[player] += lockedAmount;

        emit EmergencyRelease(player, lockedAmount);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    receive() external payable {}
}
