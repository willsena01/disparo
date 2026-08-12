import { randomUUID } from 'node:crypto';
import { getHandler } from './nodes/index.js';
import { messenger } from '../messenger.js';
import { leads } from '../leads.js';
import { getFlow, getLead, updateExecution } from './flowExecutionRepository.js';

// Identifica esse processo como dono do lease (poller ou webhook — cada
// processo Node que importa este módulo ganha o seu, no load).
export const WORKER_ID = `${process.pid}-${randomUUID()}`;
export const LEASE_MS = Number(process.env.LEASE_MS ?? 60_000);
// Guarda-chuva contra flow mal configurado (ciclo de nodes 'running' sem
// nenhum 'wait' no meio) — sem isso o loop de uma execução travaria pra sempre.
const MAX_STEPS_PER_RUN = Number(process.env.MAX_STEPS_PER_RUN ?? 100);

function findNode(flow, nodeId) {
  const node = flow.definition_json.nodes.find((n) => n.id === nodeId);
  if (!node) {
    throw new Error(`Node "${nodeId}" não encontrado no flow "${flow.id}"`);
  }
  return node;
}

// Resume default para handlers sem `resume` próprio: uma execução que estava
// 'waiting' nesse node simplesmente segue pro próximo.
function defaultResume(execution, node) {
  return { nextNodeId: node.next_node_id, status: 'running' };
}

// Processa uma execução, avançando de node em node *no mesmo loop* enquanto
// os hops forem síncronos ('running' + nextNodeId). Só retorna quando a
// execução entra em 'waiting', termina ('completed') ou falha.
//
// Chamado tanto pelo poller (executor.js, sobre linhas já reivindicadas via
// claimDueExecutions) quanto por gatilhos externos como o webhook do
// Facebook (sobre uma linha recém-criada já com lease do próprio chamador).
export async function processExecution(execution) {
  let current = execution;
  let steps = 0;

  try {
    const flow = await getFlow(execution.flow_id);
    const lead = await getLead(execution.lead_id);

    while (true) {
      if (++steps > MAX_STEPS_PER_RUN) {
        throw new Error(
          `Excedeu ${MAX_STEPS_PER_RUN} passos síncronos nesta execução ` +
            `(node atual "${current.current_node_id}") — possível ciclo no flow sem 'wait'`
        );
      }

      const node = findNode(flow, current.current_node_id);
      const handler = getHandler(node.type);

      // current.status ainda reflete o valor pré-hop ('running' ou 'waiting');
      // é assim que sabemos se é entrada no node ou retomada de uma espera.
      const isResume = current.status === 'waiting';
      const step = isResume ? (handler.resume ?? defaultResume) : handler.execute;

      const result = await step(current, node, { messenger, lead, leads });

      const context = { ...current.context_json, ...(result.context ?? {}) };
      const nextNodeId = result.nextNodeId ?? current.current_node_id;

      // Só vira 'completed' quando o hop terminaria 'running' mas não há
      // próximo node. Um resultado 'waiting' (ex: wait.node.js, sem
      // nextNodeId) tem que permanecer 'waiting', não virar 'completed'.
      let status = result.status ?? 'running';
      if (status === 'running' && !result.nextNodeId) {
        status = 'completed';
      }

      const continueLoop = status === 'running' && Boolean(result.nextNodeId);

      await updateExecution(current.id, {
        nextNodeId,
        status,
        resumeAt: result.resumeAt ?? null,
        context,
        lease: continueLoop ? { workerId: WORKER_ID, leaseMs: LEASE_MS } : undefined,
      });

      console.log(`[engine] execution ${current.id}: ${node.type} -> ${status}`);

      if (!continueLoop) break;

      current = {
        ...current,
        current_node_id: nextNodeId,
        status: 'running',
        context_json: context,
      };
    }
  } catch (err) {
    console.error(`[engine] falha na execution ${current.id}:`, err);
    await updateExecution(current.id, {
      nextNodeId: current.current_node_id,
      status: 'failed',
      context: current.context_json,
      error: err.message,
    });
  }
}
