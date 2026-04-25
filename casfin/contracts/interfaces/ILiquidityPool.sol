// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

interface ILiquidityPool {
    function accrueTraderFee() external payable;

    function activeLiquidity() external view returns (uint256);

    function feeBps() external view returns (uint256);

    function isFinalized() external view returns (bool);
}
