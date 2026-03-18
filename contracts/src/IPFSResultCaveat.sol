// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./DealForge.sol";

/// @title IPFSResultCaveat
/// @notice ERC-7715 caveat enforcer that verifies a worker has submitted a result hash for a deal.
contract IPFSResultCaveat {
    DealForge public immutable dealForge;

    error ResultNotSubmitted(uint256 dealId);

    constructor(address _dealForge) {
        dealForge = DealForge(payable(_dealForge));
    }

    /// @notice Called by DelegationManager before releasing funds.
    /// @param terms ABI-encoded uint256 dealId.
    function enforceCaveat(
        bytes calldata terms,
        bytes calldata,
        bytes32
    ) external view returns (bool) {
        uint256 dealId = abi.decode(terms, (uint256));
        (, , , , , , , bytes32 resultHash, , ,) = dealForge.deals(dealId);
        if (resultHash == bytes32(0)) revert ResultNotSubmitted(dealId);
        return true;
    }
}
