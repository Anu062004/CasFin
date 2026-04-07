// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "../base/Ownable.sol";
import {Initializable} from "../base/Initializable.sol";
import {ILiquidityPool} from "../interfaces/ILiquidityPool.sol";
import {FHE, euint128} from "@fhenixprotocol/cofhe-contracts/FHE.sol";

contract EncryptedMarketAMM is Ownable, Initializable {
    uint256 public outcomeCount;
    address public pool;
    uint256 public spreadBps;
    uint256 public virtualLiquidityFloor;

    euint128 private ENCRYPTED_WAD;
    euint128 private ENCRYPTED_OUTCOME_COUNT;
    euint128 private ENCRYPTED_BPS_DENOMINATOR;

    event PoolBound(address indexed pool);

    constructor() {
        _disableInitializers();
    }

    function initialize(address initialOwner, uint256 outcomes, uint256 spread, uint256 liquidityFloor)
        external
        initializer
    {
        require(outcomes >= 2, "NEED_OUTCOMES");
        require(spread < 10_000, "BAD_SPREAD");

        _initializeOwner(initialOwner);
        outcomeCount = outcomes;
        spreadBps = spread;
        virtualLiquidityFloor = liquidityFloor;

        ENCRYPTED_WAD = _encUint128(1e18);
        ENCRYPTED_OUTCOME_COUNT = _encUint128(outcomes);
        ENCRYPTED_BPS_DENOMINATOR = _encUint128(10_000);
    }

    function bindPool(address poolAddress) external onlyOwner {
        require(pool == address(0), "POOL_BOUND");
        require(poolAddress != address(0), "ZERO_POOL");
        pool = poolAddress;
        emit PoolBound(poolAddress);
    }

    function encPreviewBuy(uint8 outcomeIndex, euint128 encCollateralIn, euint128[] memory encTotalShares)
        external
        returns (euint128 encSharesOut)
    {
        euint128 encPrice = _encCurrentPrice(outcomeIndex, encTotalShares);
        FHE.allowThis(encPrice);

        euint128 numerator = FHE.mul(encCollateralIn, ENCRYPTED_WAD);
        FHE.allowThis(numerator);
        encSharesOut = FHE.div(numerator, encPrice);
        FHE.allowThis(encSharesOut);
        FHE.allowTransient(encSharesOut, msg.sender);
    }

    function encPreviewSell(uint8 outcomeIndex, euint128 encSharesIn, euint128[] memory encTotalShares)
        external
        returns (euint128 encGrossProceeds)
    {
        euint128 encPrice = _encCurrentPrice(outcomeIndex, encTotalShares);
        FHE.allowThis(encPrice);

        euint128 raw = FHE.mul(encSharesIn, encPrice);
        FHE.allowThis(raw);
        euint128 rawProceeds = FHE.div(raw, ENCRYPTED_WAD);
        FHE.allowThis(rawProceeds);
        euint128 netSpreadBps = _encUint128(10_000 - spreadBps);
        euint128 numerator = FHE.mul(rawProceeds, netSpreadBps);
        FHE.allowThis(numerator);
        encGrossProceeds = FHE.div(numerator, ENCRYPTED_BPS_DENOMINATOR);
        FHE.allowThis(encGrossProceeds);
        FHE.allowTransient(encGrossProceeds, msg.sender);
    }

    function _encCurrentPrice(uint8 outcomeIndex, euint128[] memory encTotalShares) internal returns (euint128) {
        require(outcomeIndex < outcomeCount, "BAD_OUTCOME");
        require(encTotalShares.length == outcomeCount, "BAD_SHARES_LEN");

        euint128 baseWeight = _encBaseWeight();
        euint128 denominator = FHE.mul(baseWeight, ENCRYPTED_OUTCOME_COUNT);
        FHE.allowThis(denominator);

        for (uint256 i = 0; i < encTotalShares.length; i++) {
            denominator = FHE.add(denominator, encTotalShares[i]);
            FHE.allowThis(denominator);
        }

        euint128 numerator = FHE.add(encTotalShares[outcomeIndex], baseWeight);
        FHE.allowThis(numerator);
        euint128 scaledNumerator = FHE.mul(numerator, ENCRYPTED_WAD);
        FHE.allowThis(scaledNumerator);
        euint128 encPrice = FHE.div(scaledNumerator, denominator);
        FHE.allowThis(encPrice);
        return encPrice;
    }

    function _encBaseWeight() internal returns (euint128) {
        uint256 activeLiquidity = pool == address(0) ? 0 : ILiquidityPool(pool).activeLiquidity();
        uint256 perOutcome = outcomeCount == 0 ? 0 : activeLiquidity / outcomeCount;
        uint256 baseWeight = perOutcome > virtualLiquidityFloor ? perOutcome : virtualLiquidityFloor;
        return _encUint128(baseWeight);
    }

    function _encUint128(uint256 value) internal returns (euint128 encValue) {
        require(value <= type(uint128).max, "UINT128_OVERFLOW");
        encValue = FHE.asEuint128(uint128(value));
        FHE.allowThis(encValue);
    }
}
