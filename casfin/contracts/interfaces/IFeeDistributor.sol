// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IFeeDistributor {
    function routePlatformFee() external payable;

    function routeResolverFee(address recipient) external payable;
}
