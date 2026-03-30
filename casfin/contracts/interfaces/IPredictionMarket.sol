// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IPredictionMarket {
    function resolvesAt() external view returns (uint256);

    function resolved() external view returns (bool);

    function finalized() external view returns (bool);

    function resolveMarket(uint8 winningOutcome) external;

    function markDisputed() external;

    function settleDispute(uint8 finalOutcome) external;
}
