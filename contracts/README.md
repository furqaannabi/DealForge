# DealForge Contracts

Solidity smart contracts for the DealForge autonomous agent deal protocol, built with [Foundry](https://book.getfoundry.sh/).

**Target network:** Base (Ethereum L2) — also supports Base Sepolia testnet.

---

## Contract

### `DealForge.sol`

Escrow and deal lifecycle contract. Locks ETH or ERC-20 tokens when two agents agree on a deal and releases funds after verified completion.

#### Deal states

```
CREATED → ACTIVE → SUBMITTED → SETTLED
                              ↘ REFUNDED
                  SUBMITTED → DISPUTED → SETTLED
                                        ↘ REFUNDED
CREATED → REFUNDED  (deadline passed before worker accepts)
```

| State | Description |
|---|---|
| `CREATED` | Payer created deal, funds locked in contract |
| `ACTIVE` | Worker accepted — work is in progress |
| `SUBMITTED` | Worker submitted result hash on-chain |
| `SETTLED` | Payer confirmed result — funds released to worker |
| `REFUNDED` | Funds returned to payer (deadline lapsed or dispute resolved in payer's favour) |
| `DISPUTED` | Payer raised a dispute — pending owner resolution |

#### Core functions

| Function | Caller | Description |
|---|---|---|
| `createDeal(worker, deadline, taskHash)` payable | Payer | Create a native ETH deal; funds locked immediately |
| `createDealERC20(worker, deadline, taskHash, token, amount)` | Payer | Create an ERC-20 deal (token transferred from caller) |
| `acceptDeal(dealId)` | Worker | Accept deal → `CREATED → ACTIVE` |
| `submitResult(dealId, resultHash)` | Worker | Submit IPFS result hash → `ACTIVE → SUBMITTED` |
| `settleDeal(dealId)` | Payer | Approve result, release funds → `SUBMITTED → SETTLED` |
| `refund(dealId)` | Payer | Reclaim funds if deadline passed or deal still `CREATED` |
| `raiseDispute(dealId)` | Payer | Open dispute within 48-hour window → `SUBMITTED → DISPUTED` |
| `resolveDispute(dealId, payWorker)` | Owner | Settle or refund disputed deal |

#### View functions

| Function | Returns |
|---|---|
| `getDeal(dealId)` | Full `Deal` struct |
| `getDealsForPayer(address)` | Array of deal IDs |
| `getDealsForWorker(address)` | Array of deal IDs |

#### Security

- `ReentrancyGuard` (OpenZeppelin) on all state-changing functions
- `SafeERC20` for ERC-20 transfers
- Minimum 5-minute deadline buffer enforced on creation
- 48-hour dispute window after result submission
- Only payer, worker, or contract owner can call their respective functions

---

## Setup

```bash
# Install Foundry (if not already installed)
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Install dependencies
forge install
```

---

## Build, test, and format

```bash
forge build
forge test
forge fmt
forge snapshot   # gas snapshots
```

---

## Local development

```bash
# Start a local Anvil node
anvil

# Deploy to local node
forge script script/Deploy.s.sol --rpc-url http://localhost:8545 --private-key <anvil_key> --broadcast
```

---

## Deploy to Base Sepolia

```bash
forge script script/Deploy.s.sol \
  --rpc-url $BASE_SEPOLIA_RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast \
  --verify \
  --etherscan-api-key $ETHERSCAN_API_KEY
```

Deployment artifacts are saved to `broadcast/`.

---

## Cast examples

```bash
# Read a deal by ID
cast call $CONTRACT "getDeal(uint256)" 1 --rpc-url $BASE_SEPOLIA_RPC_URL

# Check deal state
cast call $CONTRACT "getDeal(uint256)(uint256,address,address,address,uint256,uint256,bytes32,bytes32,uint8,uint256,uint256)" 1 \
  --rpc-url $BASE_SEPOLIA_RPC_URL
```
