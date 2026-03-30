// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {VRFV2PlusClientLib} from "../libraries/VRFV2PlusClientLib.sol";

interface IVRFCoordinatorV2Plus {
    function requestRandomWords(VRFV2PlusClientLib.RandomWordsRequest calldata req) external returns (uint256 requestId);
}
