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
    DealForge public dealForge;
    MockERC20 public token;

    address public owner = address(this);
    address public payer = address(0x1);
    address public worker = address(0x2);
    address public unauthorized = address(0x3);

    bytes32 public taskHash = keccak256("ipfs://QmTaskCID");
    bytes32 public resultHash = keccak256("ipfs://QmResultCID");
    uint256 public dealAmount = 1 ether;
    uint256 public deadline;

    function setUp() public {
        dealForge = new DealForge(owner);
        token = new MockERC20();
        deadline = block.timestamp + 1 days;

        vm.deal(payer, 100 ether);
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
        dealForge.submitResult(dealId, resultHash);

        DealForge.Deal memory deal = dealForge.getDeal(dealId);
        assertEq(deal.resultHash, resultHash);
        assertEq(uint256(deal.status), uint256(DealForge.DealStatus.SUBMITTED));
    }

    function test_submitResult_revertsIfNotWorker() public {
        uint256 dealId = _createAndAcceptDeal();

        vm.prank(unauthorized);
        vm.expectRevert("Only worker can submit");
        dealForge.submitResult(dealId, resultHash);
    }

    function test_submitResult_revertsIfNotActive() public {
        uint256 dealId = _createDeal();

        vm.prank(worker);
        vm.expectRevert("Deal not in ACTIVE status");
        dealForge.submitResult(dealId, resultHash);
    }

    function test_submitResult_revertsIfDeadlinePassed() public {
        uint256 dealId = _createAndAcceptDeal();

        vm.warp(deadline + 1);

        vm.prank(worker);
        vm.expectRevert("Deadline has passed");
        dealForge.submitResult(dealId, resultHash);
    }

    function test_submitResult_revertsIfResultHashEmpty() public {
        uint256 dealId = _createAndAcceptDeal();

        vm.prank(worker);
        vm.expectRevert("Result hash cannot be empty");
        dealForge.submitResult(dealId, bytes32(0));
    }

    // ═══════════════════ settleDeal ═══════════════════

    function _createAcceptSubmitDeal() internal returns (uint256) {
        uint256 dealId = _createAndAcceptDeal();
        vm.prank(worker);
        dealForge.submitResult(dealId, resultHash);
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
        vm.expectRevert("Only payer or owner can settle");
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
        vm.expectRevert("Only payer can dispute");
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
        dealForge.submitResult(dealId, resultHash);

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
        dealForge.submitResult(0, resultHash);
        vm.prank(payer);
        dealForge.settleDeal(0);

        assertEq(address(dealForge).balance, 2 ether);

        // Refund second deal
        vm.prank(payer);
        dealForge.refund(1);

        assertEq(address(dealForge).balance, 0);
    }

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
        dealForge.submitResult(dealId, resultHash);
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
