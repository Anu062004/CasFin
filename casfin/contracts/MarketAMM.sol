// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "./base/Ownable.sol";
import {Initializable} from "./base/Initializable.sol";
import {MathLib} from "./libraries/MathLib.sol";
import {ILiquidityPool} from "./interfaces/ILiquidityPool.sol";

contract MarketAMM is Ownable, Initializable {
    uint256 public outcomeCount;
    address public pool;
    uint256 public spreadBps;
    uint256 public virtualLiquidityFloor;

    event PoolBound(address indexed pool);

    constructor() {
        _disableInitializers();
    }

    function initialize(address initialOwner, uint256 outcomes, uint256 spread, uint256 liquidityFloor)
        external
        initializer
    {
        require(outcomes >= 2, "NEED_OUTCOMES");
        require(spread < MathLib.BPS_DENOMINATOR, "BAD_SPREAD");
        _initializeOwner(initialOwner);
        outcomeCount = outcomes;
        spreadBps = spread;
        virtualLiquidityFloor = liquidityFloor;
    }

    function bindPool(address poolAddress) external onlyOwner {
        require(pool == address(0), "POOL_BOUND");
        require(poolAddress != address(0), "ZERO_POOL");
        pool = poolAddress;
        emit PoolBound(poolAddress);
    }

    function previewBuy(uint8 outcomeIndex, uint256 collateralIn, uint256[] memory totalShares)
        external
        view
        returns (uint256 sharesOut, uint256 priceWad)
    {
        priceWad = currentPriceWad(outcomeIndex, totalShares);
        sharesOut = MathLib.mulDiv(collateralIn, MathLib.WAD, priceWad);
    }

    function previewSell(uint8 outcomeIndex, uint256 sharesIn, uint256[] memory totalShares)
        external
        view
        returns (uint256 grossProceeds, uint256 priceWad)
    {
        priceWad = currentPriceWad(outcomeIndex, totalShares);
        uint256 raw = MathLib.mulDiv(sharesIn, priceWad, MathLib.WAD);
        grossProceeds = MathLib.mulDiv(raw, MathLib.BPS_DENOMINATOR - spreadBps, MathLib.BPS_DENOMINATOR);
    }

    function currentPriceWad(uint8 outcomeIndex, uint256[] memory totalShares) public view returns (uint256) {
        require(outcomeIndex < outcomeCount, "BAD_OUTCOME");
        require(totalShares.length == outcomeCount, "BAD_SHARES_LEN");

        uint256 baseWeight = _baseWeight();
        uint256 denominator = baseWeight * outcomeCount;

        for (uint256 i = 0; i < totalShares.length; i++) {
            denominator += totalShares[i];
        }

        require(denominator > 0, "ZERO_DENOMINATOR");

        return MathLib.mulDiv(totalShares[outcomeIndex] + baseWeight, MathLib.WAD, denominator);
    }

    function _baseWeight() internal view returns (uint256) {
        if (pool == address(0)) {
            return virtualLiquidityFloor;
        }

        uint256 active = ILiquidityPool(pool).activeLiquidity();
        uint256 perOutcome = outcomeCount == 0 ? 0 : active / outcomeCount;
        return perOutcome > virtualLiquidityFloor ? perOutcome : virtualLiquidityFloor;
    }
}
