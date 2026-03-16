# DealForge Contract Changes — Phase 5: Verification Network

**File:** `contracts/src/DealForge.sol`
**Status:** Required for Verification Node support
**Depends on:** Verification Node (`/verifier`) implementation

---

## Background

The current contract allows only the **payer** or **owner** to settle a deal, and only the **payer** to raise a dispute. This prevents Verification Nodes from acting on-chain without holding the payer role. Phase 5 adds a permissioned verifier registry, N-of-M vote accumulation, automatic consensus-triggered settlement, and economic staking/slashing to make verification trustless.

---

## 1. New State Variables

```solidity
// Minimum ETH a verifier must stake to participate
uint256 public constant MIN_VERIFIER_STAKE = 0.01 ether;

// Number of votes required for consensus (configurable by owner)
uint256 public requiredVotes = 3;

// Registered verifier stakes
mapping(address => uint256) public verifierStakes;

// Per-deal vote tracking
mapping(uint256 => mapping(address => bool)) public hasVoted;   // dealId → verifier → voted
mapping(uint256 => uint256) public acceptVotes;                  // dealId → ACCEPT count
mapping(uint256 => uint256) public rejectVotes;                  // dealId → REJECT count
```

---

## 2. New Events

```solidity
event VerifierStaked(address indexed verifier, uint256 amount);
event VerifierUnstaked(address indexed verifier, uint256 amount);
event VerifierSlashed(address indexed verifier, uint256 amount, string reason);
event VoteCast(uint256 indexed dealId, address indexed verifier, bool accept);
event ConsensusReached(uint256 indexed dealId, bool settled);
event RequiredVotesUpdated(uint256 oldValue, uint256 newValue);
```

---

## 3. New Errors

```solidity
error NotAVerifier();           // caller has no stake
error AlreadyVoted();           // verifier already voted on this deal
error InsufficientStake();      // staked amount below MIN_VERIFIER_STAKE
error DealNotSubmitted();       // deal must be SUBMITTED to vote
error ConsensusAlreadyMet();    // voting closed, consensus already triggered
```

---

## 4. New Functions

### 4.1 `stakeVerifier()`

Registers the caller as a verifier by locking ETH.

```solidity
function stakeVerifier() external payable {
    if (msg.value < MIN_VERIFIER_STAKE) revert InsufficientStake();
    verifierStakes[msg.sender] += msg.value;
    emit VerifierStaked(msg.sender, msg.value);
}
```

---

### 4.2 `unstakeVerifier()`

Withdraws stake. Only callable when verifier has no active deal votes in flight (simplified: any time for v1).

```solidity
function unstakeVerifier() external nonReentrant {
    uint256 amount = verifierStakes[msg.sender];
    if (amount == 0) revert NotAVerifier();
    verifierStakes[msg.sender] = 0;
    (bool ok, ) = payable(msg.sender).call{value: amount}("");
    require(ok, "Transfer failed");
    emit VerifierUnstaked(msg.sender, amount);
}
```

---

### 4.3 `vote(uint256 dealId, bool accept)`

Cast a verification vote for a deal in `SUBMITTED` status. Automatically triggers settlement or dispute once `requiredVotes` threshold is met.

```solidity
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
```

---

### 4.4 `slashVerifier(address verifier, string calldata reason)` — `onlyOwner`

Slashes a verifier's stake for provably dishonest behaviour (e.g., voted ACCEPT on a deal that was later proven fraudulent via dispute resolution).

```solidity
function slashVerifier(address verifier, string calldata reason)
    external
    onlyOwner
    nonReentrant
{
    uint256 amount = verifierStakes[verifier];
    if (amount == 0) revert NotAVerifier();
    verifierStakes[verifier] = 0;
    // Slashed funds go to contract owner (treasury)
    (bool ok, ) = payable(owner()).call{value: amount}("");
    require(ok, "Transfer failed");
    emit VerifierSlashed(verifier, amount, reason);
}
```

---

### 4.5 `setRequiredVotes(uint256 n)` — `onlyOwner`

Adjusts the consensus threshold.

```solidity
function setRequiredVotes(uint256 n) external onlyOwner {
    require(n >= 1, "Must require at least 1 vote");
    emit RequiredVotesUpdated(requiredVotes, n);
    requiredVotes = n;
}
```

---

## 5. Modified Functions

### 5.1 `settleDeal` — add verifier permission

Change the access check so a staked verifier can also settle (used by single-verifier mode or as a bypass before voting is fully set up).

```solidity
// Before:
require(
    msg.sender == deal.payer || msg.sender == owner(),
    "Only payer or owner can settle"
);

// After:
require(
    msg.sender == deal.payer ||
    msg.sender == owner() ||
    verifierStakes[msg.sender] >= MIN_VERIFIER_STAKE,
    "Only payer, owner, or staked verifier can settle"
);
```

---

### 5.2 `raiseDispute` — add verifier permission

Allow a staked verifier to raise a dispute, not just the payer.

```solidity
// Before:
require(msg.sender == deal.payer, "Only payer can dispute");

// After:
require(
    msg.sender == deal.payer ||
    verifierStakes[msg.sender] >= MIN_VERIFIER_STAKE,
    "Only payer or staked verifier can dispute"
);
```

---

## 6. New View Functions

```solidity
// Check if an address is a registered (staked) verifier
function isVerifier(address addr) external view returns (bool) {
    return verifierStakes[addr] >= MIN_VERIFIER_STAKE;
}

// Get current vote counts for a deal
function getVotes(uint256 dealId) external view returns (uint256 accept, uint256 reject) {
    return (acceptVotes[dealId], rejectVotes[dealId]);
}
```

---

## 7. Summary of All Changes

| Type | Name | Purpose |
|---|---|---|
| State | `MIN_VERIFIER_STAKE` | Minimum stake constant |
| State | `requiredVotes` | Consensus threshold (configurable) |
| State | `verifierStakes` | Stake balances per verifier |
| State | `hasVoted` | Per-deal vote deduplication |
| State | `acceptVotes` / `rejectVotes` | Vote counters per deal |
| Event | `VerifierStaked` / `VerifierUnstaked` | Stake lifecycle |
| Event | `VerifierSlashed` | Slashing record |
| Event | `VoteCast` | Audit trail for every vote |
| Event | `ConsensusReached` | Signals automatic settlement or dispute |
| Event | `RequiredVotesUpdated` | Governance transparency |
| Error | `NotAVerifier` / `AlreadyVoted` / `InsufficientStake` etc. | Precise reverts |
| Function | `stakeVerifier()` | Register as verifier |
| Function | `unstakeVerifier()` | Withdraw stake |
| Function | `vote(dealId, accept)` | Cast verification vote + auto-settle on consensus |
| Function | `slashVerifier(verifier, reason)` | Penalise dishonest verifier |
| Function | `setRequiredVotes(n)` | Adjust consensus threshold |
| Function | `isVerifier(addr)` | View — check registration |
| Function | `getVotes(dealId)` | View — current vote counts |
| Modified | `settleDeal` | Allow staked verifiers to settle |
| Modified | `raiseDispute` | Allow staked verifiers to dispute |

---

## 8. What the Verifier Node Calls After This Update

| Decision | Current (v1) | After Phase 5 |
|---|---|---|
| ACCEPT | `settleDeal(dealId)` as owner | `vote(dealId, true)` — consensus auto-settles |
| REJECT | `raiseDispute(dealId)` — fails unless payer | `vote(dealId, false)` — consensus auto-disputes |
| Setup | none | `stakeVerifier()` once at startup |
