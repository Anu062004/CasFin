// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "../base/Ownable.sol";
import {Pausable} from "../base/Pausable.sol";

contract CasinoRandomnessRouter is Ownable, Pausable {
    struct RandomnessRequest {
        address requester;
        bytes32 context;
        uint256 randomWord;
        bool fulfilled;
    }

    uint256 public nextRequestId;
    mapping(uint256 => RandomnessRequest) public requests;
    mapping(address => bool) public authorizedGames;

    event GameAuthorizationUpdated(address indexed game, bool allowed);
    event RandomnessRequested(uint256 indexed requestId, address indexed requester, bytes32 indexed context);
    event RandomnessFulfilled(uint256 indexed requestId, uint256 randomWord);

    constructor(address initialOwner) {
        _initializeOwner(initialOwner);
    }

    modifier onlyGame() {
        require(authorizedGames[msg.sender], "NOT_AUTHORIZED_GAME");
        _;
    }

    function authorizeGame(address game, bool allowed) external onlyOwner {
        require(game != address(0), "ZERO_GAME");
        authorizedGames[game] = allowed;
        emit GameAuthorizationUpdated(game, allowed);
    }

    function requestRandomness(bytes32 context) external onlyGame whenNotPaused returns (uint256 requestId) {
        requestId = nextRequestId++;
        requests[requestId] = RandomnessRequest({
            requester: msg.sender,
            context: context,
            randomWord: 0,
            fulfilled: false
        });

        emit RandomnessRequested(requestId, msg.sender, context);
    }

    function fulfillRandomness(uint256 requestId, uint256 randomWord) external onlyOwner whenNotPaused {
        RandomnessRequest storage request = requests[requestId];
        require(request.requester != address(0), "UNKNOWN_REQUEST");
        require(!request.fulfilled, "ALREADY_FULFILLED");

        request.fulfilled = true;
        request.randomWord = randomWord;

        emit RandomnessFulfilled(requestId, randomWord);
    }

    function getRandomness(uint256 requestId) external view returns (uint256 randomWord, bool ready) {
        RandomnessRequest storage request = requests[requestId];
        return (request.randomWord, request.fulfilled);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
