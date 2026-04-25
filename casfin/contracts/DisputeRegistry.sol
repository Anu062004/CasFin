// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "./base/Ownable.sol";
import {Pausable} from "./base/Pausable.sol";
import {Initializable} from "./base/Initializable.sol";
import {IPredictionMarket} from "./interfaces/IPredictionMarket.sol";

contract DisputeRegistry is Ownable, Pausable, Initializable {
    struct Dispute {
        address challenger;
        uint256 bond;
        bytes32 evidenceHash;
        bool active;
    }

    mapping(address => Dispute) public disputes;
    uint256 public minBond;

    event DisputeFiled(address indexed challenger, address indexed market, uint256 bond, bytes32 evidenceHash);
    event DisputeSettled(address indexed market, uint8 indexed finalOutcome, bool challengerWon);
    event MinBondUpdated(uint256 minBond);

    constructor() {
        _disableInitializers();
    }

    function initialize(address initialOwner, uint256 initialMinBond) external initializer {
        _initializeOwner(initialOwner);
        _setMinBond(initialMinBond);
    }

    function fileDispute(address market, bytes32 evidenceHash) external payable whenNotPaused {
        require(market != address(0), "ZERO_MARKET");
        require(msg.value >= minBond, "BOND_TOO_LOW");

        Dispute storage dispute = disputes[market];
        require(!dispute.active, "DISPUTE_ACTIVE");

        dispute.challenger = msg.sender;
        dispute.bond = msg.value;
        dispute.evidenceHash = evidenceHash;
        dispute.active = true;

        IPredictionMarket(market).markDisputed();

        emit DisputeFiled(msg.sender, market, msg.value, evidenceHash);
    }

    function setMinBond(uint256 newMinBond) external onlyOwner {
        _setMinBond(newMinBond);
    }

    function settleDispute(address market, uint8 finalOutcome, bool challengerWon) external onlyOwner whenNotPaused {
        Dispute memory dispute = disputes[market];
        require(dispute.active, "NO_ACTIVE_DISPUTE");

        delete disputes[market];

        IPredictionMarket(market).settleDispute(finalOutcome);

        address payable recipient = payable(challengerWon ? dispute.challenger : owner);
        if (dispute.bond > 0) {
            (bool ok,) = recipient.call{value: dispute.bond}("");
            require(ok, "BOND_TRANSFER_FAILED");
        }

        emit DisputeSettled(market, finalOutcome, challengerWon);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _setMinBond(uint256 newMinBond) internal {
        require(newMinBond > 0, "ZERO_MIN_BOND");
        minBond = newMinBond;
        emit MinBondUpdated(newMinBond);
    }

    receive() external payable {}
}
