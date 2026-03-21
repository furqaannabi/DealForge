import 'dotenv/config';
import http from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import { checkDbConnection } from './db/client';
import { extractAgent, issueChallenge, verifySignature } from './middleware/auth';
import { attachWebSocketRelay } from './websocket/relay';
import jobsRouter from './routes/jobs';
import agentsRouter from './routes/agents';
import dealsRouter from './routes/deals';
import { startEventIndexer, stopEventIndexer } from './services/event-indexer';
import { fetchByCid } from './services/ipfs';

// ─── Express app ─────────────────────────────────────────────────────────────

const app = express();

app.use(helmet());
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PATCH', 'DELETE'] }));
app.use(express.json({ limit: '1mb' }));
app.use(extractAgent);

// Serialize BigInt fields (Prisma deadline / dealId) as strings
app.set('json replacer', (_key: string, value: unknown) =>
  typeof value === 'bigint' ? value.toString() : value,
);

// ─── Health ───────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() });
});

// ─── Auth ─────────────────────────────────────────────────────────────────────

app.get('/auth/challenge', issueChallenge);
app.post('/auth/verify', verifySignature);

// ─── API routes ───────────────────────────────────────────────────────────────

app.use('/jobs', jobsRouter);
app.use('/agents', agentsRouter);
app.use('/deals', dealsRouter);

// ─── IPFS proxy — public, no auth required ────────────────────────────────────
// Verifier and other services call GET /ipfs/:cid instead of hitting Pinata directly.

app.get('/ipfs/:cid', async (req, res) => {
  try {
    const data = await fetchByCid(req.params.cid);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'Failed to fetch from IPFS', detail: String(err) });
  }
});

// ─── 404 catch-all ───────────────────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ─── Global error handler ────────────────────────────────────────────────────
// Catches anything forwarded via next(err) — including errors from asyncHandler.
// Must be defined AFTER all routes.

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = (err as NodeJS.ErrnoException & { status?: number }).status ?? 500;
  console.error(`[ERROR] ${new Date().toISOString()}`, err.name, err.message);
  if (config.NODE_ENV !== 'production') console.error(err.stack);
  if (res.headersSent) return;
  res.status(status).json({
    error: err.name ?? 'InternalServerError',
    message: err.message,
    ...(config.NODE_ENV !== 'production' ? { stack: err.stack } : {}),
  });
});

// ─── HTTP + WebSocket server ──────────────────────────────────────────────────

async function main() {
  await checkDbConnection();
  console.log('✅ Database connected');

  startEventIndexer();

  const server = http.createServer(app);

  // Attach WebSocket negotiation relay
  attachWebSocketRelay(server);

  server.listen(config.PORT, () => {
    console.log(`🚀 DealForge Coordination API running on port ${config.PORT}`);
    console.log(`   REST  → http://localhost:${config.PORT}`);
    console.log(`   WS    → ws://localhost:${config.PORT}/negotiate/:jobId`);
    console.log(`   Env   → ${config.NODE_ENV}`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\nShutting down…');
    stopEventIndexer();
    server.close(() => process.exit(0));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // ── Process-level safety nets ──────────────────────────────────────────────
  // These prevent a single uncaught error from killing the entire server process.
  // The asyncHandler wrapper handles route-level errors; these catch anything else
  // (e.g. event-indexer callbacks, background timers, WebSocket handlers).

  process.on('unhandledRejection', (reason) => {
    console.error(`[UNHANDLED REJECTION] ${new Date().toISOString()}`, reason);
    // Do NOT exit — just log. PM2 / systemd will restart if truly fatal.
  });

  process.on('uncaughtException', (err) => {
    console.error(`[UNCAUGHT EXCEPTION] ${new Date().toISOString()}`, err);
    // Uncaught exceptions leave the process in an unknown state.
    // Shut down gracefully so PM2 can restart with a clean slate.
    shutdown();
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
