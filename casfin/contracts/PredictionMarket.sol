// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "./base/Ownable.sol";
import {Pausable} from "./base/Pausable.sol";
import {ReentrancyGuard} from "./base/ReentrancyGuard.sol";
import {Initializable} from "./base/Initializable.sol";
import {MathLib} from "./libraries/MathLib.sol";
import {PredictionTypes} from "./libraries/PredictionTypes.sol";
import {IMarketAMM} from "./interfaces/IMarketAMM.sol";
import {ILiquidityPool} from "./interfaces/ILiquidityPool.sol";
import {IFeeDistributor} from "./interfaces/IFeeDistributor.sol";
import {IMarketResolver} from "./interfaces/IMarketResolver.sol";

contract PredictionMarket is Ownable, Pausable, ReentrancyGuard, Initializable {
    string public question;
    string public description;
    string[] public outcomes;
    uint256 public resolvesAt;
    uint256 public disputeWindowSecs;
    uint256 public resolvedAt;
    uint8 public winningOutcome;
    bool public resolved;
    bool public disputed;
    bool public finalized;

    address public creator;
    address public amm;
    address public pool;
    address public resolver;
    address public feeDistributor;
    address public disputeRegistry;

    uint256 public collateralPool;
    uint256 public finalPayoutPool;

    PredictionTypes.FeeConfig public feeConfig;

    mapping(address => mapping(uint8 => uint128)) private shares;
    uint256[] public totalSharesPerOutcome;
    mapping(address => bool) public hasClaimed;

    event SharesBought(address indexed buyer, uint8 indexed outcomeIndex, uint256 collateralIn, uint256 sharesOut);
    event SharesSold(address indexed seller, uint8 indexed outcomeIndex, uint256 sharesIn, uint256 proceedsOut);
    event MarketResolved(uint8 indexed winningOutcome, address indexed resolver);
    event MarketFinalized(uint256 finalPayoutPool);
    event WinningsClaimed(address indexed claimant, uint256 grossPayout, uint256 netPayout);
    event ResolverBound(address indexed resolver);
    event MarketDisputed(address indexed disputeRegistry);

    constructor() {
        _disableInitializers();
    }

    function initialize(
        address initialOwner,
        address marketCreator,
        address ammAddress,
        address poolAddress,
        address feeDistributorAddress,
        address disputeRegistryAddress,
        string memory marketQuestion,
        string memory marketDescription,
        string[] memory marketOutcomes,
        uint256 marketResolvesAt,
        uint256 marketDisputeWindowSecs,
        PredictionTypes.FeeConfig memory marketFeeConfig
    ) external initializer {
        require(marketOutcomes.length >= 2, "NEED_OUTCOMES");
        require(marketResolvesAt > block.timestamp + 1 hours, "RESOLUTION_TOO_SOON");

        _initializeOwner(initialOwner);
        creator = marketCreator;
        amm = ammAddress;
        pool = poolAddress;
        feeDistributor = feeDistributorAddress;
        disputeRegistry = disputeRegistryAddress;
        question = marketQuestion;
        description = marketDescription;
        outcomes = marketOutcomes;
        resolvesAt = marketResolvesAt;
        disputeWindowSecs = marketDisputeWindowSecs;
        feeConfig = marketFeeConfig;
        totalSharesPerOutcome = new uint256[](marketOutcomes.length);
    }

    modifier onlyResolver() {
        require(msg.sender == resolver, "NOT_RESOLVER");
        _;
    }

    modifier onlyDisputeRegistry() {
        require(msg.sender == disputeRegistry, "NOT_DISPUTE_REGISTRY");
        _;
    }

    modifier onlyTradingWindow() {
        require(!resolved, "MARKET_RESOLVED");
        require(block.timestamp < resolvesAt, "MARKET_EXPIRED");
        _;
    }

    function bindResolver(address resolverAddress) external onlyOwner {
        require(resolver == address(0), "RESOLVER_BOUND");
        require(resolverAddress != address(0), "ZERO_RESOLVER");
        resolver = resolverAddress;
        emit ResolverBound(resolverAddress);
    }

    function buyShares(uint8 outcomeIndex, uint256 minSharesOut) external payable nonReentrant whenNotPaused onlyTradingWindow {
        require(outcomeIndex < outcomes.length, "BAD_OUTCOME");
        require(msg.value > 0, "ZERO_COLLATERAL");

        uint256 platformFee = MathLib.mulDiv(msg.value, feeConfig.platformFeeBps, MathLib.BPS_DENOMINATOR);
        uint256 lpFee = MathLib.mulDiv(msg.value, feeConfig.lpFeeBps, MathLib.BPS_DENOMINATOR);
        uint256 netCollateral = msg.value - platformFee - lpFee;

        uint256[] memory shareSnapshot = _copyTotalShares();
        (uint256 sharesOut,) = IMarketAMM(amm).previewBuy(outcomeIndex, netCollateral, shareSnapshot);
        require(sharesOut > 0, "ZERO_SHARES");
        require(sharesOut >= minSharesOut, "SLIPPAGE_EXCEEDED");

        shares[msg.sender][outcomeIndex] += _toUint128(sharesOut);

        totalSharesPerOutcome[outcomeIndex] += sharesOut;
        collateralPool += netCollateral;

        if (platformFee > 0) {
            IFeeDistributor(feeDistributor).routePlatformFee{value: platformFee}();
        }
        if (lpFee > 0) {
            ILiquidityPool(pool).accrueTraderFee{value: lpFee}();
        }

        emit SharesBought(msg.sender, outcomeIndex, netCollateral, sharesOut);
    }

    function sell(uint8 outcomeIndex, uint128 sharesIn) external nonReentrant whenNotPaused onlyTradingWindow {
        require(outcomeIndex < outcomes.length, "BAD_OUTCOME");
        require(sharesIn > 0, "ZERO_REQUEST");
        uint128 userShares = shares[msg.sender][outcomeIndex];
        require(userShares >= sharesIn, "INSUFFICIENT_SHARES");

        uint256[] memory shareSnapshot = _copyTotalShares();
        (uint256 grossProceeds,) = IMarketAMM(amm).previewSell(outcomeIndex, sharesIn, shareSnapshot);
        require(grossProceeds <= collateralPool, "INSUFFICIENT_POOL");

        uint256 platformFee = MathLib.mulDiv(grossProceeds, feeConfig.platformFeeBps, MathLib.BPS_DENOMINATOR);
        uint256 lpFee = MathLib.mulDiv(grossProceeds, feeConfig.lpFeeBps, MathLib.BPS_DENOMINATOR);
        uint256 netProceeds = grossProceeds - platformFee - lpFee;

        shares[msg.sender][outcomeIndex] = userShares - sharesIn;
        totalSharesPerOutcome[outcomeIndex] -= sharesIn;
        collateralPool -= grossProceeds;

        if (platformFee > 0) {
            IFeeDistributor(feeDistributor).routePlatformFee{value: platformFee}();
        }
        if (lpFee > 0) {
            ILiquidityPool(pool).accrueTraderFee{value: lpFee}();
        }

        (bool ok,) = msg.sender.call{value: netProceeds}("");
        require(ok, "SELL_TRANSFER_FAILED");

        emit SharesSold(msg.sender, outcomeIndex, sharesIn, netProceeds);
    }

    function claim() external nonReentrant whenNotPaused {
        require(finalized, "MARKET_NOT_FINALIZED");
        require(!hasClaimed[msg.sender], "ALREADY_CLAIMED");
        uint128 winnerShares = shares[msg.sender][winningOutcome];
        require(winnerShares > 0, "NO_WINNING_SHARES");

        uint256 winningSupply = totalSharesPerOutcome[winningOutcome];
        require(winningSupply > 0, "NO_WINNING_SUPPLY");

        uint256 grossPayout = MathLib.mulDiv(finalPayoutPool, winnerShares, winningSupply);
        uint256 resolverFee = MathLib.mulDiv(grossPayout, feeConfig.resolverFeeBps, MathLib.BPS_DENOMINATOR);
        uint256 netPayout = grossPayout - resolverFee;

        hasClaimed[msg.sender] = true;

        if (resolverFee > 0) {
            IFeeDistributor(feeDistributor).routeResolverFee{value: resolverFee}(IMarketResolver(resolver).feeRecipient());
        }

        (bool ok,) = msg.sender.call{value: netPayout}("");
        require(ok, "CLAIM_TRANSFER_FAILED");

        emit WinningsClaimed(msg.sender, grossPayout, netPayout);
    }

    function resolveMarket(uint8 resolvedOutcome) external onlyResolver {
        require(!resolved, "ALREADY_RESOLVED");
        require(block.timestamp >= resolvesAt, "TOO_EARLY");
        require(resolvedOutcome < outcomes.length, "BAD_OUTCOME");

        resolved = true;
        winningOutcome = resolvedOutcome;
        resolvedAt = block.timestamp;

        emit MarketResolved(resolvedOutcome, msg.sender);
    }

    function finalizeMarket() external {
        require(resolved, "NOT_RESOLVED");
        require(!disputed, "ACTIVE_DISPUTE");
        require(!finalized, "ALREADY_FINALIZED");
        require(block.timestamp >= resolvedAt + disputeWindowSecs, "DISPUTE_WINDOW_OPEN");

        finalized = true;
        finalPayoutPool = collateralPool;

        emit MarketFinalized(finalPayoutPool);
    }

    function markDisputed() external onlyDisputeRegistry {
        require(resolved, "NOT_RESOLVED");
        require(!finalized, "ALREADY_FINALIZED");
        disputed = true;
        emit MarketDisputed(msg.sender);
    }

    function settleDispute(uint8 finalOutcome) external onlyDisputeRegistry {
        require(finalOutcome < outcomes.length, "BAD_OUTCOME");
        disputed = false;
        resolved = true;
        winningOutcome = finalOutcome;
        finalized = true;
        finalPayoutPool = collateralPool;

        emit MarketResolved(finalOutcome, msg.sender);
        emit MarketFinalized(finalPayoutPool);
    }

    function getShares(address account, uint8 outcomeIndex) external view returns (uint128) {
        return shares[account][outcomeIndex];
    }

    function getTotalSharesPerOutcome() external view returns (uint256[] memory) {
        return _copyTotalShares();
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _copyTotalShares() internal view returns (uint256[] memory snapshot) {
        snapshot = new uint256[](totalSharesPerOutcome.length);
        for (uint256 i = 0; i < totalSharesPerOutcome.length; i++) {
            snapshot[i] = totalSharesPerOutcome[i];
        }
    }

    function _toUint128(uint256 value) internal pure returns (uint128) {
        require(value <= type(uint128).max, "UINT128_OVERFLOW");
        return uint128(value);
    }

    receive() external payable {}
}
