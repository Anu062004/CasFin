// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

interface IPredictionMarket {
    function finalized() external view returns (bool);

    function markDisputed() external;

    function resolveMarket(uint8 winningOutcome) external;

    function resolved() external view returns (bool);

    function resolvesAt() external view returns (uint256);

    function settleDispute(uint8 finalOutcome) external;
}
