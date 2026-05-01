// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "../base/Ownable.sol";
import {Pausable} from "../base/Pausable.sol";
import {ReentrancyGuard} from "../base/ReentrancyGuard.sol";
import {MathLib} from "../libraries/MathLib.sol";
import {IEncryptedCasinoVault} from "./IEncryptedCasinoVault.sol";
import {GameRandomnessLib} from "./GameRandomness.sol";
import {FHE, InEuint128, InEbool, TASK_MANAGER_ADDRESS, ebool, euint8, euint128} from "@fhenixprotocol/cofhe-contracts/FHE.sol";
import {ITaskManager} from "@fhenixprotocol/cofhe-contracts/ICofhe.sol";

contract EncryptedVideoPoker is Ownable, Pausable, ReentrancyGuard {
    enum GamePhase { NONE, DEALT, DRAWN, RESOLUTION_PENDING, RESOLVED }

    struct PokerGame {
        address player;
        euint128 lockedHandle;
        euint8[5] cards;
        euint8[5] finalCards;
        GamePhase phase;
        bool won;
        uint16 payoutMultiplier;
    }

    IEncryptedCasinoVault public immutable vault;
    uint16 public immutable houseEdgeBps;

    uint256 public nextGameId;
    mapping(uint256 => PokerGame) public games;
    mapping(address => bool) public authorizedResolvers;
    mapping(address => uint256) public latestGameIdByPlayer;

    euint128 private ENCRYPTED_ZERO;
    euint128 private ENCRYPTED_BPS_DENOMINATOR;
    euint128 private ENCRYPTED_NET_PAYOUT_BPS;

    event PokerDealt(uint256 indexed gameId, address indexed player);
    event PokerDrawn(uint256 indexed gameId, address indexed player);
    event PokerResolutionRequested(uint256 indexed gameId);
    event PokerResolved(uint256 indexed gameId, address indexed player, bool won, uint16 payoutMultiplier);

    constructor(address initialOwner, address vaultAddress, uint16 initialHouseEdgeBps) {
        require(vaultAddress != address(0), "ZERO_VAULT");
        require(initialHouseEdgeBps < MathLib.BPS_DENOMINATOR, "BAD_HOUSE_EDGE");

        _initializeOwner(initialOwner);
        vault = IEncryptedCasinoVault(vaultAddress);
        houseEdgeBps = initialHouseEdgeBps;

        ENCRYPTED_ZERO = FHE.asEuint128(0);
        FHE.allowThis(ENCRYPTED_ZERO);
        ENCRYPTED_BPS_DENOMINATOR = FHE.asEuint128(MathLib.BPS_DENOMINATOR);
        FHE.allowThis(ENCRYPTED_BPS_DENOMINATOR);
        ENCRYPTED_NET_PAYOUT_BPS = FHE.asEuint128(MathLib.BPS_DENOMINATOR - initialHouseEdgeBps);
        FHE.allowThis(ENCRYPTED_NET_PAYOUT_BPS);
    }

    modifier onlyResolver() {
        require(authorizedResolvers[msg.sender] || msg.sender == owner, "NOT_RESOLVER");
        _;
    }

    function deal(InEuint128 calldata encAmount)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 gameId)
    {
        euint128 requestedAmount = FHE.asEuint128(encAmount);
        FHE.allow(requestedAmount, address(vault));

        address player = vault.resolvePlayer(msg.sender);
        euint128 lockedHandle = vault.reserveFunds(player, requestedAmount);

        gameId = nextGameId++;
        PokerGame storage game = games[gameId];
        game.player = player;
        game.lockedHandle = lockedHandle;
        game.phase = GamePhase.DEALT;
        latestGameIdByPlayer[player] = gameId;

        FHE.allowThis(lockedHandle);

        for (uint256 i = 0; i < 5; i++) {
            euint8 card = GameRandomnessLib.randomCardIndex();
            FHE.allowThis(card);
            FHE.allowSender(card);
            game.cards[i] = card;
        }

        emit PokerDealt(gameId, msg.sender);
    }

    function draw(uint256 gameId, InEbool[5] calldata holds)
        external
        nonReentrant
        whenNotPaused
    {
        PokerGame storage game = games[gameId];
        require(game.player == msg.sender, "NOT_PLAYER");
        require(game.phase == GamePhase.DEALT, "NOT_DEALT");

        for (uint256 i = 0; i < 5; i++) {
            ebool holdFlag = FHE.asEbool(holds[i]);
            FHE.allowThis(holdFlag);

            euint8 replacement = GameRandomnessLib.randomCardIndex();
            FHE.allowThis(replacement);

            // Use FHE.select since holdFlag is an encrypted boolean.
            game.finalCards[i] = FHE.select(holdFlag, game.cards[i], replacement);
            FHE.allowThis(game.finalCards[i]);
            FHE.allowSender(game.finalCards[i]);
        }

        game.phase = GamePhase.DRAWN;
        emit PokerDrawn(gameId, msg.sender);
    }

    function requestResolution(uint256 gameId)
        external
        nonReentrant
        whenNotPaused
        onlyResolver
    {
        PokerGame storage game = games[gameId];
        require(game.player != address(0), "UNKNOWN_GAME");
        require(game.phase == GamePhase.DRAWN, "NOT_DRAWN");

        for (uint256 i = 0; i < 5; i++) {
            ITaskManager(TASK_MANAGER_ADDRESS).createDecryptTask(
                uint256(bytes32(euint8.unwrap(game.finalCards[i]))), address(this)
            );
        }

        game.phase = GamePhase.RESOLUTION_PENDING;
        emit PokerResolutionRequested(gameId);
    }

    function finalizeResolution(uint256 gameId)
        external
        nonReentrant
        whenNotPaused
        onlyResolver
    {
        PokerGame storage game = games[gameId];
        require(game.player != address(0), "UNKNOWN_GAME");
        require(game.phase == GamePhase.RESOLUTION_PENDING, "NOT_PENDING");

        uint8[5] memory revealed;
        for (uint256 i = 0; i < 5; i++) {
            (uint8 card, bool ready) = FHE.getDecryptResultSafe(game.finalCards[i]);
            require(ready, "CARD_PENDING");
            revealed[i] = card;
        }

        uint16 multiplier = _evaluateHand(revealed);

        euint128 payout;
        if (multiplier == 0) {
            payout = ENCRYPTED_ZERO;
        } else {
            euint128 encMultiplier = FHE.asEuint128(uint128(multiplier));
            FHE.allowThis(encMultiplier);
            euint128 gross = FHE.mul(game.lockedHandle, encMultiplier);
            FHE.allowThis(gross);
            payout = _applyHouseEdge(gross);
        }

        FHE.allow(payout, address(vault));
        vault.settleBet(game.player, game.lockedHandle, payout);

        game.phase = GamePhase.RESOLVED;
        game.won = multiplier > 0;
        game.payoutMultiplier = multiplier;

        emit PokerResolved(gameId, game.player, multiplier > 0, multiplier);
    }

    function _evaluateHand(uint8[5] memory cards) internal pure returns (uint16) {
        uint8[5] memory ranks;
        uint8[5] memory suits;
        for (uint256 i = 0; i < 5; i++) {
            ranks[i] = cards[i] % 13;
            suits[i] = cards[i] / 13;
        }

        // Bubble sort ranks ascending.
        for (uint256 i = 0; i < 4; i++) {
            for (uint256 j = 0; j < 4 - i; j++) {
                if (ranks[j] > ranks[j + 1]) {
                    uint8 tmp = ranks[j];
                    ranks[j] = ranks[j + 1];
                    ranks[j + 1] = tmp;
                }
            }
        }

        uint8[13] memory freq;
        for (uint256 i = 0; i < 5; i++) {
            freq[ranks[i]]++;
        }

        bool isFlush = (suits[0] == suits[1]) && (suits[1] == suits[2]) && (suits[2] == suits[3]) && (suits[3] == suits[4]);

        bool isStraight = (ranks[4] - ranks[0] == 4)
            && (ranks[1] == ranks[0] + 1)
            && (ranks[2] == ranks[0] + 2)
            && (ranks[3] == ranks[0] + 3);

        // Ace-low straight: 2,3,4,5,A → sorted ranks 0,1,2,3,12
        bool isAceLow = (ranks[0] == 0 && ranks[1] == 1 && ranks[2] == 2 && ranks[3] == 3 && ranks[4] == 12);
        if (isAceLow) isStraight = true;

        uint8 pairs;
        bool hasThree;
        bool hasFour;
        uint8 highPairRank;

        for (uint256 r = 0; r < 13; r++) {
            if (freq[r] == 2) {
                pairs++;
                highPairRank = uint8(r);
            } else if (freq[r] == 3) {
                hasThree = true;
            } else if (freq[r] == 4) {
                hasFour = true;
            }
        }

        if (isStraight && isFlush) {
            // Royal flush: 10,J,Q,K,A → lowest sorted rank = 8 (rank 8 = "10")
            if (!isAceLow && ranks[0] == 8) return 250;
            return 50;
        }
        if (hasFour) return 25;
        if (hasThree && pairs == 1) return 9;  // full house
        if (isFlush) return 6;
        if (isStraight) return 4;
        if (hasThree) return 3;
        if (pairs == 2) return 2;
        if (pairs == 1 && highPairRank >= 9) return 1;  // jacks or better (J=9,Q=10,K=11,A=12)
        return 0;
    }

    function _applyHouseEdge(euint128 grossReturn) internal returns (euint128) {
        euint128 netNumerator = FHE.mul(grossReturn, ENCRYPTED_NET_PAYOUT_BPS);
        FHE.allowThis(netNumerator);
        return FHE.div(netNumerator, ENCRYPTED_BPS_DENOMINATOR);
    }

    function getCardHandles(uint256 gameId) external view returns (bytes32[5] memory handles) {
        PokerGame storage game = games[gameId];
        for (uint256 i = 0; i < 5; i++) {
            handles[i] = euint8.unwrap(game.cards[i]);
        }
    }

    function getFinalCardHandles(uint256 gameId) external view returns (bytes32[5] memory handles) {
        PokerGame storage game = games[gameId];
        for (uint256 i = 0; i < 5; i++) {
            handles[i] = euint8.unwrap(game.finalCards[i]);
        }
    }

    function getGame(uint256 gameId) external view returns (
        address player,
        GamePhase phase,
        bool won,
        uint16 payoutMultiplier
    ) {
        PokerGame storage game = games[gameId];
        return (game.player, game.phase, game.won, game.payoutMultiplier);
    }

    function setResolver(address resolver, bool allowed) external onlyOwner {
        authorizedResolvers[resolver] = allowed;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
