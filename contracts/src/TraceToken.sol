// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Verifier node staking token.
contract TraceToken is ERC20 {
    constructor(address holder, uint256 supply) ERC20("Trace", "TRACE") {
        _mint(holder, supply);
    }
}
