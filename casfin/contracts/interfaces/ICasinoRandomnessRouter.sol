// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ICasinoRandomnessRouter {
    function requestRandomness(bytes32 context) external returns (uint256 requestId);

    function getRandomness(uint256 requestId) external view returns (uint256 randomWord, bool ready);
}
