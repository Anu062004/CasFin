// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {ebool, euint8} from "@fhenixprotocol/cofhe-contracts/FHE.sol";

interface IGameRandomness {
    function rollDice() external returns (euint8);

    function flipCoin() external returns (ebool);

    function pickWinner(address[] calldata players) external returns (uint256 selectionId);

    function requestWinnerReveal(uint256 selectionId) external;

    function finalizeWinnerReveal(uint256 selectionId) external returns (address winner);

    function drawCard() external returns (euint8);

    function generateStats() external returns (euint8 strength, euint8 agility, euint8 intelligence);

    function rollLoot() external returns (euint8);

    function generateBoard(uint8 size) external returns (euint8[] memory board);

    function getLastDiceRoll() external view returns (euint8);

    function getLastCoinFlip() external view returns (ebool);

    function getPlayerCard() external view returns (euint8);

    function getPlayerStats() external view returns (euint8 strength, euint8 agility, euint8 intelligence);

    function getPlayerLoot() external view returns (euint8);

    function getBoardTile(uint256 tileIndex) external view returns (euint8);

    function getBoardSize(address player) external view returns (uint8);
}
