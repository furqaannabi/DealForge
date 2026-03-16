# DealForge Verifier

Independent result verification node for the DealForge protocol. Any number of verifier nodes can run alongside the Coordination API — they operate autonomously and do not share state.

---

## What it does

1. Subscribes to the `ResultSubmitted` event emitted by `DealForge.sol`
2. Fetches the task description and submitted result from IPFS
3. Routes to the appropriate verification strategy based on the task's `verificationPlan`:
   - **`schema_check`** — validates the result JSON against an expected schema
   - **`llm_judge`** — asks Venice to evaluate whether the result satisfies the task spec
   - **`random_sample`** — lightweight spot-check; falls back to LLM judge if no plan is specified
4. Submits an on-chain vote (approve / reject) for the deal via a funded wallet

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

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `RPC_URL` | Yes | Base or Base Sepolia RPC endpoint |
| `CONTRACT_ADDRESS` | Yes | Deployed `DealForge.sol` address |
| `PRIVATE_KEY` | Yes | Funded wallet private key for submitting votes |
| `IPFS_GATEWAY` | Yes | Pinata (or other) IPFS gateway URL |
| `VENICE_INFERENCE_KEY` | Yes | Venice API key for private inference |
| `LLM_BASE_URL` | No | OpenAI-compatible endpoint (default: `https://api.venice.ai/api/v1`) |
| `LLM_MODEL` | No | Model name (default: `zai-org-glm-4.7`) |
| `NODE_ID` | No | Unique identifier for this verifier instance |
| `PORT` | No | Health check HTTP port (default: `3001`) |
| `MAX_CONCURRENT_JOBS` | No | Max simultaneous verifications (default: `5`) |

---

## Health check

The verifier exposes a health endpoint:

```bash
curl http://localhost:3001/health
```

```json
{ "status": "ok", "node_id": "verifier-1", "processed": 42 }
```

---

## Architecture notes

- Verifier nodes are **stateless** — all state lives on-chain and on IPFS
- Multiple nodes can run against the same contract; each submits its own vote independently
- The contract owner tallies votes and calls `resolveDispute` based on the outcome
- Auto-reconnects to the RPC provider on disconnect
