// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "../base/Ownable.sol";
import {Pausable} from "../base/Pausable.sol";
import {ICasinoRandomnessRouter} from "../interfaces/ICasinoRandomnessRouter.sol";
import {IVRFCoordinatorV2Plus} from "../interfaces/IVRFCoordinatorV2Plus.sol";
import {VRFV2PlusClientLib} from "../libraries/VRFV2PlusClientLib.sol";

contract ChainlinkVRFAdapter is Ownable, Pausable, ICasinoRandomnessRouter {
    struct RandomnessRequest {
        address requester;
        bytes32 context;
        uint256 randomWord;
        bool fulfilled;
    }

    IVRFCoordinatorV2Plus public coordinator;
    bytes32 public keyHash;
    uint256 public subscriptionId;
    uint16 public requestConfirmations;
    uint32 public callbackGasLimit;
    uint32 public numWords;
    bool public nativePayment;

    mapping(address => bool) public authorizedGames;
    mapping(uint256 => RandomnessRequest) public requests;

    event GameAuthorizationUpdated(address indexed game, bool allowed);
    event CoordinatorConfigUpdated(
        address indexed coordinator,
        bytes32 keyHash,
        uint256 subscriptionId,
        uint16 requestConfirmations,
        uint32 callbackGasLimit,
        uint32 numWords,
        bool nativePayment
    );
    event RandomnessRequested(uint256 indexed requestId, address indexed requester, bytes32 indexed context);
    event RandomnessFulfilled(uint256 indexed requestId, uint256 randomWord);

    constructor(
        address initialOwner,
        address coordinatorAddress,
        bytes32 initialKeyHash,
        uint256 initialSubscriptionId,
        uint16 initialRequestConfirmations,
        uint32 initialCallbackGasLimit,
        uint32 initialNumWords,
        bool initialNativePayment
    ) {
        _initializeOwner(initialOwner);
        _setCoordinatorConfig(
            coordinatorAddress,
            initialKeyHash,
            initialSubscriptionId,
            initialRequestConfirmations,
            initialCallbackGasLimit,
            initialNumWords,
            initialNativePayment
        );
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

    function setCoordinatorConfig(
        address coordinatorAddress,
        bytes32 newKeyHash,
        uint256 newSubscriptionId,
        uint16 newRequestConfirmations,
        uint32 newCallbackGasLimit,
        uint32 newNumWords,
        bool newNativePayment
    ) external onlyOwner {
        _setCoordinatorConfig(
            coordinatorAddress,
            newKeyHash,
            newSubscriptionId,
            newRequestConfirmations,
            newCallbackGasLimit,
            newNumWords,
            newNativePayment
        );
    }

    function requestRandomness(bytes32 context) external onlyGame whenNotPaused returns (uint256 requestId) {
        VRFV2PlusClientLib.RandomWordsRequest memory req = VRFV2PlusClientLib.RandomWordsRequest({
            keyHash: keyHash,
            subId: subscriptionId,
            requestConfirmations: requestConfirmations,
            callbackGasLimit: callbackGasLimit,
            numWords: numWords,
            extraArgs: VRFV2PlusClientLib.argsToBytes(VRFV2PlusClientLib.ExtraArgsV1({nativePayment: nativePayment}))
        });

        requestId = coordinator.requestRandomWords(req);
        requests[requestId] = RandomnessRequest({
            requester: msg.sender,
            context: context,
            randomWord: 0,
            fulfilled: false
        });

        emit RandomnessRequested(requestId, msg.sender, context);
    }

    function rawFulfillRandomWords(uint256 requestId, uint256[] calldata randomWords) external {
        require(msg.sender == address(coordinator), "ONLY_COORDINATOR");
        require(randomWords.length > 0, "NO_RANDOM_WORDS");
        RandomnessRequest storage request = requests[requestId];
        require(request.requester != address(0), "UNKNOWN_REQUEST");
        require(!request.fulfilled, "ALREADY_FULFILLED");

        request.fulfilled = true;
        request.randomWord = randomWords[0];

        emit RandomnessFulfilled(requestId, randomWords[0]);
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

    function _setCoordinatorConfig(
        address coordinatorAddress,
        bytes32 newKeyHash,
        uint256 newSubscriptionId,
        uint16 newRequestConfirmations,
        uint32 newCallbackGasLimit,
        uint32 newNumWords,
        bool newNativePayment
    ) internal {
        require(coordinatorAddress != address(0), "ZERO_COORDINATOR");
        require(newRequestConfirmations > 0, "BAD_CONFIRMATIONS");
        require(newCallbackGasLimit > 0, "BAD_CALLBACK_GAS");
        require(newNumWords > 0, "BAD_NUM_WORDS");

        coordinator = IVRFCoordinatorV2Plus(coordinatorAddress);
        keyHash = newKeyHash;
        subscriptionId = newSubscriptionId;
        requestConfirmations = newRequestConfirmations;
        callbackGasLimit = newCallbackGasLimit;
        numWords = newNumWords;
        nativePayment = newNativePayment;

        emit CoordinatorConfigUpdated(
            coordinatorAddress,
            newKeyHash,
            newSubscriptionId,
            newRequestConfirmations,
            newCallbackGasLimit,
            newNumWords,
            newNativePayment
        );
    }
}
