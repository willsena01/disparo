import { processExecution, WORKER_ID, LEASE_MS } from './engine.js';
import { claimDueExecutions } from './flowExecutionRepository.js';

const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 2000);
const BATCH_SIZE = Number(process.env.BATCH_SIZE ?? 10);

async function tick() {
  const executions = await claimDueExecutions(BATCH_SIZE, WORKER_ID, LEASE_MS);
  await Promise.all(executions.map(processExecution));
}

async function main() {
  console.log(`[executor] iniciado (worker ${WORKER_ID}), polling a cada ${POLL_INTERVAL_MS}ms`);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await tick();
    } catch (err) {
      console.error('[executor] erro no tick:', err);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

main();
