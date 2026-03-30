// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CasinoGameBase} from "./CasinoGameBase.sol";

contract DiceGame is CasinoGameBase {
    struct Bet {
        address player;
        uint128 lockedAmount;
        uint8 guess;
        uint256 requestId;
        bool resolved;
        uint8 rolled;
        bool won;
    }

    uint256 public nextBetId;
    mapping(uint256 => Bet) public bets;

    event BetPlaced(uint256 indexed betId, address indexed player, uint256 indexed requestId, uint8 guess);
    event BetResolved(uint256 indexed betId, address indexed player, uint8 rolled, bool won);

    constructor(
        address initialOwner,
        address vaultAddress,
        address randomnessRouterAddress,
        uint16 initialHouseEdgeBps,
        uint128 initialMaxBetAmount
    ) CasinoGameBase(initialOwner, vaultAddress, randomnessRouterAddress, initialHouseEdgeBps, initialMaxBetAmount) {}

    function placeBet(uint128 amount, uint8 guess) external nonReentrant whenNotPaused returns (uint256 betId) {
        require(guess >= 1 && guess <= 6, "BAD_GUESS");

        uint128 lockedAmount = _reserveStake(msg.sender, amount);
        uint256 requestId = _requestRandomness(keccak256("DICE"));

        betId = nextBetId++;
        bets[betId] = Bet({
            player: msg.sender,
            lockedAmount: lockedAmount,
            guess: guess,
            requestId: requestId,
            resolved: false,
            rolled: 0,
            won: false
        });

        emit BetPlaced(betId, msg.sender, requestId, guess);
    }

    function resolveBet(uint256 betId) external nonReentrant whenNotPaused {
        Bet storage bet = bets[betId];
        require(bet.player != address(0), "UNKNOWN_BET");
        require(!bet.resolved, "BET_RESOLVED");

        (uint256 randomWord, bool ready) = randomnessRouter.getRandomness(bet.requestId);
        require(ready, "RANDOMNESS_PENDING");

        uint8 rolled = uint8(randomWord % 6) + 1;
        bool won = rolled == bet.guess;
        uint128 returnAmount;

        if (won) {
            returnAmount = _applyHouseEdge(_toUint128(uint256(bet.lockedAmount) * 6));
        }

        _settle(bet.player, bet.lockedAmount, returnAmount);

        bet.resolved = true;
        bet.rolled = rolled;
        bet.won = won;

        emit BetResolved(betId, bet.player, rolled, won);
    }
}
