// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "../base/Ownable.sol";
import {Pausable} from "../base/Pausable.sol";
import {ReentrancyGuard} from "../base/ReentrancyGuard.sol";
import {Initializable} from "../base/Initializable.sol";
import {PredictionTypes} from "../libraries/PredictionTypes.sol";
import {EncryptedMarketAMM} from "./EncryptedMarketAMM.sol";
import {FHE, InEuint128, TASK_MANAGER_ADDRESS, ebool, euint128} from "@fhenixprotocol/cofhe-contracts/FHE.sol";
import {ITaskManager} from "@fhenixprotocol/cofhe-contracts/ICofhe.sol";

contract EncryptedPredictionMarket is Ownable, Pausable, ReentrancyGuard, Initializable {
    struct ClaimRequest {
        address claimant;
        euint128 encPayout;
        bool pending;
        bool completed;
    }

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

    PredictionTypes.FeeConfig public feeConfig;

    mapping(address => mapping(uint8 => euint128)) private encShares;
    euint128[] public encTotalSharesPerOutcome;
    euint128 public encCollateralPool;
    euint128 public encFinalPayoutPool;
    mapping(address => bool) public hasClaimed;
    mapping(address => ClaimRequest) public claimRequests;

    euint128 private ENCRYPTED_ZERO;
    euint128 private ENCRYPTED_BPS_DENOMINATOR;
    euint128 private ENCRYPTED_PLATFORM_FEE_BPS;
    euint128 private ENCRYPTED_LP_FEE_BPS;
    euint128 private ENCRYPTED_RESOLVER_FEE_BPS;

    event SharesBought(address indexed buyer, uint8 indexed outcomeIndex);
    event SharesSold(address indexed seller, uint8 indexed outcomeIndex);
    event MarketResolved(uint8 indexed winningOutcome, address indexed resolver);
    event MarketFinalized();
    event ClaimRequested(address indexed claimant);
    event WinningsClaimed(address indexed claimant, uint256 netPayout);
    event ResolverBound(address indexed resolver);
    event MarketDisputed(address indexed disputeRegistry);

    constructor() {
        _disableInitializers();
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
        require(ammAddress != address(0), "ZERO_AMM");
        require(poolAddress != address(0), "ZERO_POOL");
        require(feeDistributorAddress != address(0), "ZERO_FEE_DISTRIBUTOR");
        require(disputeRegistryAddress != address(0), "ZERO_DISPUTE_REGISTRY");

        _initializeOwner(initialOwner);
        creator = marketCreator;
        amm = ammAddress;
        pool = poolAddress;
        feeDistributor = feeDistributorAddress;
        disputeRegistry = disputeRegistryAddress;
        question = marketQuestion;
        description = marketDescription;
        resolvesAt = marketResolvesAt;
        disputeWindowSecs = marketDisputeWindowSecs;
        feeConfig = marketFeeConfig;

        for (uint256 i = 0; i < marketOutcomes.length; i++) {
            outcomes.push(marketOutcomes[i]);
        }

        ENCRYPTED_ZERO = _encUint128(0);
        ENCRYPTED_BPS_DENOMINATOR = _encUint128(10_000);
        ENCRYPTED_PLATFORM_FEE_BPS = _encUint128(marketFeeConfig.platformFeeBps);
        ENCRYPTED_LP_FEE_BPS = _encUint128(marketFeeConfig.lpFeeBps);
        ENCRYPTED_RESOLVER_FEE_BPS = _encUint128(marketFeeConfig.resolverFeeBps);
        _storeCollateralPool(ENCRYPTED_ZERO);
        _storeFinalPayoutPool(ENCRYPTED_ZERO);

        for (uint256 i = 0; i < marketOutcomes.length; i++) {
            encTotalSharesPerOutcome.push(ENCRYPTED_ZERO);
        }
    }

    function bindResolver(address resolverAddress) external onlyOwner {
        require(resolver == address(0), "RESOLVER_BOUND");
        require(resolverAddress != address(0), "ZERO_RESOLVER");
        resolver = resolverAddress;
        emit ResolverBound(resolverAddress);
    }

    function buyShares(uint8 outcomeIndex, InEuint128 calldata encAmount)
        external
        nonReentrant
        whenNotPaused
        onlyTradingWindow
    {
        require(outcomeIndex < outcomes.length, "BAD_OUTCOME");

        euint128 amount = FHE.asEuint128(encAmount);
        FHE.allowThis(amount);

        euint128 platformFee = _mulDiv(amount, ENCRYPTED_PLATFORM_FEE_BPS, ENCRYPTED_BPS_DENOMINATOR);
        euint128 lpFee = _mulDiv(amount, ENCRYPTED_LP_FEE_BPS, ENCRYPTED_BPS_DENOMINATOR);
        euint128 afterPlatformFee = FHE.sub(amount, platformFee);
        FHE.allowThis(afterPlatformFee);
        euint128 netCollateral = FHE.sub(afterPlatformFee, lpFee);
        FHE.allowThis(netCollateral);

        euint128[] memory totalShareSnapshot = _copyEncryptedTotals();
        euint128 sharesOut = EncryptedMarketAMM(amm).encPreviewBuy(outcomeIndex, netCollateral, totalShareSnapshot);
        FHE.allowThis(sharesOut);

        euint128 currentShares = encShares[msg.sender][outcomeIndex];
        euint128 newShares = FHE.add(currentShares, sharesOut);
        FHE.allowThis(newShares);
        _storeShares(msg.sender, outcomeIndex, newShares);

        euint128 newTotal = FHE.add(encTotalSharesPerOutcome[outcomeIndex], sharesOut);
        FHE.allowThis(newTotal);
        _storeTotalShares(outcomeIndex, newTotal);

        euint128 newPool = FHE.add(encCollateralPool, netCollateral);
        FHE.allowThis(newPool);
        _storeCollateralPool(newPool);

        emit SharesBought(msg.sender, outcomeIndex);
    }

    function requestClaim() public nonReentrant whenNotPaused {
        require(finalized, "MARKET_NOT_FINALIZED");
        require(!hasClaimed[msg.sender], "ALREADY_CLAIMED");

        ClaimRequest storage req = claimRequests[msg.sender];
        require(!req.pending, "CLAIM_PENDING");

        euint128 userShares = encShares[msg.sender][winningOutcome];
        euint128 winningSupply = encTotalSharesPerOutcome[winningOutcome];
        euint128 numerator = FHE.mul(userShares, encFinalPayoutPool);
        FHE.allowThis(numerator);
        euint128 grossPayout = FHE.div(numerator, winningSupply);
        FHE.allowThis(grossPayout);
        euint128 resolverFee = _mulDiv(grossPayout, ENCRYPTED_RESOLVER_FEE_BPS, ENCRYPTED_BPS_DENOMINATOR);
        euint128 netPayout = FHE.sub(grossPayout, resolverFee);
        FHE.allowThis(netPayout);
        FHE.allow(netPayout, msg.sender);

        req.claimant = msg.sender;
        req.encPayout = netPayout;
        req.pending = true;
        req.completed = false;

        _requestDecrypt(netPayout);
        emit ClaimRequested(msg.sender);
    }

    function finalizeClaim() public nonReentrant whenNotPaused {
        ClaimRequest storage req = claimRequests[msg.sender];
        require(req.pending, "NO_PENDING_CLAIM");
        require(!req.completed, "ALREADY_FINALIZED");

        (uint128 payout, bool ready) = FHE.getDecryptResultSafe(req.encPayout);
        require(ready, "DECRYPT_PENDING");

        req.completed = true;
        req.pending = false;
        hasClaimed[msg.sender] = true;

        (bool ok,) = msg.sender.call{value: payout}("");
        require(ok, "CLAIM_TRANSFER_FAILED");

        emit WinningsClaimed(msg.sender, payout);
    }

    function claim() external {
        requestClaim();
    }

    function claimWinnings(uint256) external {
        requestClaim();
    }

    function finalizeClaimWinnings(uint256) external {
        finalizeClaim();
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
        encFinalPayoutPool = encCollateralPool;
        FHE.allowThis(encFinalPayoutPool);

        emit MarketFinalized();
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
        finalized = true;
        winningOutcome = finalOutcome;
        resolvedAt = block.timestamp;
        encFinalPayoutPool = encCollateralPool;
        FHE.allowThis(encFinalPayoutPool);

        emit MarketResolved(finalOutcome, msg.sender);
        emit MarketFinalized();
    }

    function getShares(address account, uint8 outcomeIndex) external view returns (euint128) {
        return encShares[account][outcomeIndex];
    }

    function getTotalSharesPerOutcome() external view returns (euint128[] memory) {
        return _copyEncryptedTotals();
    }

    function outcomesCount() external view returns (uint256) {
        return outcomes.length;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _copyEncryptedTotals() internal view returns (euint128[] memory snapshot) {
        snapshot = new euint128[](encTotalSharesPerOutcome.length);
        for (uint256 i = 0; i < encTotalSharesPerOutcome.length; i++) {
            snapshot[i] = encTotalSharesPerOutcome[i];
        }
    }

    function _mulDiv(euint128 lhs, euint128 rhs, euint128 denominator) internal returns (euint128 value) {
        euint128 numerator = FHE.mul(lhs, rhs);
        FHE.allowThis(numerator);
        value = FHE.div(numerator, denominator);
        FHE.allowThis(value);
    }

    function _storeShares(address account, uint8 outcomeIndex, euint128 value) internal {
        encShares[account][outcomeIndex] = value;
        FHE.allowThis(value);
        FHE.allow(value, account);
    }

    function _storeTotalShares(uint8 outcomeIndex, euint128 value) internal {
        encTotalSharesPerOutcome[outcomeIndex] = value;
        FHE.allowThis(value);
    }

    function _storeCollateralPool(euint128 value) internal {
        encCollateralPool = value;
        FHE.allowThis(value);
    }

    function _storeFinalPayoutPool(euint128 value) internal {
        encFinalPayoutPool = value;
        FHE.allowThis(value);
    }

    function _encUint128(uint256 value) internal returns (euint128 encValue) {
        require(value <= type(uint128).max, "UINT128_OVERFLOW");
        encValue = FHE.asEuint128(uint128(value));
        FHE.allowThis(encValue);
    }

    function _requestDecrypt(euint128 value) internal {
        ITaskManager(TASK_MANAGER_ADDRESS).createDecryptTask(uint256(bytes32(euint128.unwrap(value))), address(this));
    }

    receive() external payable {}
}
