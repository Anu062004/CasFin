// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "../base/Ownable.sol";
import {Pausable} from "../base/Pausable.sol";
import {Initializable} from "../base/Initializable.sol";
import {PredictionTypes} from "../libraries/PredictionTypes.sol";
import {IChainlinkAggregator} from "../interfaces/IChainlinkAggregator.sol";
import {IPyth} from "../interfaces/IPyth.sol";
import {EncryptedPredictionMarket} from "./EncryptedPredictionMarket.sol";
import {FHE, euint8} from "@fhenixprotocol/cofhe-contracts/FHE.sol";

contract EncryptedMarketResolver is Ownable, Pausable, Initializable {
    address payable public market;
    address public oracleAddress;
    address public feeRecipient;
    address public manualResolver;
    PredictionTypes.OracleType public oracleType;
    bytes public oracleParams;
    bool public resolutionRequested;
    bool public publicOutcomeAllowed;

    euint8 private encryptedResolvedOutcome;

    event ResolutionRequested(PredictionTypes.OracleType oracleType, bytes oracleParams);
    event ManualResolutionSubmitted(uint8 indexed winningOutcome);
    event ChainlinkResolutionSubmitted(uint8 indexed winningOutcome, int256 answer);
    event PythResolutionSubmitted(uint8 indexed winningOutcome, int64 price);
    event ResolvedOutcomeMadePublic(uint8 indexed winningOutcome);

    constructor() {
        _disableInitializers();
    }

    function initialize(
        address initialOwner,
        address marketAddress,
        address manualResolverAddress,
        address feeRecipientAddress,
        PredictionTypes.OracleType resolverType,
        address externalOracle,
        bytes memory params
    ) external initializer {
        require(marketAddress != address(0), "ZERO_MARKET");
        require(feeRecipientAddress != address(0), "ZERO_FEE_RECIPIENT");

        _initializeOwner(initialOwner);
        market = payable(marketAddress);
        manualResolver = manualResolverAddress;
        feeRecipient = feeRecipientAddress;
        oracleType = resolverType;
        oracleAddress = externalOracle;
        oracleParams = params;
    }

    function requestResolution() external whenNotPaused {
        require(block.timestamp >= EncryptedPredictionMarket(market).resolvesAt(), "TOO_EARLY");
        require(!EncryptedPredictionMarket(market).resolved(), "ALREADY_RESOLVED");

        resolutionRequested = true;
        emit ResolutionRequested(oracleType, oracleParams);

        if (oracleType == PredictionTypes.OracleType.Chainlink) {
            _resolveChainlink();
        } else if (oracleType == PredictionTypes.OracleType.Pyth) {
            _resolvePyth();
        }
    }

    function resolveManual(uint8 winningOutcome) external whenNotPaused {
        require(oracleType == PredictionTypes.OracleType.Manual, "NOT_MANUAL");
        require(msg.sender == manualResolver || msg.sender == owner, "NOT_AUTHORIZED");
        _submitResolution(winningOutcome);
        emit ManualResolutionSubmitted(winningOutcome);
    }

    function allowPublicResolvedOutcome() external whenNotPaused {
        require(msg.sender == manualResolver || msg.sender == owner, "NOT_AUTHORIZED");
        FHE.allowPublic(encryptedResolvedOutcome);
        publicOutcomeAllowed = true;
        emit ResolvedOutcomeMadePublic(EncryptedPredictionMarket(market).winningOutcome());
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _resolveChainlink() internal {
        require(oracleAddress != address(0), "ZERO_ORACLE");
        require(oracleParams.length > 0, "MISSING_PARAMS");

        (int256 threshold, bool resolveAbove) = abi.decode(oracleParams, (int256, bool));
        (, int256 answer,, uint256 updatedAt, uint80 answeredInRound) =
            IChainlinkAggregator(oracleAddress).latestRoundData();

        require(answeredInRound > 0, "STALE_ROUND");
        require(updatedAt + 10 minutes >= block.timestamp, "STALE_PRICE");
        require(answer > 0, "BAD_PRICE");

        bool yesWins = resolveAbove ? answer >= threshold : answer <= threshold;
        uint8 winningOutcome = yesWins ? 0 : 1;

        _submitResolution(winningOutcome);
        emit ChainlinkResolutionSubmitted(winningOutcome, answer);
    }

    function _resolvePyth() internal {
        require(oracleAddress != address(0), "ZERO_ORACLE");
        require(oracleParams.length > 0, "MISSING_PARAMS");

        (bytes32 feedId, uint256 maxAge, int64 threshold, bool resolveAbove) =
            abi.decode(oracleParams, (bytes32, uint256, int64, bool));

        IPyth.Price memory price = IPyth(oracleAddress).getPriceNoOlderThan(feedId, maxAge);
        bool yesWins = resolveAbove ? price.price >= threshold : price.price <= threshold;
        uint8 winningOutcome = yesWins ? 0 : 1;

        _submitResolution(winningOutcome);
        emit PythResolutionSubmitted(winningOutcome, price.price);
    }

    function _submitResolution(uint8 winningOutcome) internal {
        encryptedResolvedOutcome = FHE.asEuint8(winningOutcome);
        FHE.allowThis(encryptedResolvedOutcome);
        EncryptedPredictionMarket(market).resolveMarket(winningOutcome);
    }
}
