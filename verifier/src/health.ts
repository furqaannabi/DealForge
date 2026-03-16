import express from 'express';
import { config } from './config';

const startTime = Date.now();

// Counters updated by the main pipeline
export const stats = {
  verified: 0,
  accepted: 0,
  rejected: 0,
  errors: 0,
};

export function startHealthServer(): void {
  const app = express();

  app.get('/health', (_req, res) => {
    const uptimeMs = Date.now() - startTime;
    const uptimeHours = (uptimeMs / 3_600_000).toFixed(1);

    res.json({
      status: 'running',
      node_id: config.NODE_ID,
      contract: config.CONTRACT_ADDRESS,
      verified_jobs: stats.verified,
      accepted: stats.accepted,
      rejected: stats.rejected,
      errors: stats.errors,
      uptime: `${uptimeHours}h`,
    });
  });

  app.listen(config.PORT, () => {
    console.log(`🩺 Health endpoint → http://localhost:${config.PORT}/health`);
  });
}
