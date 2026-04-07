// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library PredictionTypes {
    enum OracleType {
        Manual,
        Chainlink,
        Pyth
    }

    struct FeeConfig {
        uint16 platformFeeBps;
        uint16 lpFeeBps;
        uint16 resolverFeeBps;
    }

    struct CreateMarketParams {
        string question;
        string description;
        string[] outcomes;
        uint256 resolvesAt;
        uint256 disputeWindowSecs;
        OracleType oracleType;
        address oracleAddress;
        bytes oracleParams;
        uint256 initialLiquidity;
    }
}
