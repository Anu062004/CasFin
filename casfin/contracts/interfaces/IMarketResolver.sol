// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IMarketResolver {
    function feeRecipient() external view returns (address);
}
