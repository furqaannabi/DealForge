# Bounty Strategy

Analysis of Synthesis Hackathon tracks against DealForge's current implementation.

---

## Already integrated — claim now

| Track | Bounty | Why it qualifies |
|---|---|---|
| **Protocol Labs** | "Let the Agent Cook" — $8,000 | Fully autonomous on-chain deal flow: post job → negotiate → escrow → submit result → settle. No human required. IPFS (Pinata) is the storage layer (Filecoin ecosystem). |
| **ENS** | ENS Identity — $600 | `ensName` is a first-class stored field on every Agent. API responses surface it in place of hex addresses in job/proposal/deal views. |

---

## Easy to add — low effort, high value

| Track | Bounty | What to build |
|---|---|---|
| **Venice** | 1st place ~$4,600 (VVV) | NegotiationEngine and Verifier already use an OpenAI-compatible endpoint via `LLM_BASE_URL`. Swap to Venice's private inference endpoint. One env-var change + add `venice` as a selectable provider. |
| **Status Network** | $2,000 (split pool) | Deploy `DealForge.sol` on Status Network Sepolia (Chain ID `1660990954`) and execute one gasless tx. Purely a deployment task — no contract code changes needed. |
| **Arkhai** | Escrow Ecosystem Extensions — $450 | DealForge is an escrow + dispute system. The bounty specifically calls out "new escrow mechanisms or dispute resolution layers." Could integrate with or extend Alkahest. |
| **MetaMask** | Best Use of Delegations — $3,000 | Use ERC-7715 to give task agents a delegation that caps how much ETH they can lock into DealForge deals per job. The delegation becomes the spending scope for `createDeal`. |

---

## Medium effort — thematically strong

| Track | Bounty | What to build |
|---|---|---|
| **Merit Systems** | $1,000 | Expose the matchmaker and NegotiationEngine as x402-gated endpoints. Worker agents pay a micropayment via AgentCash to call `/jobs/:id/matches` or `/evaluate`. Makes the API itself agent-native. |
| **Self** | $1,000 | Replace the plain EIP-712 nonce with Self Agent ID for Sybil-resistant agent registration. `POST /agents` requires a ZK proof from Self before the address is persisted. |
| **Locus** | 1st place $2,000 | Task agents hold a Locus wallet with a spending cap. `createDeal` draws from the Locus wallet, giving on-chain auditability of every deal. Must use USDC on Base. |

---

## Not worth pursuing

| Track | Reason |
|---|---|
| Uniswap, Bankr | No natural touchpoint — would be bolted on |
| bond.credit | Requires live GMX perp trading on Arbitrum — unrelated to deal infrastructure |
| SuperRare | NFT/art focus, no overlap |
| Celo | Full second deployment required with stablecoin-native payment logic |
| OpenServ, Olas | Agent marketplace integrations that compete with DealForge's own job board |

---

## Recommended order

1. **Venice** — biggest prize pool for the least code (env-var + provider switch)
2. **MetaMask** — strong thematic fit, $3k, adds meaningful trust primitive
3. **Status Network** — pure deployment task, $2k split pool
4. **Merit Systems** — makes the API agent-native; also strengthens the Protocol Labs "Agents With Receipts" angle
