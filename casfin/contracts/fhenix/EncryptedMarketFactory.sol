// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "../base/Ownable.sol";
import {Pausable} from "../base/Pausable.sol";
import {Clones} from "../libraries/Clones.sol";
import {PredictionTypes} from "../libraries/PredictionTypes.sol";
import {FeeDistributor} from "../FeeDistributor.sol";
import {DisputeRegistry} from "../DisputeRegistry.sol";
import {EncryptedMarketAMM} from "./EncryptedMarketAMM.sol";
import {EncryptedLiquidityPool} from "./EncryptedLiquidityPool.sol";
import {EncryptedPredictionMarket} from "./EncryptedPredictionMarket.sol";
import {EncryptedMarketResolver} from "./EncryptedMarketResolver.sol";

contract EncryptedMarketFactory is Ownable, Pausable {
    using Clones for address;

    struct EncryptedMarketMeta {
        address market;
        address amm;
        address pool;
        address resolver;
        address creator;
        uint256 createdAt;
        PredictionTypes.OracleType oracleType;
    }

    uint256 public constant MAX_TOTAL_FEE_BPS = 1_000;
    uint256 public constant DEFAULT_AMM_SPREAD_BPS = 150;
    uint256 public constant DEFAULT_AMM_VIRTUAL_LIQUIDITY_FLOOR = 1e15;

    address public treasury;
    FeeDistributor public feeDistributor;
    DisputeRegistry public disputeRegistry;
    PredictionTypes.FeeConfig public feeConfig;
    address public immutable feeDistributorImplementation;
    address public immutable disputeRegistryImplementation;
    address public immutable marketAMMImplementation;
    address public immutable liquidityPoolImplementation;
    address public immutable predictionMarketImplementation;
    address public immutable marketResolverImplementation;

    address[] public allMarkets;
    mapping(address => bool) public isMarket;
    mapping(address => EncryptedMarketMeta) public marketMeta;
    mapping(address => bool) public approvedCreators;

    event MarketCreated(
        uint256 indexed marketId,
        address indexed market,
        address indexed creator,
        address amm,
        address pool,
        address resolver,
        string question
    );
    event CreatorApprovalUpdated(address indexed creator, bool approved);
    event TreasuryUpdated(address indexed treasury);
    event FeeConfigUpdated(uint16 platformFeeBps, uint16 lpFeeBps, uint16 resolverFeeBps);
    event DisputeSettledByAdmin(address indexed market, uint8 finalOutcome, bool challengerWon);

    constructor(
        address initialOwner,
        address initialTreasury,
        PredictionTypes.FeeConfig memory initialFeeConfig,
        uint256 minDisputeBond,
        address feeDistributorImplementationAddress,
        address disputeRegistryImplementationAddress,
        address marketAMMImplementationAddress,
        address liquidityPoolImplementationAddress,
        address predictionMarketImplementationAddress,
        address marketResolverImplementationAddress
    ) {
        _initializeOwner(initialOwner);
        _setTreasury(initialTreasury);
        _setFeeConfig(initialFeeConfig);

        feeDistributorImplementation = _requireImplementation(feeDistributorImplementationAddress);
        disputeRegistryImplementation = _requireImplementation(disputeRegistryImplementationAddress);
        marketAMMImplementation = _requireImplementation(marketAMMImplementationAddress);
        liquidityPoolImplementation = _requireImplementation(liquidityPoolImplementationAddress);
        predictionMarketImplementation = _requireImplementation(predictionMarketImplementationAddress);
        marketResolverImplementation = _requireImplementation(marketResolverImplementationAddress);

        feeDistributor = FeeDistributor(feeDistributorImplementation.clone());
        feeDistributor.initialize(address(this), initialTreasury);

        disputeRegistry = DisputeRegistry(disputeRegistryImplementation.clone());
        disputeRegistry.initialize(address(this), minDisputeBond);

        approvedCreators[initialOwner] = true;
    }

    function createMarket(PredictionTypes.CreateMarketParams calldata params)
        external
        payable
        whenNotPaused
        returns (uint256 marketId, address market)
    {
        require(approvedCreators[msg.sender], "CREATOR_NOT_APPROVED");
        require(params.outcomes.length >= 2, "NEED_OUTCOMES");
        require(params.resolvesAt > block.timestamp + 1 hours, "RESOLUTION_TOO_SOON");
        require(msg.value == params.initialLiquidity, "LIQUIDITY_MISMATCH");

        PredictionTypes.FeeConfig memory marketFeeConfig = feeConfig;

        EncryptedMarketAMM amm = EncryptedMarketAMM(marketAMMImplementation.clone());
        amm.initialize(
            address(this), params.outcomes.length, DEFAULT_AMM_SPREAD_BPS, DEFAULT_AMM_VIRTUAL_LIQUIDITY_FLOOR
        );

        EncryptedLiquidityPool pool = EncryptedLiquidityPool(payable(liquidityPoolImplementation.clone()));
        pool.initialize(address(this), "Encrypted Prediction LP", "EPLP", marketFeeConfig.lpFeeBps);

        EncryptedPredictionMarket predictionMarket =
            EncryptedPredictionMarket(payable(predictionMarketImplementation.clone()));
        predictionMarket.initialize(
            address(this),
            msg.sender,
            address(amm),
            address(pool),
            address(feeDistributor),
            address(disputeRegistry),
            params.question,
            params.description,
            params.outcomes,
            params.resolvesAt,
            params.disputeWindowSecs,
            marketFeeConfig
        );

        EncryptedMarketResolver resolver = EncryptedMarketResolver(marketResolverImplementation.clone());
        resolver.initialize(
            address(this),
            address(predictionMarket),
            msg.sender,
            msg.sender,
            params.oracleType,
            params.oracleAddress,
            params.oracleParams
        );

        amm.bindPool(address(pool));
        pool.bindMarket(address(predictionMarket));
        predictionMarket.bindResolver(address(resolver));

        if (msg.value > 0) {
            pool.seedLiquidity{value: msg.value}(msg.sender, msg.value);
        }

        market = address(predictionMarket);
        marketId = allMarkets.length;

        allMarkets.push(market);
        isMarket[market] = true;
        marketMeta[market] = EncryptedMarketMeta({
            market: market,
            amm: address(amm),
            pool: address(pool),
            resolver: address(resolver),
            creator: msg.sender,
            createdAt: block.timestamp,
            oracleType: params.oracleType
        });

        emit MarketCreated(
            marketId,
            market,
            msg.sender,
            address(amm),
            address(pool),
            address(resolver),
            params.question
        );
    }

    function setCreatorApproval(address creator, bool approved) external onlyOwner {
        approvedCreators[creator] = approved;
        emit CreatorApprovalUpdated(creator, approved);
    }

    function setTreasury(address newTreasury) external onlyOwner {
        _setTreasury(newTreasury);
        feeDistributor.setTreasury(newTreasury);
    }

    function setFeeConfig(PredictionTypes.FeeConfig calldata newFeeConfig) external onlyOwner {
        _setFeeConfig(newFeeConfig);
    }

    function setStakingPool(address stakingPool, uint16 stakingShareBps) external onlyOwner {
        feeDistributor.setStakingPool(stakingPool, stakingShareBps);
    }

    function settleMarketDispute(address market, uint8 finalOutcome, bool challengerWon) external onlyOwner {
        disputeRegistry.settleDispute(market, finalOutcome, challengerWon);
        emit DisputeSettledByAdmin(market, finalOutcome, challengerWon);
    }

    function setMinDisputeBond(uint256 newMinBond) external onlyOwner {
        disputeRegistry.setMinBond(newMinBond);
    }

    function totalMarkets() external view returns (uint256) {
        return allMarkets.length;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _setTreasury(address newTreasury) internal {
        require(newTreasury != address(0), "ZERO_TREASURY");
        treasury = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }

    function _setFeeConfig(PredictionTypes.FeeConfig memory newFeeConfig) internal {
        require(
            uint256(newFeeConfig.platformFeeBps) + uint256(newFeeConfig.lpFeeBps)
                + uint256(newFeeConfig.resolverFeeBps) <= MAX_TOTAL_FEE_BPS,
            "FEE_CAP_EXCEEDED"
        );
        feeConfig = newFeeConfig;
        emit FeeConfigUpdated(newFeeConfig.platformFeeBps, newFeeConfig.lpFeeBps, newFeeConfig.resolverFeeBps);
    }

    function _requireImplementation(address implementation) internal view returns (address) {
        require(implementation != address(0), "ZERO_IMPLEMENTATION");
        require(implementation.code.length > 0, "IMPLEMENTATION_NOT_DEPLOYED");
        return implementation;
    }
}
