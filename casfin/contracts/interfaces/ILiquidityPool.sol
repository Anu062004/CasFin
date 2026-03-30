// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ILiquidityPool {
    function feeBps() external view returns (uint256);

    function activeLiquidity() external view returns (uint256);

    function isFinalized() external view returns (bool);

    function accrueTraderFee() external payable;
}
