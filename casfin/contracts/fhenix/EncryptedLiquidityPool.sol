// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "../base/Ownable.sol";
import {Pausable} from "../base/Pausable.sol";
import {ReentrancyGuard} from "../base/ReentrancyGuard.sol";
import {Initializable} from "../base/Initializable.sol";
import {IPredictionMarket} from "../interfaces/IPredictionMarket.sol";
import {FHE, InEuint128, euint128} from "@fhenixprotocol/cofhe-contracts/FHE.sol";

contract EncryptedLiquidityPool is Ownable, Pausable, ReentrancyGuard, Initializable {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;

    address public market;
    uint256 public feeBps;

    mapping(address => euint128) public encBalanceOf;
    euint128 public encTotalSupply;

    event LiquidityAdded(address indexed provider);
    event LiquidityRemoved(address indexed provider);
    event TraderFeeAccrued();
    event MarketBound(address indexed market);

    constructor() {
        _disableInitializers();
    }

    modifier onlyMarket() {
        require(msg.sender == market, "NOT_MARKET");
        _;
    }

    function initialize(address initialOwner, string memory lpName, string memory lpSymbol, uint256 lpFeeBps)
        external
        initializer
    {
        _initializeOwner(initialOwner);
        name = lpName;
        symbol = lpSymbol;
        feeBps = lpFeeBps;
        encTotalSupply = _encUint128(0);
    }

    function bindMarket(address marketAddress) external onlyOwner {
        require(market == address(0), "MARKET_BOUND");
        require(marketAddress != address(0), "ZERO_MARKET");
        market = marketAddress;
        emit MarketBound(marketAddress);
    }

    function seedLiquidity(address beneficiary, uint256 assets) external payable onlyOwner {
        require(msg.value == assets, "LIQUIDITY_MISMATCH");
        euint128 encAssets = _encUint128(assets);
        _addLiquidity(beneficiary, encAssets);
    }

    function addLiquidity(InEuint128 calldata encAssets, address beneficiary) external payable whenNotPaused {
        euint128 assets = FHE.asEuint128(encAssets);
        FHE.allowThis(assets);
        _addLiquidity(beneficiary, assets);
    }

    function accrueTraderFee() external payable onlyMarket {
        require(msg.value > 0, "NO_VALUE");
        emit TraderFeeAccrued();
    }

    function activeLiquidity() external view returns (uint256) {
        return address(this).balance;
    }

    function isFinalized() external view returns (bool) {
        if (market == address(0)) {
            return false;
        }

        return IPredictionMarket(market).finalized();
    }

    function getEncryptedBalance(address account) external view returns (euint128) {
        return encBalanceOf[account];
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _addLiquidity(address beneficiary, euint128 assets) internal {
        require(beneficiary != address(0), "ZERO_BENEFICIARY");

        euint128 shares = assets;
        FHE.allowThis(shares);
        euint128 newTotalSupply = FHE.add(encTotalSupply, shares);
        FHE.allowThis(newTotalSupply);
        euint128 newBalance = FHE.add(encBalanceOf[beneficiary], shares);
        FHE.allowThis(newBalance);

        encTotalSupply = newTotalSupply;
        FHE.allowThis(encTotalSupply);
        encBalanceOf[beneficiary] = newBalance;
        FHE.allowThis(newBalance);
        FHE.allow(newBalance, beneficiary);

        emit LiquidityAdded(beneficiary);
    }

    function _encUint128(uint256 value) internal returns (euint128 encValue) {
        require(value <= type(uint128).max, "UINT128_OVERFLOW");
        encValue = FHE.asEuint128(uint128(value));
        FHE.allowThis(encValue);
    }

    receive() external payable {}
}
