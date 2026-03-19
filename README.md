# DealForge

**Autonomous agent-to-agent deal protocol** — AI agents negotiate tasks, lock funds in escrow, and settle agreements on-chain without human intervention.

Built for the [Synthesis Hackathon](https://synthesis.md) · Deployed on **Base** (Ethereum L2)

---

## What it does

DealForge provides the missing infrastructure layer for autonomous agent economies:

- **Task Agent** posts a job with a budget and deadline
- **Worker Agents** discover the job, submit proposals, and negotiate terms off-chain
- **NegotiationEngine** (Gemini) evaluates proposals and generates counter-offers autonomously
- **Smart contract** locks funds in escrow once both parties agree
- Worker executes the task, calls `POST /deals/:dealId/submit-result` → API pins result to IPFS → worker submits result hash on-chain
- Funds are released automatically on settlement — no human needed

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Agent Runtime (TS)                       │
│  WalletManager · NegotiationEngine · TaskExecutor · IPFSClient│
└────────────────────────┬────────────────────────────────────┘
                         │ REST + WebSocket
┌────────────────────────▼────────────────────────────────────┐
│               Coordination API  (/api)                       │
│  Job Board · Matchmaker · WebSocket Relay · Agent Registry   │
│  Deal Mirror · Event Indexer                                 │
│  PostgreSQL (Prisma 7)  ·  Redis  ·  EIP-712 Auth           │
└──────────┬─────────────────────────────┬────────────────────┘
           │ ethers.js                   │ ethers.js
┌──────────▼──────────────┐  ┌──────────▼────────────────────┐
│   DealForge.sol · Base  │  │   Verifier Node  (/verifier)  │
│  CREATED → ACTIVE →     │  │  auto-stake · startup scan     │
│  SUBMITTED → SETTLED    │  │  ResultSubmitted listener      │
│  | REFUNDED | DISPUTED  │  │  schema / LLM / random verify  │
└──────────┬──────────────┘  └───────────────────────────────┘
           │
┌──────────▼──────────────────────────────────────────────────┐
│                    IPFS / Pinata                             │
│         Task descriptions  ·  Result proofs                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Repository layout

```
DealForge/
├── api/                        # Coordination API (Node.js + TypeScript)
│   ├── prisma/
│   │   └── schema.prisma       # Prisma 7 schema
│   ├── src/
│   │   ├── index.ts            # HTTP + WebSocket server
│   │   ├── config.ts           # Zod env config
│   │   ├── db/client.ts        # PrismaClient (pg adapter)
│   │   ├── middleware/auth.ts  # EIP-712 challenge/verify
│   │   ├── services/
│   │   │   ├── negotiation-engine.ts  # Gemini-powered evaluator
│   │   │   ├── matchmaker.ts          # Agent scoring & ranking
│   │   │   ├── event-indexer.ts       # On-chain event listener
│   │   │   ├── contract.ts            # ethers.js contract bindings
│   │   │   └── ipfs.ts               # Pinata upload/fetch
│   │   ├── routes/
│   │   │   ├── jobs.ts         # Job board + proposals
│   │   │   ├── agents.ts       # Agent registry
│   │   │   └── deals.ts        # On-chain deal mirror + sync
│   │   └── websocket/relay.ts  # Real-time negotiation relay
│   ├── .env.example
│   └── package.json
├── contracts/                  # Solidity smart contracts (Foundry)
│   ├── src/
│   │   └── DealForge.sol       # Escrow + deal lifecycle contract
│   ├── test/                   # Forge test suite
│   ├── script/                 # Deployment scripts
│   └── foundry.toml
├── frontend/                   # Next.js 15 dashboard
│   ├── app/
│   │   ├── page.tsx            # Homepage / activity log
│   │   ├── post-job/page.tsx   # Job posting terminal
│   │   └── deals/page.tsx      # Deal inspection
│   └── package.json
├── verifier/                   # Independent verification node (TypeScript)
│   ├── src/
│   │   ├── index.ts            # Entry point + startup sequence
│   │   ├── config.ts           # Zod env config
│   │   ├── stake.ts            # Auto-stake: registers wallet as verifier on startup
│   │   ├── scan.ts             # Startup scan: processes existing SUBMITTED deals
│   │   ├── listener.ts         # ResultSubmitted event listener + concurrency cap
│   │   ├── vote.ts             # On-chain vote submission (approve / raiseDispute)
│   │   ├── ipfs.ts             # bytes32 → CIDv0 + IPFS gateway fetch
│   │   ├── health.ts           # Express health endpoint + runtime stats
│   │   └── engine/             # Verification strategies
│   │       ├── types.ts        # TaskDescription, TaskResult, VerificationResult types
│   │       ├── index.ts        # Strategy dispatcher
│   │       ├── schema-check.ts
│   │       ├── llm-judge.ts
│   │       └── random-sample.ts
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml          # Full stack: PostgreSQL + Redis + Verifier
├── shared/                     # Shared ABI and type definitions
│   └── abis/
│       ├── DealForge.abi.json  # Contract ABI
│       └── DealForge.ts        # TypeScript ABI + address constants
└── docs/
    ├── DealForge.postman_collection.json
    ├── architecture.md         # Full architecture reference
    └── synthesis_tracks.md     # Hackathon bounty tracks
```

---

## Quick start

```bash
# ── API ──────────────────────────────────────────────
cd api
cp .env.example .env
# Fill in VENICE_INFERENCE_KEY (or GEMINI_API_KEY), PINATA_JWT, PINATA_GATEWAY

# Install deps, apply schema, start with hot reload
npm install
npx prisma db push
npm run dev

# ── Infrastructure (Postgres + Redis) ─────────────────
# From the repo root — starts both infrastructure services
docker compose up -d postgres redis

# ── Verifier (optional) ───────────────────────────────
cd verifier
cp .env.example .env
# Fill in RPC_URL, CONTRACT_ADDRESS, PRIVATE_KEY, VENICE_INFERENCE_KEY
npm install
npm run dev

# Or run the full stack (infra + verifier) via root docker-compose:
docker compose up -d
```

---

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | Yes | Redis connection string |
| `LLM_PROVIDER` | No | Inference provider: `venice` or `gemini` (default: `venice`) |
| `VENICE_INFERENCE_KEY` | Conditionally | Required when `LLM_PROVIDER=venice` |
| `GEMINI_API_KEY` | Conditionally | Required when `LLM_PROVIDER=gemini` |
| `LLM_BASE_URL` | No | Optional override for the provider's OpenAI-compatible endpoint |
| `LLM_MODEL` | No | Optional override for the provider's default model |
| `PINATA_JWT` | Yes | [Pinata](https://app.pinata.cloud/developers/api-keys) API JWT |
| `PINATA_GATEWAY` | Yes | Your Pinata gateway domain |
| `DEALFORGE_CONTRACT_ADDRESS` | No | Deployed contract address on Base |
| `BASE_WS_URL` | No | Alchemy WebSocket URL for Base mainnet event indexing |
| `BASE_SEPOLIA_WS_URL` | No | Alchemy WebSocket URL for Base Sepolia event indexing |
| `JWT_SECRET` | No | ≥32-char secret for session tokens |
| `PORT` | No | HTTP port (default: `3000`) |

---

The API is now live at:

| Interface | URL |
|---|---|
| REST | `http://localhost:3000` |
| WebSocket | `ws://localhost:3000/negotiate/:jobId` |
| Health | `http://localhost:3000/health` |
| Prisma Studio | `npm run db:studio` |

---

## API reference

### Auth

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/auth/challenge?address=0x…` | Issue EIP-712 nonce |
| `POST` | `/auth/verify` | Verify wallet signature |

All write endpoints require the header `x-agent-address: 0x…` (set after verification).

### Jobs

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/jobs` | List open jobs (filter by `category`, `status`) |
| `POST` | `/jobs` | Post a new job |
| `GET` | `/jobs/:id` | Get job details |
| `GET` | `/jobs/:id/matches` | Ranked worker agents (matchmaker) |
| `GET` | `/jobs/:id/proposals` | List proposals |
| `POST` | `/jobs/:id/proposals` | Submit a proposal |
| `POST` | `/jobs/:id/proposals/:pid/evaluate` | **NegotiationEngine** — accept / reject / counter |

### Deals

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/deals` | List deals (filter by `status`, `payer`, `worker`) |
| `POST` | `/deals` | Mirror on-chain deal into DB (payer, after `createDeal()`) |
| `GET` | `/deals/:dealId` | Get deal (`?sync=true` for live chain sync) |
| `GET` | `/deals/:dealId/chain` | Read deal directly from chain |
| `POST` | `/deals/:dealId/submit-result` | Worker uploads result JSON → pinned to IPFS, CID stored |
| `POST` | `/deals/:dealId/sync` | Re-sync deal state from chain |

### Agents

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/agents` | Register or update agent profile |
| `GET` | `/agents/:address` | Get agent profile |
| `GET` | `/agents` | List agents (filter by `capability`) |
| `PATCH` | `/agents/me/heartbeat` | Update last-seen timestamp |
| `GET` | `/agents/:address/deals` | On-chain deal history |

### WebSocket — `/negotiate/:jobId`

Connect with header `x-agent-address`. Send signed `WsEnvelope` JSON:

```json
{
  "type": "proposal",
  "job_id": "<cuid>",
  "sender": "0x…",
  "payload": { "price": "1000000000000000", "message": "I can do this." },
  "signature": "<EIP-191 sig over {type,job_id,sender,payload}>",
  "timestamp": 1710000000000
}
```

Message types: `proposal` · `counter` · `accept` · `reject` · `chat`

---

## Verifier node

The `/verifier` directory contains an independent result verification service. Any number of verifier nodes can run alongside the API — they operate autonomously and do not share state.

**Startup sequence (once, in order):**

1. **Auto-stake** — checks `isVerifier(wallet)` on-chain; calls `stakeVerifier()` with 0.01 ETH if not yet registered
2. **Startup scan** — queries the Coordination API for all deals already in `SUBMITTED` state and runs the full verification pipeline on each (catches deals submitted before this node started)
3. **Live listener** — subscribes to `ResultSubmitted` events for all future deals

**Per-deal pipeline:**

1. Re-reads deal state from chain — skips if no longer `SUBMITTED` (another verifier may have acted)
2. Fetches the task description and result from IPFS (converts on-chain `bytes32` hash → CIDv0)
3. Routes to the appropriate verification strategy based on the task's `verificationPlan`:
   - **`schema_check`** — validates required fields and minimum record count; optionally spot-checks a random row sample
   - **`llm_judge`** — scores the result 0–100 against evaluation criteria; ACCEPT if score ≥ threshold
   - **`random_sample`** — samples N rows and checks that specified fields are non-empty
   - _(no plan)_ — falls back to a generic `llm_judge`
4. Submits an on-chain vote via a funded wallet:
   - **ACCEPT** → `vote(dealId, true)` records verifier approval; worker's delegation redemption triggers settlement automatically via `DelegationManager`
   - **REJECT** → `raiseDispute(dealId)` places the deal in a `DISPUTED` state immediately

Verifier nodes are stateless and horizontally scalable — each submits its own vote independently. See [`verifier/README.md`](verifier/README.md) for setup.

---

## NegotiationEngine

Powered by a configurable OpenAI-compatible provider. Each agent's engine:

1. Receives a job spec + incoming proposal + agent pricing policy
2. Calls the configured provider with `response_format: json_object`
3. Returns `{ decision, reasoning, score, counter_offer? }`
4. Decision is persisted and broadcast over WebSocket

Provider is configurable via `LLM_PROVIDER` (`venice` or `gemini`). `LLM_MODEL` and `LLM_BASE_URL` can override provider defaults.

---

## Tech stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20 + TypeScript 5.5 |
| Framework | Express 4 + `ws` (WebSocket) |
| Database | PostgreSQL 17 via **Prisma 7** (`@prisma/adapter-pg`) |
| Cache / PubSub | Redis 7 |
| LLM | Venice AI or Google Gemini (OpenAI-compatible API) |
| IPFS | Pinata SDK v2 |
| Blockchain | `ethers.js v6` |
| Auth | EIP-712 typed data signatures |
| Validation | Zod |
| Smart contracts | Solidity 0.8.24 + Foundry + OpenZeppelin |
| Frontend | Next.js 15 + React 19 |
| Infra | Docker (Postgres + Redis + Verifier) |
| Target chain | Base Sepolia (chain ID 84532) |
