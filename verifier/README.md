# DealForge Verifier

Independent result verification node for the DealForge protocol. Any number of verifier nodes can run alongside the Coordination API — they operate autonomously and do not share state.

---

## What it does

**Startup sequence (once, in order):**

1. **Auto-stake** — checks whether the wallet is registered as a verifier on-chain; calls `stakeVerifier()` with 0.01 ETH if not
2. **Startup scan** — queries the Coordination API for all deals in `SUBMITTED` state that have a `taskCid` set; runs the full verification pipeline on each (catches deals submitted before this node started); deals with no `taskCid` are silently skipped
3. **Live listener** — subscribes to `ResultSubmitted` events via WebSocket RPC for all future deals

**Per-deal pipeline:**

1. Re-reads deal state from chain — skips if no longer `SUBMITTED` (another verifier may have acted)
2. Fetches task and result content from IPFS:
   - Resolves CIDs from the Coordination API (`GET /deals/:dealId` → `taskCid` / `resultCid`) rather than reconstructing from bytes32
   - Content is fetched via the API's IPFS proxy (`GET /ipfs/:cid`) which uses the Pinata dedicated gateway with auth
   - Raw worker results (not wrapped in `{ output, logs, metrics }`) are normalized automatically
3. Routes to the appropriate verification strategy based on the task's `verificationPlan`:
   - **`schema_check`** — validates required fields and minimum record count; optionally spot-checks a random sample of rows
   - **`llm_judge`** — uses Gemini (Google Search grounding) to fetch current web facts, then passes those facts + the result to the inference LLM (Venice or Gemini) for scoring; ACCEPT if score ≥ threshold
   - **`random_sample`** — samples `sample_size` rows and checks that `check_fields` are non-empty on each
   - _(no plan)_ — falls back to a generic `llm_judge`
4. Submits an on-chain vote via the funded wallet:
   - **ACCEPT** → calls `vote(dealId, true)` which records verifier approval; the worker's MetaMask delegation redemption then triggers settlement automatically via `DelegationManager`
   - **REJECT** → calls `raiseDispute(dealId)` directly, placing the deal in a `DISPUTED` state

---

## Running

```bash
cd verifier
cp .env.example .env
# Fill in required variables (see below)

npm install
npm run dev      # hot reload
npm run build && npm start   # production
```

---

## Docker

```bash
# standalone
docker build -t dealforge-verifier .
docker run --env-file .env -p 8080:8080 dealforge-verifier

# via root docker-compose (recommended — also starts postgres + redis)
docker compose up -d verifier
docker compose logs -f verifier
```

The image exposes port `8080` and includes a `HEALTHCHECK` against `/health`.

---

## EigenCloud (TEE) Deployment

Deploys the verifier inside a Trusted Execution Environment (TEE) on EigenCloud Sepolia for the EigenCloud bounty track.

### Prerequisites

```bash
npm install -g @eigenlabs/ecloud-cli   # install CLI once
ecloud auth login                      # authenticate
ecloud billing subscribe               # activate subscription (required)
docker login                           # log in to Docker Hub (for push path)
```

### Option A — Verifiable source build *(recommended for bounty)*

Triggers a reproducible build from GitHub so EigenCloud can attest the binary.

> **Requirements:** repo must be **public** and you need the **full 40-char commit SHA**.

```bash
# Get current commit SHA
git rev-parse HEAD

# Deploy (run from repo root or verifier/ — doesn't matter)
ecloud compute app deploy
```

Answer the prompts exactly as follows:

| Prompt | Value |
|---|---|
| Build from verifiable source? | **Yes** |
| Choose verifiable source type | **Build from git source** |
| Public git repository URL | `https://github.com/furqaannabi/DealForge/` |
| Git commit SHA (40 hex chars) | *(output of `git rev-parse HEAD`)* |
| Build context path (relative to repo) | `verifier` |
| Dockerfile path (relative to build context) | `Dockerfile` |
| Caddyfile path | *(leave blank)* |
| Dependency digests | *(leave blank)* |

> ⚠️ **Common mistake:** Do NOT use `verifier\Dockerfile` (Windows backslash). The build runs on Linux. Use `verifier` as the context and `Dockerfile` as the path — no slashes needed.

### Option B — Push existing image

Build locally, push to Docker Hub, then point EigenCloud at the image.

```bash
# 1. Build and push
cd verifier
docker build -t furqaannabi/dealforge-verifier:latest .
docker push furqaannabi/dealforge-verifier:latest

# 2. Deploy
ecloud compute app deploy
```

Answer the prompts:

| Prompt | Value |
|---|---|
| Build from verifiable source? | **No** |
| Choose deployment method | **Deploy existing image from registry** |
| Docker image reference | `docker.io/furqaannabi/dealforge-verifier:latest` |

### After deployment

EigenCloud will provide an app URL. Set environment variables in the EigenCloud dashboard (same vars as the `.env` table below).



## Environment variables

| Variable | Required | Description |
|---|---|---|
| `RPC_URL` | Yes | Base Sepolia HTTP RPC (default: `https://sepolia.base.org`) |
| `WS_RPC_URL` | Yes | Base Sepolia WebSocket RPC — **must be `wss://`**; prevents Alchemy filter expiry |
| `PRIVATE_KEY` | Yes | Funded 32-byte hex private key for submitting on-chain votes |
| `API_BASE_URL` | Yes | Coordination API base URL — used for IPFS CID resolution and startup scan |
| `GEMINI_API_KEY` | Yes | Gemini API key — **always required** for live web search grounding in `llm_judge` |
| `LLM_PROVIDER` | No | Inference provider: `venice` or `gemini` (default: `venice`) |
| `VENICE_INFERENCE_KEY` | Conditionally | Required when `LLM_PROVIDER=venice` |
| `LLM_BASE_URL` | No | Optional override for the inference provider's OpenAI-compatible endpoint |
| `LLM_MODEL` | No | Optional override for the inference provider's default model |
| `NODE_ID` | No | Unique identifier for this verifier instance (default: `verifier-01`) |
| `PORT` | No | Health check HTTP port (default: `8080`) |
| `MAX_CONCURRENT_JOBS` | No | Max simultaneous verifications in-flight (default: `5`) |

---

## Health check

The verifier exposes a health endpoint:

```bash
curl http://localhost:8080/health
```

```json
{
  "status": "running",
  "node_id": "verifier-01",
  "contract": "0x...",
  "verified_jobs": 42,
  "accepted": 38,
  "rejected": 4,
  "errors": 0,
  "uptime": "1.5h"
}
```

---

## Architecture notes

- Verifier nodes are **stateless** — all state lives on-chain and on IPFS
- Multiple nodes can run against the same contract; each submits its own vote independently
- **Auto-staking** — on startup the node checks `isVerifier(wallet)` and self-registers with `stakeVerifier()` (0.01 ETH) if needed; insufficient balance is logged and skipped non-fatally
- **Startup scan** — on boot, fetches `SUBMITTED` deals that have a `taskCid` from the API and processes them before the live listener starts; deals without a `taskCid` or no longer in `SUBMITTED` state are silently skipped
- **IPFS resolution** — CIDs are resolved from the Coordination API (`taskCid` / `resultCid` fields on the deal); raw worker results (no `output` wrapper) are normalised automatically; bytes32 → CIDv0 reconstruction is only used as a last resort
- **Web search in `llm_judge`** — Gemini fetches live Google Search results for the task before evaluation; the inference LLM (Venice or Gemini) scores the result against those facts, not its training data
- **WebSocket RPC required** — set `WS_RPC_URL` to a `wss://` endpoint; HTTP poll filters expire after ~5 min on Alchemy causing reconnect loops
- **ACCEPT path:** `vote(dealId, true)` records verifier approval on-chain; settlement is then triggered automatically when the worker redeems their MetaMask delegation via `DelegationManager` — no manual intervention required
- **REJECT path:** `raiseDispute(dealId)` is called immediately, placing the deal in a `DISPUTED` state
- The `MAX_CONCURRENT_JOBS` cap prevents RPC and LLM rate-limit exhaustion under burst load
- Auto-reconnects to the RPC provider on disconnect (10 s back-off)
