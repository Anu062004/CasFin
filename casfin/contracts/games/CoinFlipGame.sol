// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CasinoGameBase} from "./CasinoGameBase.sol";

contract CoinFlipGame is CasinoGameBase {
    struct Bet {
        address player;
        uint128 lockedAmount;
        bool guessHeads;
        uint256 requestId;
        bool resolved;
        bool won;
    }

    uint256 public nextBetId;
    mapping(uint256 => Bet) public bets;

    event BetPlaced(uint256 indexed betId, address indexed player, uint256 indexed requestId, bool guessHeads);
    event BetResolved(uint256 indexed betId, address indexed player, bool won);

    constructor(
        address initialOwner,
        address vaultAddress,
        address randomnessRouterAddress,
        uint16 initialHouseEdgeBps,
        uint128 initialMaxBetAmount
    ) CasinoGameBase(initialOwner, vaultAddress, randomnessRouterAddress, initialHouseEdgeBps, initialMaxBetAmount) {}

    function placeBet(uint128 amount, bool guessHeads) external nonReentrant whenNotPaused returns (uint256 betId) {
        uint128 lockedAmount = _reserveStake(msg.sender, amount);
        uint256 requestId = _requestRandomness(keccak256("COIN_FLIP"));

        betId = nextBetId++;
        bets[betId] = Bet({
            player: msg.sender,
            lockedAmount: lockedAmount,
            guessHeads: guessHeads,
            requestId: requestId,
            resolved: false,
            won: false
        });

        emit BetPlaced(betId, msg.sender, requestId, guessHeads);
    }

    function resolveBet(uint256 betId) external nonReentrant whenNotPaused {
        Bet storage bet = bets[betId];
        require(bet.player != address(0), "UNKNOWN_BET");
        require(!bet.resolved, "BET_RESOLVED");

        (uint256 randomWord, bool ready) = randomnessRouter.getRandomness(bet.requestId);
        require(ready, "RANDOMNESS_PENDING");

        bool outcomeHeads = randomWord % 2 == 0;
        bool won = outcomeHeads == bet.guessHeads;
        uint128 returnAmount;

        if (won) {
            returnAmount = _applyHouseEdge(_toUint128(uint256(bet.lockedAmount) * 2));
        }

        _settle(bet.player, bet.lockedAmount, returnAmount);

        bet.resolved = true;
        bet.won = won;

        emit BetResolved(betId, bet.player, won);
    }
}
