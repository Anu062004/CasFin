// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IVRFCoordinatorV2Plus} from "../interfaces/IVRFCoordinatorV2Plus.sol";
import {VRFV2PlusClientLib} from "../libraries/VRFV2PlusClientLib.sol";

interface IVRFConsumerMock {
    function rawFulfillRandomWords(uint256 requestId, uint256[] calldata randomWords) external;
}

contract MockVRFCoordinatorV2Plus is IVRFCoordinatorV2Plus {
    uint256 public nextRequestId;
    mapping(uint256 => address) public requesters;
    mapping(uint256 => VRFV2PlusClientLib.RandomWordsRequest) private requestData;

    event Requested(uint256 indexed requestId, address indexed requester);

    function requestRandomWords(VRFV2PlusClientLib.RandomWordsRequest calldata req) external returns (uint256 requestId) {
        requestId = nextRequestId++;
        requesters[requestId] = msg.sender;
        requestData[requestId] = req;
        emit Requested(requestId, msg.sender);
    }

    function fulfillRequest(uint256 requestId, uint256 randomWord) external {
        address requester = requesters[requestId];
        require(requester != address(0), "UNKNOWN_REQUEST");
        uint256[] memory words = new uint256[](1);
        words[0] = randomWord;
        IVRFConsumerMock(requester).rawFulfillRandomWords(requestId, words);
    }

    function getStoredRequest(uint256 requestId)
        external
        view
        returns (
            bytes32 keyHash,
            uint256 subId,
            uint16 requestConfirmations,
            uint32 callbackGasLimit,
            uint32 numWords,
            bytes memory extraArgs
        )
    {
        VRFV2PlusClientLib.RandomWordsRequest storage req = requestData[requestId];
        return (req.keyHash, req.subId, req.requestConfirmations, req.callbackGasLimit, req.numWords, req.extraArgs);
    }
}
