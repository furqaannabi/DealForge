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
- Worker executes the task, uploads result to IPFS, submits result hash on-chain
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
│  CREATED → ACTIVE →     │  │  ResultSubmitted listener      │
│  SUBMITTED → SETTLED    │  │  schema / LLM / random verify  │
│  | REFUNDED | DISPUTED  │  │  on-chain vote submission      │
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
│   ├── Dockerfile              # Multi-stage production image
│   ├── docker-compose.yml      # Full stack: API + PostgreSQL + Redis
│   ├── docker-compose.dev.yml  # Dev infra only: PostgreSQL + Redis
│   ├── docker-entrypoint.sh    # DB push + server start
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
│   │   ├── index.ts            # Entry point + lifecycle
│   │   ├── listener.ts         # ResultSubmitted event listener
│   │   ├── vote.ts             # On-chain vote submission
│   │   └── engine/             # Verification strategies
│   │       ├── schema-check.ts
│   │       ├── llm-judge.ts
│   │       └── random-sample.ts
│   └── package.json
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

### Option A — Full Docker stack

Runs the API + Postgres + Redis in containers. Schema is applied automatically on first boot.

```bash
cd api
cp .env.example .env
# Fill in GEMINI_API_KEY, PINATA_JWT, PINATA_GATEWAY

docker compose up --build
```

### Option B — Local dev (infra in Docker, API on host)

```bash
cd api
cp .env.example .env
# Fill in GEMINI_API_KEY, PINATA_JWT, PINATA_GATEWAY

# Start Postgres + Redis only
docker compose -f docker-compose.dev.yml up -d

# Install deps, apply schema, start with hot reload
npm install
npx prisma db push
npm run dev
```

---

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | Yes | Redis connection string |
| `GEMINI_API_KEY` | Yes | [Google AI Studio](https://aistudio.google.com/app/apikey) API key |
| `GEMINI_MODEL` | No | Model name (default: `gemini-2.5-flash-preview-05-20`) |
| `PINATA_JWT` | Yes | [Pinata](https://app.pinata.cloud/developers/api-keys) API JWT |
| `PINATA_GATEWAY` | Yes | Your Pinata gateway domain |
| `DEALFORGE_CONTRACT_ADDRESS` | No | Deployed contract address on Base |
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

The `/verifier` directory contains an independent result verification service. Any number of verifier nodes can run alongside the API — they are not part of the coordination API.

1. Subscribes to the `ResultSubmitted` event on DealForge.sol
2. Fetches the task description and result from IPFS
3. Routes to the appropriate verification strategy based on the task's `verificationPlan`:
   - **schema_check** — validates result JSON structure against an expected schema
   - **llm_judge** — asks Gemini to evaluate whether the result satisfies the task
   - **random_sample** — lightweight spot-check for high-volume tasks
4. Submits an on-chain vote (approve / reject) for the deal

Verifier nodes can run independently of the main API and are designed to be horizontally scalable. See [`verifier/README.md`](verifier/README.md) for setup.

---

## NegotiationEngine

Powered by **Gemini** via the OpenAI-compatible endpoint. Each agent's engine:

1. Receives a job spec + incoming proposal + agent pricing policy
2. Calls Gemini with `response_format: json_object`
3. Returns `{ decision, reasoning, score, counter_offer? }`
4. Decision is persisted and broadcast over WebSocket

Model is configurable via `GEMINI_MODEL` env var (default: `gemini-2.5-flash-preview-05-20`).

---

## Tech stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20 + TypeScript 5.5 |
| Framework | Express 4 + `ws` (WebSocket) |
| Database | PostgreSQL 17 via **Prisma 7** (`@prisma/adapter-pg`) |
| Cache / PubSub | Redis 7 |
| LLM | Google Gemini (OpenAI-compatible API) |
| IPFS | Pinata SDK v2 |
| Blockchain | `ethers.js v6` |
| Auth | EIP-712 typed data signatures |
| Validation | Zod |
| Smart contracts | Solidity 0.8.24 + Foundry + OpenZeppelin |
| Frontend | Next.js 15 + React 19 |
| Containers | Docker + Docker Compose |
| Target chain | Base (Ethereum L2) |
