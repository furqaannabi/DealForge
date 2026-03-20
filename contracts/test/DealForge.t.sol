// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/DealForge.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    constructor() ERC20("MockToken", "MTK") {
        _mint(msg.sender, 1_000_000 ether);
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract DealForgeTest is Test {
    receive() external payable {}

    DealForge public dealForge;
    MockERC20 public token;

    address public owner = address(this);
    address public payer = address(0x1);
    address public worker = address(0x2);
    address public unauthorized = address(0x3);
    address public verifier1 = address(0x4);
    address public verifier2 = address(0x5);
    address public verifier3 = address(0x6);

    bytes32 public taskHash = keccak256("ipfs://QmTaskCID");
    bytes32 public resultHash = keccak256("ipfs://QmResultCID");
    string public resultCid = "bafkreigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
    uint256 public dealAmount = 1 ether;
    uint256 public deadline;

    function setUp() public {
        dealForge = new DealForge(owner);
        token = new MockERC20();
        deadline = block.timestamp + 1 days;

        vm.deal(payer, 100 ether);
        vm.deal(verifier1, 10 ether);
        vm.deal(verifier2, 10 ether);
        vm.deal(verifier3, 10 ether);
        token.mint(payer, 1_000_000 ether);

        vm.prank(payer);
        token.approve(address(dealForge), type(uint256).max);
    }

    // ═══════════════════ createDeal ═══════════════════

    function test_createDeal_success() public {
        vm.prank(payer);
        uint256 dealId = dealForge.createDeal{value: dealAmount}(worker, deadline, taskHash);

        DealForge.Deal memory deal = dealForge.getDeal(dealId);
        assertEq(deal.id, 0);
        assertEq(deal.payer, payer);
        assertEq(deal.worker, worker);
        assertEq(deal.token, address(0));
        assertEq(deal.amount, dealAmount);
        assertEq(deal.deadline, deadline);
        assertEq(deal.taskHash, taskHash);
        assertEq(deal.resultHash, bytes32(0));
        assertEq(uint256(deal.status), uint256(DealForge.DealStatus.CREATED));
        assertEq(address(dealForge).balance, dealAmount);
    }

    function test_createDeal_revertsIfWorkerIsZeroAddress() public {
        vm.prank(payer);
        vm.expectRevert("Worker cannot be zero address");
        dealForge.createDeal{value: dealAmount}(address(0), deadline, taskHash);
    }

    function test_createDeal_revertsIfWorkerIsPayer() public {
        vm.prank(payer);
        vm.expectRevert("Worker cannot be payer");
        dealForge.createDeal{value: dealAmount}(payer, deadline, taskHash);
    }

    function test_createDeal_revertsIfDeadlineTooSoon() public {
        vm.prank(payer);
        vm.expectRevert("Deadline too soon");
        dealForge.createDeal{value: dealAmount}(worker, block.timestamp + 1 minutes, taskHash);
    }

    function test_createDeal_revertsIfNoValue() public {
        vm.prank(payer);
        vm.expectRevert("Must send ETH");
        dealForge.createDeal{value: 0}(worker, deadline, taskHash);
    }

    function test_createDeal_revertsIfTaskHashEmpty() public {
        vm.prank(payer);
        vm.expectRevert("Task hash cannot be empty");
        dealForge.createDeal{value: dealAmount}(worker, deadline, bytes32(0));
    }

    // ═══════════════════ createDealERC20 ═══════════════════

    function test_createDealERC20_success() public {
        vm.prank(payer);
        uint256 dealId = dealForge.createDealERC20(worker, deadline, taskHash, address(token), dealAmount);

        DealForge.Deal memory deal = dealForge.getDeal(dealId);
        assertEq(deal.token, address(token));
        assertEq(deal.amount, dealAmount);
        assertEq(uint256(deal.status), uint256(DealForge.DealStatus.CREATED));
        assertEq(token.balanceOf(address(dealForge)), dealAmount);
    }

    function test_createDealERC20_revertsIfTokenIsZero() public {
        vm.prank(payer);
        vm.expectRevert("Token cannot be zero address");
        dealForge.createDealERC20(worker, deadline, taskHash, address(0), dealAmount);
    }

    function test_createDealERC20_revertsIfAmountIsZero() public {
        vm.prank(payer);
        vm.expectRevert("Amount must be greater than zero");
        dealForge.createDealERC20(worker, deadline, taskHash, address(token), 0);
    }

    // ═══════════════════ acceptDeal ═══════════════════

    function _createDeal() internal returns (uint256) {
        vm.prank(payer);
        return dealForge.createDeal{value: dealAmount}(worker, deadline, taskHash);
    }

    function _createAndAcceptDeal() internal returns (uint256) {
        uint256 dealId = _createDeal();
        vm.prank(worker);
        dealForge.acceptDeal(dealId);
        return dealId;
    }

    function test_acceptDeal_success() public {
        uint256 dealId = _createDeal();

        vm.prank(worker);
        dealForge.acceptDeal(dealId);

        DealForge.Deal memory deal = dealForge.getDeal(dealId);
        assertEq(uint256(deal.status), uint256(DealForge.DealStatus.ACTIVE));
    }

    function test_acceptDeal_revertsIfNotWorker() public {
        uint256 dealId = _createDeal();

        vm.prank(unauthorized);
        vm.expectRevert("Only worker can accept");
        dealForge.acceptDeal(dealId);
    }

    function test_acceptDeal_revertsIfAlreadyActive() public {
        uint256 dealId = _createAndAcceptDeal();

        vm.prank(worker);
        vm.expectRevert("Deal not in CREATED status");
        dealForge.acceptDeal(dealId);
    }

    // ═══════════════════ submitResult ═══════════════════

    function test_submitResult_success() public {
        uint256 dealId = _createAndAcceptDeal();

        vm.prank(worker);
        dealForge.submitResult(dealId, resultHash, resultCid);

        DealForge.Deal memory deal = dealForge.getDeal(dealId);
        assertEq(deal.resultHash, resultHash);
        assertEq(uint256(deal.status), uint256(DealForge.DealStatus.SUBMITTED));
    }

    function test_submitResult_revertsIfNotWorker() public {
        uint256 dealId = _createAndAcceptDeal();

        vm.prank(unauthorized);
        vm.expectRevert("Only worker can submit");
        dealForge.submitResult(dealId, resultHash, resultCid);
    }

    function test_submitResult_revertsIfNotActive() public {
        uint256 dealId = _createDeal();

        vm.prank(worker);
        vm.expectRevert("Deal not in ACTIVE status");
        dealForge.submitResult(dealId, resultHash, resultCid);
    }

    function test_submitResult_revertsIfDeadlinePassed() public {
        uint256 dealId = _createAndAcceptDeal();

        vm.warp(deadline + 1);

        vm.prank(worker);
        vm.expectRevert("Deadline has passed");
        dealForge.submitResult(dealId, resultHash, resultCid);
    }

    function test_submitResult_revertsIfResultHashEmpty() public {
        uint256 dealId = _createAndAcceptDeal();

        vm.prank(worker);
        vm.expectRevert("Result hash cannot be empty");
        dealForge.submitResult(dealId, bytes32(0), resultCid);
    }

    function test_submitResult_revertsIfIpfsCidEmpty() public {
        uint256 dealId = _createAndAcceptDeal();

        vm.prank(worker);
        vm.expectRevert("IPFS CID cannot be empty");
        dealForge.submitResult(dealId, resultHash, "");
    }

    function test_submitResult_storesIpfsCid() public {
        uint256 dealId = _createAndAcceptDeal();

        vm.prank(worker);
        dealForge.submitResult(dealId, resultHash, resultCid);

        assertEq(dealForge.getIpfsCid(dealId), resultCid);
    }

    // ═══════════════════ settleDeal ═══════════════════

    function _createAcceptSubmitDeal() internal returns (uint256) {
        uint256 dealId = _createAndAcceptDeal();
        vm.prank(worker);
        dealForge.submitResult(dealId, resultHash, resultCid);
        return dealId;
    }

    function test_settleDeal_success_byPayer() public {
        uint256 dealId = _createAcceptSubmitDeal();
        uint256 workerBalBefore = worker.balance;

        vm.prank(payer);
        dealForge.settleDeal(dealId);

        DealForge.Deal memory deal = dealForge.getDeal(dealId);
        assertEq(uint256(deal.status), uint256(DealForge.DealStatus.SETTLED));
        assertEq(worker.balance, workerBalBefore + dealAmount);
    }

    function test_settleDeal_success_byOwner() public {
        uint256 dealId = _createAcceptSubmitDeal();
        uint256 workerBalBefore = worker.balance;

        vm.prank(owner);
        dealForge.settleDeal(dealId);

        DealForge.Deal memory deal = dealForge.getDeal(dealId);
        assertEq(uint256(deal.status), uint256(DealForge.DealStatus.SETTLED));
        assertEq(worker.balance, workerBalBefore + dealAmount);
    }

    function test_settleDeal_revertsIfNotSubmitted() public {
        uint256 dealId = _createAndAcceptDeal();

        vm.prank(payer);
        vm.expectRevert("Deal not in SUBMITTED status");
        dealForge.settleDeal(dealId);
    }

    function test_settleDeal_revertsIfUnauthorized() public {
        uint256 dealId = _createAcceptSubmitDeal();

        vm.prank(unauthorized);
        vm.expectRevert("Only payer, owner, delegationManager, or staked verifier can settle");
        dealForge.settleDeal(dealId);
    }

    // ═══════════════════ refund ═══════════════════

    function test_refund_success_fromCreated() public {
        uint256 dealId = _createDeal();
        uint256 payerBalBefore = payer.balance;

        vm.prank(payer);
        dealForge.refund(dealId);

        DealForge.Deal memory deal = dealForge.getDeal(dealId);
        assertEq(uint256(deal.status), uint256(DealForge.DealStatus.REFUNDED));
        assertEq(payer.balance, payerBalBefore + dealAmount);
    }

    function test_refund_success_fromActiveAfterDeadline() public {
        uint256 dealId = _createAndAcceptDeal();

        vm.warp(deadline + 1);

        uint256 payerBalBefore = payer.balance;
        vm.prank(payer);
        dealForge.refund(dealId);

        DealForge.Deal memory deal = dealForge.getDeal(dealId);
        assertEq(uint256(deal.status), uint256(DealForge.DealStatus.REFUNDED));
        assertEq(payer.balance, payerBalBefore + dealAmount);
    }

    function test_refund_revertsIfActiveBeforeDeadline() public {
        uint256 dealId = _createAndAcceptDeal();

        vm.prank(payer);
        vm.expectRevert("Deadline has not passed");
        dealForge.refund(dealId);
    }

    function test_refund_revertsIfUnauthorized() public {
        uint256 dealId = _createDeal();

        vm.prank(unauthorized);
        vm.expectRevert("Only payer can refund");
        dealForge.refund(dealId);
    }

    // ═══════════════════ raiseDispute ═══════════════════

    function test_raiseDispute_success() public {
        uint256 dealId = _createAcceptSubmitDeal();

        vm.prank(payer);
        dealForge.raiseDispute(dealId);

        DealForge.Deal memory deal = dealForge.getDeal(dealId);
        assertEq(uint256(deal.status), uint256(DealForge.DealStatus.DISPUTED));
    }

    function test_raiseDispute_revertsIfOutsideWindow() public {
        uint256 dealId = _createAcceptSubmitDeal();

        vm.warp(block.timestamp + 48 hours + 1);

        vm.prank(payer);
        vm.expectRevert("Dispute window has passed");
        dealForge.raiseDispute(dealId);
    }

    function test_raiseDispute_revertsIfNotPayer() public {
        uint256 dealId = _createAcceptSubmitDeal();

        vm.prank(unauthorized);
        vm.expectRevert("Only payer or staked verifier can dispute");
        dealForge.raiseDispute(dealId);
    }

    // ═══════════════════ resolveDispute ═══════════════════

    function _createDisputedDeal() internal returns (uint256) {
        uint256 dealId = _createAcceptSubmitDeal();
        vm.prank(payer);
        dealForge.raiseDispute(dealId);
        return dealId;
    }

    function test_resolveDispute_payWorker() public {
        uint256 dealId = _createDisputedDeal();
        uint256 workerBalBefore = worker.balance;

        vm.prank(owner);
        dealForge.resolveDispute(dealId, true);

        DealForge.Deal memory deal = dealForge.getDeal(dealId);
        assertEq(uint256(deal.status), uint256(DealForge.DealStatus.SETTLED));
        assertEq(worker.balance, workerBalBefore + dealAmount);
    }

    function test_resolveDispute_refundPayer() public {
        uint256 dealId = _createDisputedDeal();
        uint256 payerBalBefore = payer.balance;

        vm.prank(owner);
        dealForge.resolveDispute(dealId, false);

        DealForge.Deal memory deal = dealForge.getDeal(dealId);
        assertEq(uint256(deal.status), uint256(DealForge.DealStatus.REFUNDED));
        assertEq(payer.balance, payerBalBefore + dealAmount);
    }

    function test_resolveDispute_revertsIfNotOwner() public {
        uint256 dealId = _createDisputedDeal();

        vm.prank(unauthorized);
        vm.expectRevert();
        dealForge.resolveDispute(dealId, true);
    }

    // ═══════════════════ View Functions ═══════════════════

    function test_getDealsForPayer() public {
        _createDeal();
        _createDeal();

        uint256[] memory ids = dealForge.getDealsForPayer(payer);
        assertEq(ids.length, 2);
        assertEq(ids[0], 0);
        assertEq(ids[1], 1);
    }

    function test_getDealsForWorker() public {
        _createDeal();

        uint256[] memory ids = dealForge.getDealsForWorker(worker);
        assertEq(ids.length, 1);
        assertEq(ids[0], 0);
    }

    // ═══════════════════ Fuzz Tests ═══════════════════

    function testFuzz_createDeal_anyValidAmount(uint256 amount) public {
        amount = bound(amount, 1, 100 ether);
        vm.deal(payer, amount);

        vm.prank(payer);
        uint256 dealId = dealForge.createDeal{value: amount}(worker, deadline, taskHash);

        DealForge.Deal memory deal = dealForge.getDeal(dealId);
        assertEq(deal.amount, amount);
        assertEq(address(dealForge).balance, amount);
    }

    function testFuzz_deadlineEdgeCases(uint256 deadlineOffset) public {
        deadlineOffset = bound(deadlineOffset, 5 minutes, 365 days);
        uint256 fuzzDeadline = block.timestamp + deadlineOffset;

        vm.prank(payer);
        uint256 dealId = dealForge.createDeal{value: dealAmount}(worker, fuzzDeadline, taskHash);

        DealForge.Deal memory deal = dealForge.getDeal(dealId);
        assertEq(deal.deadline, fuzzDeadline);
    }

    // ═══════════════════ ERC20 Settlement ═══════════════════

    function test_settleDeal_ERC20() public {
        vm.prank(payer);
        uint256 dealId = dealForge.createDealERC20(worker, deadline, taskHash, address(token), dealAmount);

        vm.prank(worker);
        dealForge.acceptDeal(dealId);

        vm.prank(worker);
        dealForge.submitResult(dealId, resultHash, resultCid);

        uint256 workerBalBefore = token.balanceOf(worker);
        vm.prank(payer);
        dealForge.settleDeal(dealId);

        assertEq(token.balanceOf(worker), workerBalBefore + dealAmount);
    }

    function test_refund_ERC20() public {
        vm.prank(payer);
        uint256 dealId = dealForge.createDealERC20(worker, deadline, taskHash, address(token), dealAmount);

        uint256 payerBalBefore = token.balanceOf(payer);
        vm.prank(payer);
        dealForge.refund(dealId);

        assertEq(token.balanceOf(payer), payerBalBefore + dealAmount);
    }

    // ═══════════════════ Invariant: Escrow Balance ═══════════════════

    function test_invariant_ethBalanceMatchesEscrows() public {
        // Create two deals
        vm.prank(payer);
        dealForge.createDeal{value: 1 ether}(worker, deadline, taskHash);
        vm.prank(payer);
        dealForge.createDeal{value: 2 ether}(worker, deadline, taskHash);

        assertEq(address(dealForge).balance, 3 ether);

        // Settle first deal
        vm.prank(worker);
        dealForge.acceptDeal(0);
        vm.prank(worker);
        dealForge.submitResult(0, resultHash, resultCid);
        vm.prank(payer);
        dealForge.settleDeal(0);

        assertEq(address(dealForge).balance, 2 ether);

        // Refund second deal
        vm.prank(payer);
        dealForge.refund(1);

        assertEq(address(dealForge).balance, 0);
    }

    // ═══════════════════ stakeVerifier ═══════════════════

    function test_stakeVerifier_success() public {
        vm.prank(verifier1);
        dealForge.stakeVerifier{value: 0.01 ether}();

        assertTrue(dealForge.isVerifier(verifier1));
        assertEq(dealForge.verifierStakes(verifier1), 0.01 ether);
    }

    function test_stakeVerifier_additionalStake() public {
        vm.prank(verifier1);
        dealForge.stakeVerifier{value: 0.01 ether}();

        vm.prank(verifier1);
        dealForge.stakeVerifier{value: 0.05 ether}();

        assertEq(dealForge.verifierStakes(verifier1), 0.06 ether);
    }

    function test_stakeVerifier_revertsIfInsufficientStake() public {
        vm.prank(verifier1);
        vm.expectRevert(DealForge.InsufficientStake.selector);
        dealForge.stakeVerifier{value: 0.001 ether}();
    }

    // ═══════════════════ unstakeVerifier ═══════════════════

    function test_unstakeVerifier_success() public {
        vm.prank(verifier1);
        dealForge.stakeVerifier{value: 0.1 ether}();

        uint256 balBefore = verifier1.balance;
        vm.prank(verifier1);
        dealForge.unstakeVerifier();

        assertEq(verifier1.balance, balBefore + 0.1 ether);
        assertFalse(dealForge.isVerifier(verifier1));
    }

    function test_unstakeVerifier_revertsIfNotVerifier() public {
        vm.prank(verifier1);
        vm.expectRevert(DealForge.NotAVerifier.selector);
        dealForge.unstakeVerifier();
    }

    // ═══════════════════ vote ═══════════════════

    function _stakeVerifiers() internal {
        vm.prank(verifier1);
        dealForge.stakeVerifier{value: 0.1 ether}();
        vm.prank(verifier2);
        dealForge.stakeVerifier{value: 0.1 ether}();
        vm.prank(verifier3);
        dealForge.stakeVerifier{value: 0.1 ether}();
    }

    function test_vote_accept_consensus_settles() public {
        uint256 dealId = _createAcceptSubmitDeal();
        _stakeVerifiers();

        uint256 workerBalBefore = worker.balance;

        vm.prank(verifier1);
        dealForge.vote(dealId, true);
        vm.prank(verifier2);
        dealForge.vote(dealId, true);
        vm.prank(verifier3);
        dealForge.vote(dealId, true);

        DealForge.Deal memory deal = dealForge.getDeal(dealId);
        assertEq(uint256(deal.status), uint256(DealForge.DealStatus.SETTLED));
        assertEq(worker.balance, workerBalBefore + dealAmount);

        (uint256 acceptCount, uint256 rejectCount) = dealForge.getVotes(dealId);
        assertEq(acceptCount, 3);
        assertEq(rejectCount, 0);
    }

    function test_vote_reject_consensus_disputes() public {
        uint256 dealId = _createAcceptSubmitDeal();
        _stakeVerifiers();

        vm.prank(verifier1);
        dealForge.vote(dealId, false);
        vm.prank(verifier2);
        dealForge.vote(dealId, false);
        vm.prank(verifier3);
        dealForge.vote(dealId, false);

        DealForge.Deal memory deal = dealForge.getDeal(dealId);
        assertEq(uint256(deal.status), uint256(DealForge.DealStatus.DISPUTED));

        (uint256 acceptCount, uint256 rejectCount) = dealForge.getVotes(dealId);
        assertEq(acceptCount, 0);
        assertEq(rejectCount, 3);
    }

    function test_vote_revertsIfNotVerifier() public {
        uint256 dealId = _createAcceptSubmitDeal();

        vm.prank(unauthorized);
        vm.expectRevert(DealForge.NotAVerifier.selector);
        dealForge.vote(dealId, true);
    }

    function test_vote_revertsIfAlreadyVoted() public {
        uint256 dealId = _createAcceptSubmitDeal();
        _stakeVerifiers();

        vm.prank(verifier1);
        dealForge.vote(dealId, true);

        vm.prank(verifier1);
        vm.expectRevert(DealForge.AlreadyVoted.selector);
        dealForge.vote(dealId, true);
    }

    function test_vote_revertsIfDealNotSubmitted() public {
        uint256 dealId = _createAndAcceptDeal();
        _stakeVerifiers();

        vm.prank(verifier1);
        vm.expectRevert(DealForge.DealNotSubmitted.selector);
        dealForge.vote(dealId, true);
    }

    // ═══════════════════ slashVerifier ═══════════════════

    function test_slashVerifier_success() public {
        vm.prank(verifier1);
        dealForge.stakeVerifier{value: 0.1 ether}();

        uint256 ownerBalBefore = owner.balance;
        vm.prank(owner);
        dealForge.slashVerifier(verifier1, "dishonest vote");

        assertEq(dealForge.verifierStakes(verifier1), 0);
        assertEq(owner.balance, ownerBalBefore + 0.1 ether);
    }

    function test_slashVerifier_revertsIfNotOwner() public {
        vm.prank(verifier1);
        dealForge.stakeVerifier{value: 0.1 ether}();

        vm.prank(unauthorized);
        vm.expectRevert();
        dealForge.slashVerifier(verifier1, "reason");
    }

    function test_slashVerifier_revertsIfNotVerifier() public {
        vm.prank(owner);
        vm.expectRevert(DealForge.NotAVerifier.selector);
        dealForge.slashVerifier(unauthorized, "reason");
    }

    // ═══════════════════ setRequiredVotes ═══════════════════

    function test_setRequiredVotes_success() public {
        vm.prank(owner);
        dealForge.setRequiredVotes(5);

        assertEq(dealForge.requiredVotes(), 5);
    }

    function test_setRequiredVotes_revertsIfZero() public {
        vm.prank(owner);
        vm.expectRevert("Must require at least 1 vote");
        dealForge.setRequiredVotes(0);
    }

    function test_setRequiredVotes_revertsIfNotOwner() public {
        vm.prank(unauthorized);
        vm.expectRevert();
        dealForge.setRequiredVotes(5);
    }

    // ═══════════════════ settleDeal by verifier ═══════════════════

    function test_settleDeal_success_byVerifier() public {
        uint256 dealId = _createAcceptSubmitDeal();
        uint256 workerBalBefore = worker.balance;

        vm.prank(verifier1);
        dealForge.stakeVerifier{value: 0.1 ether}();

        vm.prank(verifier1);
        dealForge.settleDeal(dealId);

        DealForge.Deal memory deal = dealForge.getDeal(dealId);
        assertEq(uint256(deal.status), uint256(DealForge.DealStatus.SETTLED));
        assertEq(worker.balance, workerBalBefore + dealAmount);
    }

    // ═══════════════════ raiseDispute by verifier ═══════════════════

    function test_raiseDispute_success_byVerifier() public {
        uint256 dealId = _createAcceptSubmitDeal();

        vm.prank(verifier1);
        dealForge.stakeVerifier{value: 0.1 ether}();

        vm.prank(verifier1);
        dealForge.raiseDispute(dealId);

        DealForge.Deal memory deal = dealForge.getDeal(dealId);
        assertEq(uint256(deal.status), uint256(DealForge.DealStatus.DISPUTED));
    }

    // ═══════════════════ View: isVerifier / getVotes ═══════════════════

    function test_isVerifier_returnsFalseForNonVerifier() public view {
        assertFalse(dealForge.isVerifier(unauthorized));
    }

    function test_getVotes_returnsZeroForNewDeal() public {
        uint256 dealId = _createDeal();
        (uint256 acceptCount, uint256 rejectCount) = dealForge.getVotes(dealId);
        assertEq(acceptCount, 0);
        assertEq(rejectCount, 0);
    }

    // ═══════════════════ Consensus with custom threshold ═══════════════════

    function test_vote_consensus_withCustomThreshold() public {
        vm.prank(owner);
        dealForge.setRequiredVotes(1);

        uint256 dealId = _createAcceptSubmitDeal();

        vm.prank(verifier1);
        dealForge.stakeVerifier{value: 0.1 ether}();

        uint256 workerBalBefore = worker.balance;
        vm.prank(verifier1);
        dealForge.vote(dealId, true);

        DealForge.Deal memory deal = dealForge.getDeal(dealId);
        assertEq(uint256(deal.status), uint256(DealForge.DealStatus.SETTLED));
        assertEq(worker.balance, workerBalBefore + dealAmount);
    }

    // ═══════════════════ Existing Invariant Tests ═══════════════════

    function test_invariant_statusOnlyMovesForward() public {
        uint256 dealId = _createDeal();

        // CREATED -> ACTIVE
        vm.prank(worker);
        dealForge.acceptDeal(dealId);
        assertEq(uint256(dealForge.getDeal(dealId).status), uint256(DealForge.DealStatus.ACTIVE));

        // Cannot go back to CREATED
        vm.prank(worker);
        vm.expectRevert("Deal not in CREATED status");
        dealForge.acceptDeal(dealId);

        // ACTIVE -> SUBMITTED
        vm.prank(worker);
        dealForge.submitResult(dealId, resultHash, resultCid);
        assertEq(uint256(dealForge.getDeal(dealId).status), uint256(DealForge.DealStatus.SUBMITTED));

        // SUBMITTED -> SETTLED
        vm.prank(payer);
        dealForge.settleDeal(dealId);
        assertEq(uint256(dealForge.getDeal(dealId).status), uint256(DealForge.DealStatus.SETTLED));

        // Cannot refund a settled deal
        vm.prank(payer);
        vm.expectRevert("Invalid status for refund");
        dealForge.refund(dealId);
    }
}
