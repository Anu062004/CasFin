// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library MathLib {
    uint256 internal constant BPS_DENOMINATOR = 10_000;
    uint256 internal constant WAD = 1e18;

    function min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }

    function mulDiv(uint256 x, uint256 y, uint256 denominator) internal pure returns (uint256) {
        require(denominator != 0, "DIV_ZERO");
        return (x * y) / denominator;
    }
}
