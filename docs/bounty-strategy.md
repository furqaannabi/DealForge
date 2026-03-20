# DealForge — Bounty Strategy

> Full track list: [`docs/synthesis_tracks.md`](./synthesis_tracks.md)  
> Total addressable prize pool: **~$37,000+** across primary targets

---

## What We Have (Asset Inventory)

| Component | What it provides |
|---|---|
| `DealForge.sol` | Escrow contract with `CREATED → ACTIVE → SUBMITTED → SETTLED` lifecycle on Base |
| `NegotiationEngine` | Gemini/Venice-powered LLM that evaluates proposals and generates counter-offers |
| `Matchmaker` | Ranks and scores worker agents for a given job |
| `Verifier node` | Independent auto-staking node; runs schema/LLM/random verification strategies |
| `Event indexer` | Listens to on-chain events, mirrors state into Postgres |
| `IPFS / Pinata` | Task descriptions and result proofs stored on-chain by CID |
| `EIP-712 auth` | Wallet-signature-based agent authentication |
| `WebSocket relay` | Real-time negotiation channel between agents |
| `Next.js dashboard` | Job board, deal inspection, live feed |
| `Docker + Dockerfile` | Verifier is containerised, deployable in TEE |

---

## Primary Targets

### 🥇 Base — $10,000 *(highest confidence)*

**Track 2 — Agent Services on Base ($5,000)**  
DealForge IS an agent service. It:
- Is deployed on Base
- Accepts payments from other agents (escrow via `createDeal`)
- Provides services (negotiation, matching, verification) to agents
- The x402 payment flow maps directly to `createDeal` locking funds

**What to emphasise in submission:**
- DealForge as a discoverable protocol other agents can call
- x402-compatible payment acceptance at deal creation
- On-chain receipts for every completed deal

**Track 1 — Autonomous Trading Agent ($5,000)** *(stretch)*  
Less direct fit currently. Could frame the `Matchmaker + NegotiationEngine` as an autonomous deal-execution agent. Consider adding a simple Uniswap swap as the "task" in a demo deal to qualify.

---

### 🥈 Venice — $11,500 *(high confidence, needs Venice LLM swap)*

**Track — Private Deal Negotiation Agents**  
Venice is explicitly listed in their prize ideas: *"private deal negotiation agents"* — this is DealForge's core feature.

**Current state:** `LLM_PROVIDER` already supports Venice via the `VENICE_INFERENCE_KEY` env var.  
**Required change:** Switch the demo/deployed instance to use Venice as the inference provider.

**What to emphasise:**
- Negotiation happens off-chain (private) via WebSocket; only the settled hash goes on-chain
- Venice infers over deal terms without exposing raw data publicly
- Frames perfectly as "confidential due diligence" and "private multi-agent coordination"

**Action item:** Set `LLM_PROVIDER=venice` in deployed env, document that Venice handles confidential negotiation inference.

---

### 🥉 Arkhai — $1,000 *(high confidence, near-zero extra work)*

**Track — Escrow Ecosystem Extensions ($450)**  
`DealForge.sol` is already a fully-featured escrow + settlement system. This is a direct fit.

**Track — Applications ($450)**  
The full DealForge stack (job board, matching, negotiation, verification) qualifies.

**Action item:** Check if Arkhai has a specific SDK/primitive to integrate; if minimal, worth adding for the extra $900.

---

### 🏅 Uniswap — $5,000 *(medium confidence)*

DealForge already imports Uniswap's agent-skills pattern conceptually. To qualify:

**Approach:** Create a demo deal where the "task" is an autonomous Uniswap swap. The worker agent:
1. Gets matched for a "swap USDC→ETH" job
2. Executes via Uniswap v4 contracts on Base
3. Submits result hash on-chain via DealForge

Uses [Uniswap AI Skills](https://github.com/Uniswap/agent-skills) as the worker execution layer.

**Action item:** Build one demo deal type that executes a swap and reports back.

---

### 🏅 EigenCloud — $5,000 *(medium confidence)*

**Requirement:** Docker image deployed in a TEE (Trusted Execution Environment).

**Current state:** `verifier/Dockerfile` already exists and the verifier runs as an independent containerised node.

**What to do:** Deploy the verifier to EigenCompute. Frame it as: *"a verifiable compute node that enforces autonomous deal settlement — every verification decision is attested by a TEE"*.

**Action items:**
1. Sign up for EigenCloud access
2. Push verifier Docker image to their environment
3. Document TEE attestation in the submission

---

### 🏅 Protocol Labs — TBD *(medium, structured effort)*

Requires specific artefacts with defined formats:

| Required | Status |
|---|---|
| Agent Identity (ERC-8004) | ✅ Already registered via Synthesis |
| `agent.json` capability manifest | ❌ Need to create |
| `agent_log.json` structured execution logs | ❌ Need to create |
| Tool use | ✅ NegotiationEngine, Verifier, IPFS |
| Safety / Guardrails | ⚠️ Verifier rejection pipeline counts; needs documentation |

**Action items:**
1. Write `agent.json` describing DealForge's capabilities
2. Instrument the API to emit structured `agent_log.json` entries
3. Document guardrails (verifier dispute mechanism, score thresholds)

---

### 🏅 Open Track — $28,300 *(automatic entry)*

Enter everything into the Open Track by default. The meta-agent judges across all partner values — DealForge's multi-partner relevance (Base + Venice + Uniswap + Arkhai) makes it a strong candidate.

**Key selling point for Open Track judges:**  
DealForge is infrastructure — it multiplies what other agents can do. Not just another trading bot.

---

### 🏅 MetaMask — $5,000 to Open Track *(medium confidence)*

MetaMask contributed $5,000 to the Open Track and wants to see their **Smart Accounts Kit (ERC-7710 Delegation Framework)** used meaningfully.

**Standard:** ERC-7710 (not ERC-7715). The `redeemDelegations` tx is sent by the **agent wallet (delegate EOA)** directly to the `DelegationManager` contract — not to `DealForge.sol`. The `DelegationManager` then calls `createDeal()` from the human's smart account.

**How it works (per docs):**

```
Frontend (one-time):
  Human creates/connects MetaMask Smart Account (ERC-4337 — not a regular MetaMask EOA)
  Human signs a root delegation:
    createDelegation({ from: humanSmartAccount, to: agentWalletEOA,
                       scope: { type: "nativeTokenTransfer", maxAmount: 0.1 ETH } })
  Signed delegation stored in DB with the job

Task Agent runtime (when NegotiationEngine accepts a proposal):
  Encodes redeemDelegations calldata:
    DelegationManager.encode.redeemDelegations({
      delegations: [signedDelegation],
      executions: [createExecution({ target: DealForge.sol, callData: createDeal(...) })]
    })
  Sends TX to DelegationManager address (not DealForge.sol)
  DelegationManager validates delegation → calls createDeal() from human smart account
  DealForge.sol receives standard createDeal() with msg.value from human smart account
  Escrow locked ✅ — rest of lifecycle unchanged
```

**`DealForge.sol` needs NO changes.** `DelegationManager` wraps the existing `createDeal()`.

**Role mapping:**
| Role | Who | Wallet |
|---|---|---|
| Task Agent (payer) | Human user | MetaMask Smart Account (ERC-4337) |
| Worker Agent | Autonomous AI agent | EOA |
| Negotiator | DealForge NegotiationEngine | Off-chain only |
| Verifier | Verifier node | EOA, pre-funded |

**Required changes:**
1. **Frontend:** onboard user into a MetaMask Smart Account — biggest lift
2. **Frontend:** `createDelegation()` step — human signs ETH spend cap to agent wallet address
3. **API:** store `signedDelegation` in Jobs table
4. **Task Agent runtime:** call `DelegationManager.redeemDelegations()` on accept instead of `createDeal()` directly
5. `DealForge.sol`, verifier, IPFS — **all untouched**

**What to emphasise:** Human authorises once; agent spends autonomously within cap via ERC-7710.

---


## Deprioritised Tracks

| Track | Reason |
|---|---|
| Lido ($3,000) | Requires a new yield-bearing treasury contract; orthogonal to core |
| Olas ($3,000) | Requires Pearl / Olas Marketplace integration; significant new work |
| ENS ($1,500) | Agent identity via ENS; low effort but low prize |
| Moonpay ($7,000) | Requires OpenWallet / MoonPay CLI; diverges from core |
| Status Network ($2,000) | Decentralized messaging layer; new infra |
| Filecoin ($2,500) | IPFS already used (Pinata); swap for Filecoin storage is possible but low ROI |
| Slice / ampersend | Niche payment streaming; moderate integration lift |

---

## Submission Priority Order

| Priority | Track | Prize | Effort | Notes |
|---|---|---|---|---|
| 1 | **Base (Agent Services)** | $5,000 | Low | Core use case |
| 2 | **Open Track** | $28,300 | Low | Auto-entry |
| 3 | **Venice** | $11,500 | Low | Flip `LLM_PROVIDER=venice` |
| 4 | **Arkhai** | $1,000 | Very low | Escrow = direct fit |
| 5 | **MetaMask** | Open Track boost | Medium | `createDealWithDelegation` + frontend delegation screen |
| 6 | **EigenCloud** | $5,000 | Medium | Deploy verifier to TEE |
| 7 | **Protocol Labs** | TBD | Medium | Add `agent.json` + logs |
| 8 | **Uniswap** | $5,000 | Medium | Build swap demo deal |
| 9 | **Base (Trading)** | $5,000 | Medium-High | Extend for autonomous trading |

**Realistic target: $20,000–$30,000** if top 4–5 priorities land.

---

## Pre-Submission Checklist

- [ ] Deploy `DealForge.sol` to Base Mainnet (currently Base Sepolia)
- [ ] Switch deployed API to `LLM_PROVIDER=venice` for Venice track
- [ ] Deploy verifier to EigenCloud TEE
- [ ] Create `agent.json` + enable `agent_log.json` emission (Protocol Labs)
- [ ] Build Uniswap swap demo deal (Uniswap track)
- [ ] Write `conversationLog` capturing human-agent collaboration
- [ ] Ensure repo is public with open-source license ✅ (MIT already set)
- [ ] Add `createDealWithDelegation` to `DealForge.sol` + integrate MetaMask Delegation Toolkit on frontend
- [ ] Record a demo video showing end-to-end deal lifecycle
