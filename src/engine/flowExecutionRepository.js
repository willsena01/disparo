import { pool } from '../db/pool.js';

// Busca e "reserva" (lease) um lote de execuções prontas para processar:
// - status 'running' (acabaram de ser criadas ou seguem em cadeia)
// - status 'waiting' cujo resume_at já chegou
// - sem lease ativo (locked_until nulo ou já expirado)
// SELECT + UPDATE em uma única statement (CTE): o FOR UPDATE SKIP LOCKED evita
// que dois workers peguem a mesma linha no mesmo instante, e o lease
// (locked_by/locked_until) evita que um segundo worker reclame a mesma linha
// depois que o claim já comitou, enquanto o primeiro ainda está processando.
// Se um worker cair segurando o lease, a linha volta a ficar elegível quando
// locked_until expira.
export async function claimDueExecutions(limit = 10, workerId, leaseMs = 60_000) {
  const { rows } = await pool.query(
    `WITH due AS (
       SELECT id FROM flow_executions
       WHERE (status = 'running' OR (status = 'waiting' AND resume_at <= now()))
         AND (locked_until IS NULL OR locked_until < now())
       ORDER BY updated_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     UPDATE flow_executions fe
     SET locked_by = $2,
         locked_until = now() + ($3 || ' milliseconds')::interval,
         updated_at = now()
     FROM due
     WHERE fe.id = due.id
     RETURNING fe.*`,
    [limit, workerId, leaseMs]
  );
  return rows;
}

// Cria uma execução já "reivindicada" por quem a criou (ex: o handler do
// webhook, que vai chamar processExecution imediatamente em seguida). Isso
// impede que o poller pegue essa linha ao mesmo tempo — sem isso haveria uma
// corrida entre o processamento inline e o próximo tick do poller.
// `context` guarda o que o gatilho sabe e os nodes vão precisar depois — no
// caso do webhook, o comment_id, que é o que autoriza a primeira mensagem via
// private_replies.
export async function createExecution(flowId, leadId, firstNodeId, lease, { context, workspaceId } = {}) {
  const lockedBy = lease ? lease.workerId : null;
  const lockedUntil = lease ? new Date(Date.now() + lease.leaseMs) : null;
  const { rows } = await pool.query(
    `INSERT INTO flow_executions
       (flow_id, lead_id, current_node_id, status, locked_by, locked_until, context_json, workspace_id)
     VALUES ($1, $2, $3, 'running', $4, $5, $6, $7)
     RETURNING *`,
    [flowId, leadId, firstNodeId, lockedBy, lockedUntil, context ?? {}, workspaceId ?? null]
  );
  return rows[0];
}

export async function getFlow(flowId) {
  const { rows } = await pool.query('SELECT * FROM flows WHERE id = $1', [flowId]);
  return rows[0] ?? null;
}

export async function getLead(leadId) {
  const { rows } = await pool.query('SELECT * FROM leads WHERE id = $1', [leadId]);
  return rows[0] ?? null;
}

// Grava o resultado de um hop. Por padrão libera o lease (fica pronta pro
// próximo tick de qualquer worker). Passe `lease: { workerId, leaseMs }`
// quando o executor vai continuar processando essa execução no mesmo loop
// (hop intermediário de uma cadeia síncrona) — isso RENOVA o lease em vez de
// liberá-lo, evitando que outro worker roube a linha no meio do caminho.
export async function updateExecution(id, { nextNodeId, status, resumeAt, context, error, lease }) {
  const lockedBy = lease ? lease.workerId : null;
  const lockedUntil = lease ? new Date(Date.now() + lease.leaseMs) : null;
  await pool.query(
    `UPDATE flow_executions
     SET current_node_id = $2,
         status = $3,
         resume_at = $4,
         context_json = $5,
         error = $6,
         locked_by = $7,
         locked_until = $8,
         updated_at = now()
     WHERE id = $1`,
    [id, nextNodeId, status, resumeAt ?? null, context ?? {}, error ?? null, lockedBy, lockedUntil]
  );
}
