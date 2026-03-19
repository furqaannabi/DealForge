# DealForge Verifier

Independent result verification node for the DealForge protocol. Any number of verifier nodes can run alongside the Coordination API — they operate autonomously and do not share state.

---

## What it does

**Startup sequence (once, in order):**

1. **Auto-stake** — checks whether the wallet is registered as a verifier on-chain; calls `stakeVerifier()` with 0.01 ETH if not
2. **Startup scan** — queries the Coordination API for all deals already in `SUBMITTED` state and runs the full verification pipeline on each (catches deals submitted before this node started)
3. **Live listener** — subscribes to `ResultSubmitted` events for all future deals

**Per-deal pipeline:**

1. Re-reads deal state from chain — skips if no longer `SUBMITTED` (another verifier may have acted)
2. Fetches the task description and result from IPFS (resolves on-chain `bytes32` → CIDv0)
3. Routes to the appropriate verification strategy based on the task's `verificationPlan`:
   - **`schema_check`** — validates required fields and minimum record count; optionally spot-checks a random sample of rows
   - **`llm_judge`** — asks the configured LLM provider to score the result against evaluation criteria; ACCEPT if score ≥ threshold
   - **`random_sample`** — samples `sample_size` rows and checks that `check_fields` are non-empty on each
   - _(no plan)_ — falls back to a generic `llm_judge` with the criterion "Does the result fully satisfy the task specification?"
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

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `RPC_URL` | Yes | Base or Base Sepolia RPC endpoint (default: `https://sepolia.base.org`) |
| `CONTRACT_ADDRESS` | Yes | Deployed `DealForge.sol` address |
| `PRIVATE_KEY` | Yes | Funded 32-byte hex private key for submitting on-chain votes |
| `IPFS_GATEWAY` | Yes | IPFS gateway URL (default: `https://gateway.pinata.cloud`) |
| `LLM_PROVIDER` | No | Inference provider: `venice` or `gemini` (default: `venice`) |
| `VENICE_INFERENCE_KEY` | Conditionally | Required when `LLM_PROVIDER=venice` |
| `GEMINI_API_KEY` | Conditionally | Required when `LLM_PROVIDER=gemini` |
| `LLM_BASE_URL` | No | Optional override for the provider's OpenAI-compatible endpoint |
| `LLM_MODEL` | No | Optional override for the provider's default model |
| `NODE_ID` | No | Unique identifier for this verifier instance (default: `verifier-01`) |
| `PORT` | No | Health check HTTP port (default: `8080`) |
| `MAX_CONCURRENT_JOBS` | No | Max simultaneous verifications in-flight (default: `5`) |
| `API_BASE_URL` | No | Coordination API URL for startup scan of existing SUBMITTED deals |

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
- **Startup scan** — on boot, fetches `SUBMITTED` deals from the API and processes them before the live listener starts; deals no longer in `SUBMITTED` state are silently skipped
- **ACCEPT path:** `vote(dealId, true)` records verifier approval on-chain; settlement is then triggered automatically when the worker redeems their MetaMask delegation via `DelegationManager` — no manual intervention required
- **REJECT path:** `raiseDispute(dealId)` is called immediately, placing the deal in a `DISPUTED` state
- The `MAX_CONCURRENT_JOBS` cap prevents RPC and LLM rate-limit exhaustion under burst load
- Auto-reconnects to the RPC provider on disconnect (10 s back-off)
