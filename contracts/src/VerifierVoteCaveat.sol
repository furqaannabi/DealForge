// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./DealForge.sol";

/// @title VerifierVoteCaveat
/// @notice ERC-7715 caveat enforcer that verifies deal has passed verifier consensus.
contract VerifierVoteCaveat {
    DealForge public immutable dealForge;

    error VerifierNotApproved(uint256 dealId);

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
        if (!dealForge.verifierApproved(dealId)) revert VerifierNotApproved(dealId);
        return true;
    }
}
