// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {euint128} from "@fhenixprotocol/cofhe-contracts/FHE.sol";

interface IEncryptedCasinoVault {
    function reserveFunds(address player, euint128 encAmount) external returns (euint128);

    function settleBet(address player, euint128 lockedHandle, euint128 returnHandle) external;

    function authorizeGame(address game, bool allowed) external;

    function resolvePlayer(address caller) external view returns (address);

    function authorizeSessionKey(address sessionKey, uint256 durationSeconds) external;

    function revokeSessionKey(address sessionKey) external;
}
