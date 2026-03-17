// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract DealForge is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // ──────────────────── Enums ────────────────────
    enum DealStatus {
        CREATED,
        ACTIVE,
        SUBMITTED,
        SETTLED,
        DISPUTED,
        REFUNDED
    }

    // ──────────────────── Structs ────────────────────
    struct Deal {
        uint256 id;
        address payer;
        address worker;
        address token;
        uint256 amount;
        uint256 deadline;
        bytes32 taskHash;
        bytes32 resultHash;
        DealStatus status;
        uint256 createdAt;
        uint256 submittedAt;
    }

    // ──────────────────── Constants ────────────────────
    uint256 public constant MIN_DEADLINE_BUFFER = 5 minutes;
    uint256 public constant DISPUTE_WINDOW = 48 hours;
    uint256 public constant MIN_VERIFIER_STAKE = 0.01 ether;

    // ──────────────────── State ────────────────────
    uint256 public dealCounter;
    uint256 public requiredVotes = 3;
    mapping(uint256 => Deal) public deals;
    mapping(address => uint256[]) private _payerDeals;
    mapping(address => uint256[]) private _workerDeals;

    // Verifier state
    mapping(address => uint256) public verifierStakes;
    mapping(uint256 => mapping(address => bool)) public hasVoted;
    mapping(uint256 => uint256) public acceptVotes;
    mapping(uint256 => uint256) public rejectVotes;

    // ──────────────────── Events ────────────────────
    event DealCreated(
        uint256 indexed dealId,
        address indexed payer,
        address indexed worker,
        address token,
        uint256 amount,
        uint256 deadline,
        bytes32 taskHash
    );
    event DealAccepted(uint256 indexed dealId, uint256 activationTime);
    event ResultSubmitted(uint256 indexed dealId, bytes32 resultHash, uint256 submittedAt);
    event DealSettled(uint256 indexed dealId, address recipient, uint256 payout);
    event DealRefunded(uint256 indexed dealId, address recipient, uint256 refundAmount);
    event DisputeRaised(uint256 indexed dealId, address initiator, uint256 raisedAt);
    event DisputeResolved(uint256 indexed dealId, bool paidWorker);
    event VerifierStaked(address indexed verifier, uint256 amount);
    event VerifierUnstaked(address indexed verifier, uint256 amount);
    event VerifierSlashed(address indexed verifier, uint256 amount, string reason);
    event VoteCast(uint256 indexed dealId, address indexed verifier, bool accept);
    event ConsensusReached(uint256 indexed dealId, bool settled);
    event RequiredVotesUpdated(uint256 oldValue, uint256 newValue);

    // ──────────────────── Errors ────────────────────
    error NotAVerifier();
    error AlreadyVoted();
    error InsufficientStake();
    error DealNotSubmitted();
    error ConsensusAlreadyMet();

    // ──────────────────── Constructor ────────────────────
    constructor(address initialOwner) Ownable(initialOwner) {}

    // ──────────────────── Core Functions ────────────────────

    function createDeal(
        address worker,
        uint256 deadline,
        bytes32 taskHash
    ) external payable returns (uint256) {
        require(worker != address(0), "Worker cannot be zero address");
        require(worker != msg.sender, "Worker cannot be payer");
        require(deadline >= block.timestamp + MIN_DEADLINE_BUFFER, "Deadline too soon");
        require(taskHash != bytes32(0), "Task hash cannot be empty");
        require(msg.value > 0, "Must send ETH");

        uint256 dealId = dealCounter++;
        deals[dealId] = Deal({
            id: dealId,
            payer: msg.sender,
            worker: worker,
            token: address(0),
            amount: msg.value,
            deadline: deadline,
            taskHash: taskHash,
            resultHash: bytes32(0),
            status: DealStatus.CREATED,
            createdAt: block.timestamp,
            submittedAt: 0
        });

        _payerDeals[msg.sender].push(dealId);
        _workerDeals[worker].push(dealId);

        emit DealCreated(dealId, msg.sender, worker, address(0), msg.value, deadline, taskHash);
        return dealId;
    }

    function createDealERC20(
        address worker,
        uint256 deadline,
        bytes32 taskHash,
        address token,
        uint256 amount
    ) external returns (uint256) {
        require(worker != address(0), "Worker cannot be zero address");
        require(worker != msg.sender, "Worker cannot be payer");
        require(deadline >= block.timestamp + MIN_DEADLINE_BUFFER, "Deadline too soon");
        require(taskHash != bytes32(0), "Task hash cannot be empty");
        require(token != address(0), "Token cannot be zero address");
        require(amount > 0, "Amount must be greater than zero");

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        uint256 dealId = dealCounter++;
        deals[dealId] = Deal({
            id: dealId,
            payer: msg.sender,
            worker: worker,
            token: token,
            amount: amount,
            deadline: deadline,
            taskHash: taskHash,
            resultHash: bytes32(0),
            status: DealStatus.CREATED,
            createdAt: block.timestamp,
            submittedAt: 0
        });

        _payerDeals[msg.sender].push(dealId);
        _workerDeals[worker].push(dealId);

        emit DealCreated(dealId, msg.sender, worker, token, amount, deadline, taskHash);
        return dealId;
    }

    function acceptDeal(uint256 dealId) external {
        Deal storage deal = deals[dealId];
        require(msg.sender == deal.worker, "Only worker can accept");
        require(deal.status == DealStatus.CREATED, "Deal not in CREATED status");

        deal.status = DealStatus.ACTIVE;

        emit DealAccepted(dealId, block.timestamp);
    }

    function submitResult(uint256 dealId, bytes32 resultHash) external {
        Deal storage deal = deals[dealId];
        require(msg.sender == deal.worker, "Only worker can submit");
        require(deal.status == DealStatus.ACTIVE, "Deal not in ACTIVE status");
        require(block.timestamp <= deal.deadline, "Deadline has passed");
        require(resultHash != bytes32(0), "Result hash cannot be empty");

        deal.resultHash = resultHash;
        deal.status = DealStatus.SUBMITTED;
        deal.submittedAt = block.timestamp;

        emit ResultSubmitted(dealId, resultHash, block.timestamp);
    }

    function settleDeal(uint256 dealId) external nonReentrant {
        Deal storage deal = deals[dealId];
        require(
            msg.sender == deal.payer ||
            msg.sender == owner() ||
            verifierStakes[msg.sender] >= MIN_VERIFIER_STAKE,
            "Only payer, owner, or staked verifier can settle"
        );
        require(deal.status == DealStatus.SUBMITTED, "Deal not in SUBMITTED status");

        deal.status = DealStatus.SETTLED;

        _transferFunds(deal.worker, deal.token, deal.amount);

        emit DealSettled(dealId, deal.worker, deal.amount);
    }

    function refund(uint256 dealId) external nonReentrant {
        Deal storage deal = deals[dealId];
        require(msg.sender == deal.payer, "Only payer can refund");
        require(
            deal.status == DealStatus.CREATED || deal.status == DealStatus.ACTIVE,
            "Invalid status for refund"
        );

        if (deal.status == DealStatus.ACTIVE) {
            require(block.timestamp > deal.deadline, "Deadline has not passed");
        }

        deal.status = DealStatus.REFUNDED;

        _transferFunds(deal.payer, deal.token, deal.amount);

        emit DealRefunded(dealId, deal.payer, deal.amount);
    }

    function raiseDispute(uint256 dealId) external {
        Deal storage deal = deals[dealId];
        require(
            msg.sender == deal.payer ||
            verifierStakes[msg.sender] >= MIN_VERIFIER_STAKE,
            "Only payer or staked verifier can dispute"
        );
        require(deal.status == DealStatus.SUBMITTED, "Deal not in SUBMITTED status");
        require(
            block.timestamp <= deal.submittedAt + DISPUTE_WINDOW,
            "Dispute window has passed"
        );

        deal.status = DealStatus.DISPUTED;

        emit DisputeRaised(dealId, msg.sender, block.timestamp);
    }

    function resolveDispute(uint256 dealId, bool payWorker) external onlyOwner nonReentrant {
        Deal storage deal = deals[dealId];
        require(deal.status == DealStatus.DISPUTED, "Deal not in DISPUTED status");

        if (payWorker) {
            deal.status = DealStatus.SETTLED;
            _transferFunds(deal.worker, deal.token, deal.amount);
        } else {
            deal.status = DealStatus.REFUNDED;
            _transferFunds(deal.payer, deal.token, deal.amount);
        }

        emit DisputeResolved(dealId, payWorker);
    }

    // ──────────────────── Verifier Functions ────────────────────

    function stakeVerifier() external payable {
        if (msg.value < MIN_VERIFIER_STAKE) revert InsufficientStake();
        verifierStakes[msg.sender] += msg.value;
        emit VerifierStaked(msg.sender, msg.value);
    }

    function unstakeVerifier() external nonReentrant {
        uint256 amount = verifierStakes[msg.sender];
        if (amount == 0) revert NotAVerifier();
        verifierStakes[msg.sender] = 0;
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "Transfer failed");
        emit VerifierUnstaked(msg.sender, amount);
    }

    function vote(uint256 dealId, bool accept) external nonReentrant {
        if (verifierStakes[msg.sender] == 0) revert NotAVerifier();
        if (hasVoted[dealId][msg.sender]) revert AlreadyVoted();

        Deal storage deal = deals[dealId];
        if (deal.status != DealStatus.SUBMITTED) revert DealNotSubmitted();

        hasVoted[dealId][msg.sender] = true;

        if (accept) {
            acceptVotes[dealId]++;
        } else {
            rejectVotes[dealId]++;
        }

        emit VoteCast(dealId, msg.sender, accept);

        // Check for consensus
        if (acceptVotes[dealId] >= requiredVotes) {
            deal.status = DealStatus.SETTLED;
            _transferFunds(deal.worker, deal.token, deal.amount);
            emit DealSettled(dealId, deal.worker, deal.amount);
            emit ConsensusReached(dealId, true);
        } else if (rejectVotes[dealId] >= requiredVotes) {
            deal.status = DealStatus.DISPUTED;
            emit DisputeRaised(dealId, address(0), block.timestamp);
            emit ConsensusReached(dealId, false);
        }
    }

    function slashVerifier(address verifier, string calldata reason)
        external
        onlyOwner
        nonReentrant
    {
        uint256 amount = verifierStakes[verifier];
        if (amount == 0) revert NotAVerifier();
        verifierStakes[verifier] = 0;
        (bool ok, ) = payable(owner()).call{value: amount}("");
        require(ok, "Transfer failed");
        emit VerifierSlashed(verifier, amount, reason);
    }

    function setRequiredVotes(uint256 n) external onlyOwner {
        require(n >= 1, "Must require at least 1 vote");
        emit RequiredVotesUpdated(requiredVotes, n);
        requiredVotes = n;
    }

    // ──────────────────── View Functions ────────────────────

    function getDeal(uint256 dealId) external view returns (Deal memory) {
        return deals[dealId];
    }

    function getDealsForPayer(address payer) external view returns (uint256[] memory) {
        return _payerDeals[payer];
    }

    function getDealsForWorker(address worker) external view returns (uint256[] memory) {
        return _workerDeals[worker];
    }

    function isVerifier(address addr) external view returns (bool) {
        return verifierStakes[addr] >= MIN_VERIFIER_STAKE;
    }

    function getVotes(uint256 dealId) external view returns (uint256 accept, uint256 reject) {
        return (acceptVotes[dealId], rejectVotes[dealId]);
    }

    // ──────────────────── Internal Helpers ────────────────────

    function _transferFunds(address recipient, address token, uint256 amount) internal {
        if (token == address(0)) {
            (bool success, ) = payable(recipient).call{value: amount}("");
            require(success, "ETH transfer failed");
        } else {
            IERC20(token).safeTransfer(recipient, amount);
        }
    }
}
