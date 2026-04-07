// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IGameRandomness} from "../interfaces/IGameRandomness.sol";
import {FHE, TASK_MANAGER_ADDRESS, ebool, euint8, euint32} from "@fhenixprotocol/cofhe-contracts/FHE.sol";
import {ITaskManager} from "@fhenixprotocol/cofhe-contracts/ICofhe.sol";

library GameRandomnessLib {
    function randomCoinFlip() internal returns (ebool outcome) {
        euint8 randomValue = FHE.randomEuint8();
        FHE.allowThis(randomValue);

        euint8 one = FHE.asEuint8(1);
        FHE.allowThis(one);

        euint8 masked = FHE.and(randomValue, one);
        FHE.allowThis(masked);

        outcome = FHE.asEbool(masked);
        FHE.allowThis(outcome);
    }

    function randomDiceRoll() internal returns (euint8 roll) {
        euint8 randomValue = FHE.randomEuint8();
        FHE.allowThis(randomValue);

        euint8 six = FHE.asEuint8(6);
        FHE.allowThis(six);
        euint8 one = FHE.asEuint8(1);
        FHE.allowThis(one);

        euint8 bounded = FHE.rem(randomValue, six);
        FHE.allowThis(bounded);

        roll = FHE.add(bounded, one);
        FHE.allowThis(roll);
    }

    function randomCardIndex() internal returns (euint8 card) {
        euint8 randomValue = FHE.randomEuint8();
        FHE.allowThis(randomValue);

        euint8 fiftyTwo = FHE.asEuint8(52);
        FHE.allowThis(fiftyTwo);

        card = FHE.rem(randomValue, fiftyTwo);
        FHE.allowThis(card);
    }

    function randomStatRoll() internal returns (euint8 stat) {
        euint8 randomValue = FHE.randomEuint8();
        FHE.allowThis(randomValue);

        euint8 twenty = FHE.asEuint8(20);
        FHE.allowThis(twenty);
        euint8 one = FHE.asEuint8(1);
        FHE.allowThis(one);

        euint8 bounded = FHE.rem(randomValue, twenty);
        FHE.allowThis(bounded);

        stat = FHE.add(bounded, one);
        FHE.allowThis(stat);
    }

    function randomLootTier() internal returns (euint8 tier) {
        euint8 randomValue = FHE.randomEuint8();
        FHE.allowThis(randomValue);

        euint8 hundred = FHE.asEuint8(100);
        FHE.allowThis(hundred);
        euint8 sixty = FHE.asEuint8(60);
        FHE.allowThis(sixty);
        euint8 eightyFive = FHE.asEuint8(85);
        FHE.allowThis(eightyFive);
        euint8 ninetyFive = FHE.asEuint8(95);
        FHE.allowThis(ninetyFive);
        euint8 ninetyNine = FHE.asEuint8(99);
        FHE.allowThis(ninetyNine);

        euint8 commonTier = FHE.asEuint8(0);
        FHE.allowThis(commonTier);
        euint8 uncommonTier = FHE.asEuint8(1);
        FHE.allowThis(uncommonTier);
        euint8 rareTier = FHE.asEuint8(2);
        FHE.allowThis(rareTier);
        euint8 epicTier = FHE.asEuint8(3);
        FHE.allowThis(epicTier);
        euint8 legendaryTier = FHE.asEuint8(4);
        FHE.allowThis(legendaryTier);

        euint8 bounded = FHE.rem(randomValue, hundred);
        FHE.allowThis(bounded);

        ebool isCommon = FHE.lt(bounded, sixty);
        FHE.allowThis(isCommon);
        ebool isUncommon = FHE.lt(bounded, eightyFive);
        FHE.allowThis(isUncommon);
        ebool isRare = FHE.lt(bounded, ninetyFive);
        FHE.allowThis(isRare);
        ebool isEpic = FHE.lt(bounded, ninetyNine);
        FHE.allowThis(isEpic);

        euint8 epicOrLegendary = FHE.select(isEpic, epicTier, legendaryTier);
        FHE.allowThis(epicOrLegendary);
        euint8 rareOrBetter = FHE.select(isRare, rareTier, epicOrLegendary);
        FHE.allowThis(rareOrBetter);
        euint8 uncommonOrBetter = FHE.select(isUncommon, uncommonTier, rareOrBetter);
        FHE.allowThis(uncommonOrBetter);

        tier = FHE.select(isCommon, commonTier, uncommonOrBetter);
        FHE.allowThis(tier);
    }

    function randomBoardTile() internal returns (euint8 tile) {
        euint8 randomValue = FHE.randomEuint8();
        FHE.allowThis(randomValue);

        euint8 four = FHE.asEuint8(4);
        FHE.allowThis(four);

        tile = FHE.rem(randomValue, four);
        FHE.allowThis(tile);
    }

    function randomWinnerIndex(uint256 playerCount) internal returns (euint32 winnerIndex) {
        euint32 randomValue = FHE.randomEuint32();
        FHE.allowThis(randomValue);

        euint32 boundedPlayerCount = FHE.asEuint32(playerCount);
        FHE.allowThis(boundedPlayerCount);

        winnerIndex = FHE.rem(randomValue, boundedPlayerCount);
        FHE.allowThis(winnerIndex);
    }

    function randomCrashMultiplierBps() internal returns (euint32 multiplierBps) {
        euint32 randomValue = FHE.randomEuint32();
        FHE.allowThis(randomValue);

        euint32 zero = FHE.asEuint32(0);
        FHE.allowThis(zero);
        euint32 one = FHE.asEuint32(1);
        FHE.allowThis(one);
        euint32 twentyFive = FHE.asEuint32(25);
        FHE.allowThis(twentyFive);
        euint32 nineHundred = FHE.asEuint32(900);
        FHE.allowThis(nineHundred);
        euint32 oneHundred = FHE.asEuint32(100);
        FHE.allowThis(oneHundred);
        euint32 tenThousand = FHE.asEuint32(10_000);
        FHE.allowThis(tenThousand);

        euint32 modTwentyFive = FHE.rem(randomValue, twentyFive);
        FHE.allowThis(modTwentyFive);
        ebool isInstantCrash = FHE.eq(modTwentyFive, zero);
        FHE.allowThis(isInstantCrash);

        euint32 modNineHundred = FHE.rem(randomValue, nineHundred);
        FHE.allowThis(modNineHundred);
        euint32 bounded = FHE.add(modNineHundred, one);
        FHE.allowThis(bounded);
        euint32 scaled = FHE.mul(bounded, oneHundred);
        FHE.allowThis(scaled);
        euint32 derivedMultiplier = FHE.add(tenThousand, scaled);
        FHE.allowThis(derivedMultiplier);

        multiplierBps = FHE.select(isInstantCrash, tenThousand, derivedMultiplier);
        FHE.allowThis(multiplierBps);
    }
}

contract GameRandomness is IGameRandomness {
    struct PlayerStats {
        euint8 strength;
        euint8 agility;
        euint8 intelligence;
    }

    struct WinnerSelection {
        address requester;
        address[] players;
        euint32 winnerIndex;
        bool revealRequested;
        bool revealed;
        address winner;
    }

    uint256 public nextWinnerSelectionId;

    mapping(address => euint8) private lastDiceRolls;
    mapping(address => ebool) private lastCoinFlips;
    mapping(address => euint8) private playerCards;
    mapping(address => PlayerStats) private playerStats;
    mapping(address => euint8) private playerLoot;
    mapping(address => uint8) private playerBoardSizes;
    mapping(address => mapping(uint256 => euint8)) private playerBoards;
    mapping(uint256 => WinnerSelection) private winnerSelections;

    event DiceRolled(address indexed player, bytes32 handle);
    event CoinFlipped(address indexed player, bytes32 handle);
    event WinnerPicked(uint256 indexed selectionId, address indexed requester, bytes32 handle);
    event WinnerRevealRequested(uint256 indexed selectionId);
    event WinnerRevealed(uint256 indexed selectionId, address indexed winner);
    event CardDrawn(address indexed player, bytes32 handle);
    event StatsGenerated(address indexed player, bytes32 strength, bytes32 agility, bytes32 intelligence);
    event LootRolled(address indexed player, bytes32 handle);
    event BoardGenerated(address indexed player, uint8 size);

    /// @notice Rolls an encrypted six-sided die for the caller.
    /// @return The encrypted die result in the range [1, 6].
    function rollDice() external override returns (euint8) {
        euint8 result = GameRandomnessLib.randomDiceRoll();
        _storeDiceRoll(msg.sender, result);
        emit DiceRolled(msg.sender, euint8.unwrap(result));
        return result;
    }

    /// @notice Flips an encrypted coin for the caller.
    /// @return The encrypted boolean outcome where `true` represents heads.
    function flipCoin() external override returns (ebool) {
        ebool outcome = GameRandomnessLib.randomCoinFlip();
        _storeCoinFlip(msg.sender, outcome);
        emit CoinFlipped(msg.sender, ebool.unwrap(outcome));
        return outcome;
    }

    /// @notice Starts an encrypted winner-selection flow for a list of players.
    /// @param players The candidate player list.
    /// @return selectionId The async selection identifier used for reveal.
    function pickWinner(address[] calldata players) external override returns (uint256 selectionId) {
        require(players.length > 0, "NO_PLAYERS");

        selectionId = nextWinnerSelectionId++;
        WinnerSelection storage selection = winnerSelections[selectionId];
        selection.requester = msg.sender;
        selection.winnerIndex = GameRandomnessLib.randomWinnerIndex(players.length);
        FHE.allow(selection.winnerIndex, msg.sender);

        for (uint256 i = 0; i < players.length; i++) {
            require(players[i] != address(0), "ZERO_PLAYER");
            selection.players.push(players[i]);
        }

        emit WinnerPicked(selectionId, msg.sender, euint32.unwrap(selection.winnerIndex));
    }

    /// @notice Requests decryption of the encrypted winner index for a prior selection.
    /// @param selectionId The selection to reveal.
    function requestWinnerReveal(uint256 selectionId) external override {
        WinnerSelection storage selection = winnerSelections[selectionId];
        require(selection.requester != address(0), "UNKNOWN_SELECTION");
        require(msg.sender == selection.requester, "NOT_REQUESTER");
        require(!selection.revealed, "WINNER_REVEALED");
        require(!selection.revealRequested, "REVEAL_PENDING");

        selection.revealRequested = true;
        _requestDecrypt(selection.winnerIndex);

        emit WinnerRevealRequested(selectionId);
    }

    /// @notice Finalizes an async winner reveal after the decrypt task is ready.
    /// @param selectionId The selection to finalize.
    /// @return winner The plaintext winning address chosen from the stored player list.
    function finalizeWinnerReveal(uint256 selectionId) external override returns (address winner) {
        WinnerSelection storage selection = winnerSelections[selectionId];
        require(selection.requester != address(0), "UNKNOWN_SELECTION");
        require(msg.sender == selection.requester, "NOT_REQUESTER");
        require(selection.revealRequested, "REVEAL_NOT_REQUESTED");
        require(!selection.revealed, "WINNER_REVEALED");

        (uint32 winnerIndex, bool ready) = FHE.getDecryptResultSafe(selection.winnerIndex);
        require(ready, "WINNER_PENDING");

        winner = selection.players[winnerIndex];
        selection.revealed = true;
        selection.winner = winner;

        emit WinnerRevealed(selectionId, winner);
    }

    /// @notice Draws an encrypted card in the range [0, 51] for the caller.
    /// @return The encrypted card index.
    function drawCard() external override returns (euint8) {
        euint8 card = GameRandomnessLib.randomCardIndex();
        playerCards[msg.sender] = card;
        FHE.allowThis(card);
        FHE.allowSender(card);

        emit CardDrawn(msg.sender, euint8.unwrap(card));
        return card;
    }

    /// @notice Generates encrypted RPG-style stats for the caller.
    /// @return strength The encrypted strength value in the range [1, 20].
    /// @return agility The encrypted agility value in the range [1, 20].
    /// @return intelligence The encrypted intelligence value in the range [1, 20].
    function generateStats() external override returns (euint8 strength, euint8 agility, euint8 intelligence) {
        strength = GameRandomnessLib.randomStatRoll();
        agility = GameRandomnessLib.randomStatRoll();
        intelligence = GameRandomnessLib.randomStatRoll();

        playerStats[msg.sender] = PlayerStats({strength: strength, agility: agility, intelligence: intelligence});

        FHE.allowThis(strength);
        FHE.allowThis(agility);
        FHE.allowThis(intelligence);
        FHE.allowSender(strength);
        FHE.allowSender(agility);
        FHE.allowSender(intelligence);

        emit StatsGenerated(
            msg.sender,
            euint8.unwrap(strength),
            euint8.unwrap(agility),
            euint8.unwrap(intelligence)
        );
    }

    /// @notice Rolls an encrypted loot rarity tier for the caller.
    /// @return The encrypted rarity tier in the range [0, 4].
    function rollLoot() external override returns (euint8) {
        euint8 rarityTier = GameRandomnessLib.randomLootTier();
        playerLoot[msg.sender] = rarityTier;
        FHE.allowThis(rarityTier);
        FHE.allowSender(rarityTier);

        emit LootRolled(msg.sender, euint8.unwrap(rarityTier));
        return rarityTier;
    }

    /// @notice Generates an encrypted `size x size` board for the caller.
    /// @param size The board width and height.
    /// @return board The generated encrypted tile handles.
    function generateBoard(uint8 size) external override returns (euint8[] memory board) {
        require(size > 0, "ZERO_SIZE");
        require(size <= 16, "BOARD_TOO_LARGE");

        uint256 tileCount = uint256(size) * uint256(size);
        board = new euint8[](tileCount);
        playerBoardSizes[msg.sender] = size;

        for (uint256 i = 0; i < tileCount; i++) {
            euint8 tile = GameRandomnessLib.randomBoardTile();
            playerBoards[msg.sender][i] = tile;
            board[i] = tile;

            FHE.allowThis(tile);
            FHE.allowSender(tile);
        }

        emit BoardGenerated(msg.sender, size);
    }

    /// @notice Returns the caller's most recent encrypted die-roll handle.
    function getLastDiceRoll() external view override returns (euint8) {
        return lastDiceRolls[msg.sender];
    }

    /// @notice Returns the caller's most recent encrypted coin-flip handle.
    function getLastCoinFlip() external view override returns (ebool) {
        return lastCoinFlips[msg.sender];
    }

    /// @notice Returns the caller's latest encrypted card handle.
    function getPlayerCard() external view override returns (euint8) {
        return playerCards[msg.sender];
    }

    /// @notice Returns the caller's encrypted stats handles.
    function getPlayerStats() external view override returns (euint8 strength, euint8 agility, euint8 intelligence) {
        PlayerStats storage stats = playerStats[msg.sender];
        return (stats.strength, stats.agility, stats.intelligence);
    }

    /// @notice Returns the caller's latest encrypted loot rarity handle.
    function getPlayerLoot() external view override returns (euint8) {
        return playerLoot[msg.sender];
    }

    /// @notice Returns one encrypted board tile for the caller.
    /// @param tileIndex The zero-based tile index.
    function getBoardTile(uint256 tileIndex) external view override returns (euint8) {
        uint8 size = playerBoardSizes[msg.sender];
        require(size > 0, "BOARD_NOT_SET");
        require(tileIndex < uint256(size) * uint256(size), "BAD_TILE");
        return playerBoards[msg.sender][tileIndex];
    }

    /// @notice Returns the currently stored board size for a player.
    /// @param player The account to inspect.
    function getBoardSize(address player) external view override returns (uint8) {
        return playerBoardSizes[player];
    }

    function _storeDiceRoll(address player, euint8 value) internal {
        lastDiceRolls[player] = value;
        FHE.allowThis(value);
        FHE.allow(value, player);
    }

    function _storeCoinFlip(address player, ebool value) internal {
        lastCoinFlips[player] = value;
        FHE.allowThis(value);
        FHE.allow(value, player);
    }

    function _requestDecrypt(euint32 value) internal {
        ITaskManager(TASK_MANAGER_ADDRESS).createDecryptTask(uint256(bytes32(euint32.unwrap(value))), address(this));
    }
}
