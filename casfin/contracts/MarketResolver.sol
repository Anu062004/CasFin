// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "./base/Ownable.sol";
import {Pausable} from "./base/Pausable.sol";
import {Initializable} from "./base/Initializable.sol";
import {PredictionTypes} from "./libraries/PredictionTypes.sol";
import {IPredictionMarket} from "./interfaces/IPredictionMarket.sol";
import {IChainlinkAggregator} from "./interfaces/IChainlinkAggregator.sol";

contract MarketResolver is Ownable, Pausable, Initializable {
    address public market;
    address public oracleAddress;
    address public feeRecipient;
    address public manualResolver;
    PredictionTypes.OracleType public oracleType;
    bytes public oracleParams;
    bool public resolutionRequested;

    event ResolutionRequested(PredictionTypes.OracleType oracleType, bytes oracleParams);
    event ManualResolutionSubmitted(uint8 indexed winningOutcome);
    event ChainlinkResolutionSubmitted(uint8 indexed winningOutcome, int256 answer);

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
        _initializeOwner(initialOwner);
        require(marketAddress != address(0), "ZERO_MARKET");
        require(feeRecipientAddress != address(0), "ZERO_FEE_RECIPIENT");
        market = marketAddress;
        manualResolver = manualResolverAddress;
        feeRecipient = feeRecipientAddress;
        oracleType = resolverType;
        oracleAddress = externalOracle;
        oracleParams = params;
    }

    function requestResolution() external whenNotPaused {
        require(block.timestamp >= IPredictionMarket(market).resolvesAt(), "TOO_EARLY");
        require(!IPredictionMarket(market).resolved(), "ALREADY_RESOLVED");

        resolutionRequested = true;
        emit ResolutionRequested(oracleType, oracleParams);

        if (oracleType == PredictionTypes.OracleType.Chainlink) {
            _resolveChainlink();
        }
    }

    function resolveManual(uint8 winningOutcome) external whenNotPaused {
        require(oracleType == PredictionTypes.OracleType.Manual, "NOT_MANUAL");
        require(msg.sender == manualResolver || msg.sender == owner, "NOT_AUTHORIZED");
        IPredictionMarket(market).resolveMarket(winningOutcome);
        emit ManualResolutionSubmitted(winningOutcome);
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

        IPredictionMarket(market).resolveMarket(winningOutcome);
        emit ChainlinkResolutionSubmitted(winningOutcome, answer);
    }
}
