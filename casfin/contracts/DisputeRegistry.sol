// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "./base/Ownable.sol";
import {Pausable} from "./base/Pausable.sol";
import {ReentrancyGuard} from "./base/ReentrancyGuard.sol";
import {Initializable} from "./base/Initializable.sol";
import {IPredictionMarket} from "./interfaces/IPredictionMarket.sol";

contract DisputeRegistry is Ownable, Pausable, ReentrancyGuard, Initializable {
    struct Dispute {
        address challenger;
        uint256 bond;
        bytes32 evidenceHash;
        bool active;
    }

    uint256 public minBond;
    mapping(address => Dispute) public disputes;

    event DisputeFiled(address indexed market, address indexed challenger, uint256 bond, bytes32 evidenceHash);
    event DisputeSettled(address indexed market, uint8 indexed finalOutcome, bool challengerWon);
    event MinBondUpdated(uint256 minBond);

    constructor() {
        _disableInitializers();
    }

    function initialize(address initialOwner, uint256 initialMinBond) external initializer {
        _initializeOwner(initialOwner);
        minBond = initialMinBond;
    }

    function fileDispute(address market, bytes32 evidenceHash) external payable nonReentrant whenNotPaused {
        require(market != address(0), "ZERO_MARKET");
        require(msg.value >= minBond, "BOND_TOO_LOW");
        require(!disputes[market].active, "DISPUTE_EXISTS");
        require(IPredictionMarket(market).resolved(), "NOT_RESOLVED");
        require(!IPredictionMarket(market).finalized(), "ALREADY_FINALIZED");

        disputes[market] = Dispute({
            challenger: msg.sender,
            bond: msg.value,
            evidenceHash: evidenceHash,
            active: true
        });

        IPredictionMarket(market).markDisputed();
        emit DisputeFiled(market, msg.sender, msg.value, evidenceHash);
    }

    function settleDispute(address market, uint8 finalOutcome, bool challengerWon) external onlyOwner nonReentrant {
        Dispute memory dispute = disputes[market];
        require(dispute.active, "NO_DISPUTE");
        delete disputes[market];

        IPredictionMarket(market).settleDispute(finalOutcome);

        address recipient = challengerWon ? dispute.challenger : owner;
        (bool ok,) = recipient.call{value: dispute.bond}("");
        require(ok, "BOND_TRANSFER_FAILED");

        emit DisputeSettled(market, finalOutcome, challengerWon);
    }

    function setMinBond(uint256 newMinBond) external onlyOwner {
        minBond = newMinBond;
        emit MinBondUpdated(newMinBond);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
