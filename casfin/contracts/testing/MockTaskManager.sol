// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {EncryptedInput, FunctionId, ITaskManager} from "@fhenixprotocol/cofhe-contracts/ICofhe.sol";

contract MockACL {
    mapping(uint256 => mapping(address => bool)) private allowed;
    mapping(uint256 => bool) private publiclyAllowed;

    function exists() external pure returns (bool) {
        return true;
    }

    function setAllowed(uint256 handle, address account, bool isAllowed_) external {
        allowed[handle][account] = isAllowed_;
    }

    function setPublicAllowed(uint256 handle, bool isAllowed_) external {
        publiclyAllowed[handle] = isAllowed_;
    }

    function isAllowed(uint256 handle, address account) external view returns (bool) {
        return publiclyAllowed[handle] || allowed[handle][account];
    }

    function isPubliclyAllowed(uint256 handle) external view returns (bool) {
        return publiclyAllowed[handle];
    }
}

contract MockTaskManager is ITaskManager {
    struct Ciphertext {
        uint256 value;
        uint8 utype;
        bool exists;
    }

    struct DecryptResult {
        uint256 value;
        bool ready;
    }

    address public owner;
    uint256 public nextHandle;
    MockACL public acl;

    mapping(uint256 => Ciphertext) private ciphertexts;
    mapping(uint256 => mapping(address => bool)) private permissions;
    mapping(uint256 => bool) private publicPermissions;
    mapping(uint256 => DecryptResult) private decryptResults;

    mapping(uint256 => uint256) public mockStorage;
    mapping(uint256 => bool) public inMockStorage;

    event TaskCreated(uint256 indexed handle, uint8 returnType, FunctionId indexed funcId);
    event DecryptTaskCreated(uint256 indexed handle, address indexed requestor);
    event DecryptResultPublished(uint256 indexed handle, uint256 result);

    modifier onlyOwner() {
        require(msg.sender == owner, "NOT_OWNER");
        _;
    }

    function initialize(address initialOwner) external {
        require(owner == address(0), "ALREADY_INITIALIZED");
        require(initialOwner != address(0), "ZERO_OWNER");
        owner = initialOwner;
        nextHandle = 1;
    }

    function exists() external pure returns (bool) {
        return true;
    }

    function setACLContract(address aclAddress) external onlyOwner {
        require(aclAddress != address(0), "ZERO_ACL");
        acl = MockACL(aclAddress);
    }

    function createTask(
        uint8 returnType,
        FunctionId funcId,
        uint256[] memory encryptedInputs,
        uint256[] memory extraInputs
    ) external returns (uint256) {
        uint256 result;

        if (funcId == FunctionId.trivialEncrypt) {
            require(extraInputs.length >= 1, "BAD_TRIVIAL_INPUTS");
            result = extraInputs[0];
        } else if (funcId == FunctionId.cast) {
            require(encryptedInputs.length == 1, "BAD_CAST_INPUTS");
            result = _valueOf(encryptedInputs[0]);
        } else if (funcId == FunctionId.select) {
            require(encryptedInputs.length == 3, "BAD_SELECT_INPUTS");
            result = _valueOf(encryptedInputs[0]) != 0 ? _valueOf(encryptedInputs[1]) : _valueOf(encryptedInputs[2]);
        } else {
            require(encryptedInputs.length == 2, "BAD_BINARY_INPUTS");
            uint256 lhs = _valueOf(encryptedInputs[0]);
            uint256 rhs = _valueOf(encryptedInputs[1]);

            if (funcId == FunctionId.add) {
                result = lhs + rhs;
            } else if (funcId == FunctionId.sub) {
                result = lhs - rhs;
            } else if (funcId == FunctionId.mul) {
                result = lhs * rhs;
            } else if (funcId == FunctionId.div) {
                result = rhs == 0 ? 0 : lhs / rhs;
            } else if (funcId == FunctionId.rem) {
                result = rhs == 0 ? 0 : lhs % rhs;
            } else if (funcId == FunctionId.and) {
                result = lhs & rhs;
            } else if (funcId == FunctionId.or) {
                result = lhs | rhs;
            } else if (funcId == FunctionId.xor) {
                result = lhs ^ rhs;
            } else if (funcId == FunctionId.eq) {
                result = lhs == rhs ? 1 : 0;
            } else if (funcId == FunctionId.ne) {
                result = lhs != rhs ? 1 : 0;
            } else if (funcId == FunctionId.gte) {
                result = lhs >= rhs ? 1 : 0;
            } else if (funcId == FunctionId.lte) {
                result = lhs <= rhs ? 1 : 0;
            } else if (funcId == FunctionId.lt) {
                result = lhs < rhs ? 1 : 0;
            } else if (funcId == FunctionId.gt) {
                result = lhs > rhs ? 1 : 0;
            } else {
                revert("UNSUPPORTED_FUNCTION");
            }
        }

        uint256 handle = _allocateHandle(returnType, result, msg.sender, false);
        emit TaskCreated(handle, returnType, funcId);
        return handle;
    }

    function createRandomTask(uint8 returnType, uint256 seed, int32) external returns (uint256) {
        uint256 randomValue = uint256(keccak256(abi.encodePacked(block.number, block.timestamp, msg.sender, seed, nextHandle)));
        uint256 handle = _allocateHandle(returnType, randomValue, msg.sender, false);
        emit TaskCreated(handle, returnType, FunctionId.random);
        return handle;
    }

    function createDecryptTask(uint256 ctHash, address requestor) external {
        _requireHandleExists(ctHash);
        decryptResults[ctHash] = DecryptResult({value: mockStorage[ctHash], ready: false});
        emit DecryptTaskCreated(ctHash, requestor);
    }

    function verifyInput(EncryptedInput memory input, address sender) external returns (uint256) {
        _requireHandleExists(input.ctHash);
        require(ciphertexts[input.ctHash].utype == input.utype, "BAD_INPUT_TYPE");
        _grant(input.ctHash, sender);
        _grant(input.ctHash, msg.sender);
        return input.ctHash;
    }

    function allow(uint256 ctHash, address account) external {
        _requireHandleExists(ctHash);
        _grant(ctHash, account);
    }

    function isAllowed(uint256 ctHash, address account) public view returns (bool) {
        return publicPermissions[ctHash] || permissions[ctHash][account];
    }

    function isPubliclyAllowed(uint256 ctHash) external view returns (bool) {
        return publicPermissions[ctHash];
    }

    function allowGlobal(uint256 ctHash) external {
        _requireHandleExists(ctHash);
        publicPermissions[ctHash] = true;
        if (address(acl) != address(0)) {
            acl.setPublicAllowed(ctHash, true);
        }
    }

    function allowTransient(uint256 ctHash, address account) external {
        _requireHandleExists(ctHash);
        _grant(ctHash, account);
    }

    function getDecryptResultSafe(uint256 ctHash) external view returns (uint256, bool) {
        DecryptResult storage result = decryptResults[ctHash];
        return (result.value, result.ready);
    }

    function getDecryptResult(uint256 ctHash) external view returns (uint256) {
        DecryptResult storage result = decryptResults[ctHash];
        require(result.ready, "DECRYPT_NOT_READY");
        return result.value;
    }

    function publishDecryptResult(uint256 ctHash, uint256 result, bytes calldata) external {
        _requireHandleExists(ctHash);
        decryptResults[ctHash] = DecryptResult({value: result, ready: true});
        mockStorage[ctHash] = _mask(ciphertexts[ctHash].utype, result);
        emit DecryptResultPublished(ctHash, result);
    }

    function publishDecryptResultBatch(
        uint256[] calldata ctHashes,
        uint256[] calldata results,
        bytes[] calldata signatures
    ) external {
        require(ctHashes.length == results.length && results.length == signatures.length, "BAD_BATCH_LENGTH");
        for (uint256 i = 0; i < ctHashes.length; i++) {
            this.publishDecryptResult(ctHashes[i], results[i], signatures[i]);
        }
    }

    function verifyDecryptResult(uint256 ctHash, uint256 result, bytes calldata) external view returns (bool) {
        if (!inMockStorage[ctHash]) {
            return false;
        }
        return mockStorage[ctHash] == _mask(ciphertexts[ctHash].utype, result);
    }

    function verifyDecryptResultSafe(uint256 ctHash, uint256 result, bytes calldata) external view returns (bool) {
        if (!inMockStorage[ctHash]) {
            return false;
        }
        return mockStorage[ctHash] == _mask(ciphertexts[ctHash].utype, result);
    }

    function verifyDecryptResultBatch(
        uint256[] calldata ctHashes,
        uint256[] calldata results,
        bytes[] calldata signatures
    ) external view returns (bool) {
        require(ctHashes.length == results.length && results.length == signatures.length, "BAD_BATCH_LENGTH");
        for (uint256 i = 0; i < ctHashes.length; i++) {
            if (!(inMockStorage[ctHashes[i]] && mockStorage[ctHashes[i]] == _mask(ciphertexts[ctHashes[i]].utype, results[i]))) {
                return false;
            }
        }
        return true;
    }

    function verifyDecryptResultBatchSafe(
        uint256[] calldata ctHashes,
        uint256[] calldata results,
        bytes[] calldata signatures
    ) external view returns (bool[] memory values) {
        require(ctHashes.length == results.length && results.length == signatures.length, "BAD_BATCH_LENGTH");
        values = new bool[](ctHashes.length);
        for (uint256 i = 0; i < ctHashes.length; i++) {
            values[i] = inMockStorage[ctHashes[i]] && mockStorage[ctHashes[i]] == _mask(ciphertexts[ctHashes[i]].utype, results[i]);
        }
    }

    function MOCK_encrypt(uint256 value, uint8 utype, address account, bool makePublic) external returns (uint256) {
        uint256 handle = _allocateHandle(utype, value, msg.sender, makePublic);
        _grant(handle, account);
        return handle;
    }

    function MOCK_resolveDecrypt(uint256 ctHash) external {
        _requireHandleExists(ctHash);
        decryptResults[ctHash] = DecryptResult({value: mockStorage[ctHash], ready: true});
        emit DecryptResultPublished(ctHash, mockStorage[ctHash]);
    }

    function MOCK_setHandleValue(uint256 ctHash, uint256 value) external {
        _requireHandleExists(ctHash);
        uint256 masked = _mask(ciphertexts[ctHash].utype, value);
        ciphertexts[ctHash].value = masked;
        mockStorage[ctHash] = masked;
        if (decryptResults[ctHash].ready || decryptResults[ctHash].value != 0) {
            decryptResults[ctHash].value = masked;
        }
    }

    function MOCK_setHandlePermission(uint256 ctHash, address account, bool isAllowed_) external {
        _requireHandleExists(ctHash);
        permissions[ctHash][account] = isAllowed_;
        if (address(acl) != address(0)) {
            acl.setAllowed(ctHash, account, isAllowed_);
        }
    }

    function _allocateHandle(uint8 utype, uint256 value, address creator, bool makePublic) internal returns (uint256 handle) {
        handle = nextHandle++;
        uint256 masked = _mask(utype, value);
        ciphertexts[handle] = Ciphertext({value: masked, utype: utype, exists: true});
        mockStorage[handle] = masked;
        inMockStorage[handle] = true;
        _grant(handle, creator);
        if (makePublic) {
            publicPermissions[handle] = true;
            if (address(acl) != address(0)) {
                acl.setPublicAllowed(handle, true);
            }
        }
    }

    function _grant(uint256 ctHash, address account) internal {
        permissions[ctHash][account] = true;
        if (address(acl) != address(0)) {
            acl.setAllowed(ctHash, account, true);
        }
    }

    function _valueOf(uint256 ctHash) internal view returns (uint256) {
        _requireHandleExists(ctHash);
        require(isAllowed(ctHash, msg.sender), "HANDLE_NOT_ALLOWED");
        return ciphertexts[ctHash].value;
    }

    function _requireHandleExists(uint256 ctHash) internal view {
        require(ciphertexts[ctHash].exists, "UNKNOWN_HANDLE");
    }

    function _mask(uint8 utype, uint256 value) internal pure returns (uint256) {
        if (utype == 0) {
            return value == 0 ? 0 : 1;
        }
        if (utype == 2) {
            return value & type(uint8).max;
        }
        if (utype == 3) {
            return value & type(uint16).max;
        }
        if (utype == 4) {
            return value & type(uint32).max;
        }
        if (utype == 5) {
            return value & type(uint64).max;
        }
        if (utype == 6) {
            return value & type(uint128).max;
        }
        return value;
    }
}
