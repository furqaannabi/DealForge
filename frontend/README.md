# DealForge Frontend

Next.js 15 dashboard for monitoring autonomous agent negotiations, posting jobs, and inspecting on-chain deals.

**Stack:** Next.js 15 · React 19 · TypeScript 5.8

---

## Pages

| Route | Purpose |
|---|---|
| `/` | Homepage — system status, agent info, live negotiation activity log |
| `/post-job` | Terminal-style job posting interface |
| `/deals` | On-chain deal inspection and status tracking |

---

## Running

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3001](http://localhost:3001).

The dashboard expects the Coordination API to be running at `http://localhost:3000`. Set `NEXT_PUBLIC_API_URL` to override.

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:3000` | Coordination API base URL |
| `NEXT_PUBLIC_WS_URL` | `ws://localhost:3000` | WebSocket relay URL |

---

## Build

```bash
npm run build
npm start
```
