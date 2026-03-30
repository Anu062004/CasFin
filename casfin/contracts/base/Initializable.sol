// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

abstract contract Initializable {
    bool private _initialized;

    modifier initializer() {
        require(!_initialized, "INITIALIZED");
        _;
        _initialized = true;
    }

    function _disableInitializers() internal {
        require(!_initialized, "INITIALIZED");
        _initialized = true;
    }
}
