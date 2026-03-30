// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "./base/Ownable.sol";
import {Pausable} from "./base/Pausable.sol";
import {ReentrancyGuard} from "./base/ReentrancyGuard.sol";
import {Initializable} from "./base/Initializable.sol";
import {MathLib} from "./libraries/MathLib.sol";
import {IPredictionMarket} from "./interfaces/IPredictionMarket.sol";

contract LiquidityPool is Ownable, Pausable, ReentrancyGuard, Initializable {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;

    address public market;
    uint256 public feeBps;
    uint256 public totalSupply;
    uint256 public totalPrincipal;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event LiquidityAdded(address indexed provider, uint256 assets, uint256 sharesMinted);
    event LiquidityRemoved(address indexed provider, uint256 assets, uint256 sharesBurned);
    event TraderFeeAccrued(uint256 amount);
    event MarketBound(address indexed market);

    constructor() {
        _disableInitializers();
    }

    function initialize(address initialOwner, string memory lpName, string memory lpSymbol, uint256 lpFeeBps)
        external
        initializer
    {
        _initializeOwner(initialOwner);
        name = lpName;
        symbol = lpSymbol;
        feeBps = lpFeeBps;
    }

    modifier onlyMarket() {
        require(msg.sender == market, "NOT_MARKET");
        _;
    }

    function bindMarket(address marketAddress) external onlyOwner {
        require(market == address(0), "MARKET_BOUND");
        require(marketAddress != address(0), "ZERO_MARKET");
        market = marketAddress;
        emit MarketBound(marketAddress);
    }

    function seedLiquidity(address beneficiary) external payable onlyOwner {
        _addLiquidity(beneficiary, msg.value);
    }

    function addLiquidity(address beneficiary) external payable whenNotPaused {
        _addLiquidity(beneficiary, msg.value);
    }

    function accrueTraderFee() external payable onlyMarket {
        require(msg.value > 0, "NO_VALUE");
        emit TraderFeeAccrued(msg.value);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "ALLOWANCE_TOO_LOW");
        allowance[from][msg.sender] = allowed - amount;
        emit Approval(from, msg.sender, allowance[from][msg.sender]);
        _transfer(from, to, amount);
        return true;
    }

    function removeLiquidity(uint256 shares) external nonReentrant whenNotPaused {
        require(market != address(0), "MARKET_UNBOUND");
        require(IPredictionMarket(market).finalized(), "MARKET_NOT_FINALIZED");
        require(shares > 0, "ZERO_SHARES");
        require(balanceOf[msg.sender] >= shares, "INSUFFICIENT_SHARES");

        uint256 assets = MathLib.mulDiv(shares, address(this).balance, totalSupply);
        uint256 principalReduction = MathLib.min(totalPrincipal, assets);

        balanceOf[msg.sender] -= shares;
        totalSupply -= shares;
        totalPrincipal -= principalReduction;
        emit Transfer(msg.sender, address(0), shares);

        (bool ok,) = msg.sender.call{value: assets}("");
        require(ok, "TRANSFER_FAILED");

        emit LiquidityRemoved(msg.sender, assets, shares);
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

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _addLiquidity(address beneficiary, uint256 assets) internal {
        require(beneficiary != address(0), "ZERO_BENEFICIARY");
        require(assets > 0, "ZERO_ASSETS");

        uint256 shares;
        uint256 poolAssetsBefore = address(this).balance - assets;

        if (totalSupply == 0 || poolAssetsBefore == 0) {
            shares = assets;
        } else {
            shares = MathLib.mulDiv(assets, totalSupply, poolAssetsBefore);
        }

        require(shares > 0, "ZERO_MINT");

        totalSupply += shares;
        totalPrincipal += assets;
        balanceOf[beneficiary] += shares;

        emit Transfer(address(0), beneficiary, shares);
        emit LiquidityAdded(beneficiary, assets, shares);
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(to != address(0), "ZERO_TO");
        require(balanceOf[from] >= amount, "BALANCE_TOO_LOW");

        balanceOf[from] -= amount;
        balanceOf[to] += amount;

        emit Transfer(from, to, amount);
    }
}
