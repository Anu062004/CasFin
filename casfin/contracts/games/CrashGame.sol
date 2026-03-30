// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MathLib} from "../libraries/MathLib.sol";
import {CasinoGameBase} from "./CasinoGameBase.sol";

contract CrashGame is CasinoGameBase {
    struct Round {
        bool exists;
        uint256 requestId;
        uint32 crashMultiplierBps;
        bool closed;
    }

    struct PlayerBet {
        uint128 lockedAmount;
        uint32 cashOutMultiplierBps;
        bool exists;
        bool settled;
        bool won;
    }

    uint32 public constant MIN_CASHOUT_BPS = 11_000;
    uint32 public maxCashOutMultiplierBps = 50_000;
    uint256 public nextRoundId;

    mapping(uint256 => Round) public rounds;
    mapping(uint256 => mapping(address => PlayerBet)) public playerBets;

    event RoundStarted(uint256 indexed roundId, uint256 indexed requestId);
    event RoundClosed(uint256 indexed roundId, uint32 crashMultiplierBps);
    event CrashBetPlaced(uint256 indexed roundId, address indexed player, uint32 cashOutMultiplierBps);
    event CrashBetSettled(uint256 indexed roundId, address indexed player, bool won);
    event MaxCashOutUpdated(uint32 maxCashOutMultiplierBps);

    constructor(
        address initialOwner,
        address vaultAddress,
        address randomnessRouterAddress,
        uint16 initialHouseEdgeBps,
        uint128 initialMaxBetAmount
    ) CasinoGameBase(initialOwner, vaultAddress, randomnessRouterAddress, initialHouseEdgeBps, initialMaxBetAmount) {}

    function setMaxCashOutMultiplierBps(uint32 newMaxCashOutMultiplierBps) external onlyOwner {
        require(newMaxCashOutMultiplierBps >= MIN_CASHOUT_BPS, "BAD_MAX_CASHOUT");
        maxCashOutMultiplierBps = newMaxCashOutMultiplierBps;
        emit MaxCashOutUpdated(newMaxCashOutMultiplierBps);
    }

    function startRound() external onlyOwner whenNotPaused returns (uint256 roundId) {
        roundId = nextRoundId++;
        uint256 requestId = _requestRandomness(keccak256(abi.encodePacked("CRASH", roundId)));

        rounds[roundId] = Round({exists: true, requestId: requestId, crashMultiplierBps: 0, closed: false});
        emit RoundStarted(roundId, requestId);
    }

    function placeBet(uint256 roundId, uint128 amount, uint32 cashOutMultiplierBps) external nonReentrant whenNotPaused {
        Round storage round = rounds[roundId];
        require(round.exists, "UNKNOWN_ROUND");
        require(!round.closed, "ROUND_CLOSED");
        require(cashOutMultiplierBps >= MIN_CASHOUT_BPS, "BAD_CASHOUT");
        require(cashOutMultiplierBps <= maxCashOutMultiplierBps, "CASHOUT_TOO_HIGH");
        require(!playerBets[roundId][msg.sender].exists, "BET_EXISTS");

        uint128 lockedAmount = _reserveStake(msg.sender, amount);
        playerBets[roundId][msg.sender] = PlayerBet({
            lockedAmount: lockedAmount,
            cashOutMultiplierBps: cashOutMultiplierBps,
            exists: true,
            settled: false,
            won: false
        });

        emit CrashBetPlaced(roundId, msg.sender, cashOutMultiplierBps);
    }

    function closeRound(uint256 roundId) external whenNotPaused {
        Round storage round = rounds[roundId];
        require(round.exists, "UNKNOWN_ROUND");
        require(!round.closed, "ROUND_CLOSED");

        (uint256 randomWord, bool ready) = randomnessRouter.getRandomness(round.requestId);
        require(ready, "RANDOMNESS_PENDING");

        round.closed = true;
        round.crashMultiplierBps = _deriveCrashMultiplier(randomWord);

        emit RoundClosed(roundId, round.crashMultiplierBps);
    }

    function settleBet(uint256 roundId, address player) external nonReentrant whenNotPaused {
        Round storage round = rounds[roundId];
        PlayerBet storage bet = playerBets[roundId][player];

        require(round.closed, "ROUND_NOT_CLOSED");
        require(bet.exists, "UNKNOWN_BET");
        require(!bet.settled, "BET_SETTLED");

        bool won = bet.cashOutMultiplierBps < round.crashMultiplierBps;
        uint128 returnAmount;

        if (won) {
            uint128 grossReturn = _toUint128(
                MathLib.mulDiv(uint256(bet.lockedAmount), bet.cashOutMultiplierBps, MathLib.BPS_DENOMINATOR)
            );
            returnAmount = _applyHouseEdge(grossReturn);
        }

        _settle(player, bet.lockedAmount, returnAmount);

        bet.settled = true;
        bet.won = won;

        emit CrashBetSettled(roundId, player, won);
    }

    function _deriveCrashMultiplier(uint256 randomWord) internal pure returns (uint32) {
        if (randomWord % 25 == 0) {
            return 10_000;
        }

        return uint32(10_000 + (((randomWord % 900) + 1) * 100));
    }
}
