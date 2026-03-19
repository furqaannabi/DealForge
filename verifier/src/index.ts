import { config } from './config';
import { startHealthServer } from './health';
import { startListener, stopListener } from './listener';
import { ensureStaked } from './stake';
import { scanExistingDeals } from './scan';

console.log(`🔍 DealForge Verification Node starting`);
console.log(`   Node ID   → ${config.NODE_ID}`);
console.log(`   Contract  → ${config.CONTRACT_ADDRESS}`);
console.log(`   RPC       → ${config.RPC_URL}`);
console.log(`   Max jobs  → ${config.MAX_CONCURRENT_JOBS}`);

startHealthServer();

ensureStaked()
  .then(() => scanExistingDeals())
  .then(() => startListener())
  .catch((err) => {
    console.error('[startup] Error during init — starting listener anyway:', err);
    startListener();
  });

const shutdown = () => {
  console.log('\nShutting down…');
  stopListener();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
