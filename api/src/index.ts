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

// ─── Express app ─────────────────────────────────────────────────────────────

const app = express();

app.use(helmet());
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PATCH', 'DELETE'] }));
app.use(express.json({ limit: '1mb' }));
app.use(extractAgent);

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

// ─── 404 catch-all ───────────────────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ─── Error handler ────────────────────────────────────────────────────────────

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// ─── HTTP + WebSocket server ──────────────────────────────────────────────────

async function main() {
  await checkDbConnection();
  console.log('✅ Database connected');

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
    server.close(() => process.exit(0));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
