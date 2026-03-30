// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ICasinoVault {
    function reserveFunds(address player, uint128 requestedAmount) external returns (uint128 actualReserved);

    function settleBet(address player, uint128 lockedAmount, uint128 returnAmount)
        external
        returns (uint128 updatedBalance);

    function withdraw(uint128 requestedAmount) external;

    function balanceOf(address player) external view returns (uint128);

    function lockedBalanceOf(address player) external view returns (uint128);
}
