// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "../base/Ownable.sol";
import {Pausable} from "../base/Pausable.sol";
import {ReentrancyGuard} from "../base/ReentrancyGuard.sol";
import {MathLib} from "../libraries/MathLib.sol";
import {ICasinoVault} from "../interfaces/ICasinoVault.sol";
import {ICasinoRandomnessRouter} from "../interfaces/ICasinoRandomnessRouter.sol";

abstract contract CasinoGameBase is Ownable, Pausable, ReentrancyGuard {
    ICasinoVault public immutable vault;
    ICasinoRandomnessRouter public immutable randomnessRouter;

    uint16 public houseEdgeBps;
    uint128 public maxBetAmount;

    event HouseEdgeUpdated(uint16 newHouseEdgeBps);
    event MaxBetUpdated(uint128 newMaxBetAmount);

    constructor(
        address initialOwner,
        address vaultAddress,
        address randomnessRouterAddress,
        uint16 initialHouseEdgeBps,
        uint128 initialMaxBetAmount
    ) {
        require(vaultAddress != address(0), "ZERO_VAULT");
        require(randomnessRouterAddress != address(0), "ZERO_RANDOMNESS");
        require(initialHouseEdgeBps < MathLib.BPS_DENOMINATOR, "BAD_HOUSE_EDGE");
        require(initialMaxBetAmount > 0, "BAD_MAX_BET");

        _initializeOwner(initialOwner);
        vault = ICasinoVault(vaultAddress);
        randomnessRouter = ICasinoRandomnessRouter(randomnessRouterAddress);
        houseEdgeBps = initialHouseEdgeBps;
        maxBetAmount = initialMaxBetAmount;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function setHouseEdgeBps(uint16 newHouseEdgeBps) external onlyOwner {
        require(newHouseEdgeBps < MathLib.BPS_DENOMINATOR, "BAD_HOUSE_EDGE");
        houseEdgeBps = newHouseEdgeBps;
        emit HouseEdgeUpdated(newHouseEdgeBps);
    }

    function setMaxBetAmount(uint128 newMaxBetAmount) external onlyOwner {
        require(newMaxBetAmount > 0, "BAD_MAX_BET");
        maxBetAmount = newMaxBetAmount;
        emit MaxBetUpdated(newMaxBetAmount);
    }

    function _reserveStake(address player, uint128 requestedAmount) internal returns (uint128 actualStake) {
        uint128 cappedRequest = requestedAmount > maxBetAmount ? maxBetAmount : requestedAmount;
        require(cappedRequest > 0, "ZERO_BET");
        actualStake = vault.reserveFunds(player, cappedRequest);
    }

    function _requestRandomness(bytes32 context) internal returns (uint256 requestId) {
        return randomnessRouter.requestRandomness(context);
    }

    function _applyHouseEdge(uint128 grossReturn) internal view returns (uint128) {
        return _toUint128(
            MathLib.mulDiv(grossReturn, MathLib.BPS_DENOMINATOR - houseEdgeBps, MathLib.BPS_DENOMINATOR)
        );
    }

    function _settle(address player, uint128 lockedAmount, uint128 returnAmount) internal {
        vault.settleBet(player, lockedAmount, returnAmount);
    }

    function _toUint128(uint256 value) internal pure returns (uint128) {
        require(value <= type(uint128).max, "UINT128_OVERFLOW");
        return uint128(value);
    }
}
