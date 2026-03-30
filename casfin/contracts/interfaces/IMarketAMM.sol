// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IMarketAMM {
    function previewBuy(uint8 outcomeIndex, uint256 collateralIn, uint256[] memory totalShares)
        external
        view
        returns (uint256 sharesOut, uint256 priceWad);

    function previewSell(uint8 outcomeIndex, uint256 sharesIn, uint256[] memory totalShares)
        external
        view
        returns (uint256 grossProceeds, uint256 priceWad);
}
