import { randomUUID } from 'node:crypto';
import { pool } from './db/pool.js';
import { messenger } from './messenger.js';
import { JANELA_24H_MS, montarFiltroPublico } from './broadcasts.js';

// Worker da fila de broadcasts.
//
// Mesmo mecanismo do motor de fluxos: a fila é uma tabela
// (broadcast_recipients) com lease, não uma estrutura em memória. Isso é o que
// faz pausar/retomar e reinício de processo não perderem progresso, e permite
// mais de um worker sem enviar duas vezes pro mesmo lead.

export const WORKER_ID = `bc-${process.pid}-${randomUUID()}`;
export const LEASE_MS = Number(process.env.BROADCAST_LEASE_MS ?? 60_000);

// Rate limit: no máximo LOTE destinatários por tick. Com o padrão (10 a cada
// 1000ms) dá ~10 msg/s, folgado dentro do que a Meta aceita. Aumentar o lote
// ou diminuir o intervalo sobe a taxa — mas o teto real é o do app, e estourar
// devolve code 4, que tira o app de circulação.
const LOTE = Number(process.env.BROADCAST_BATCH ?? 10);
const INTERVALO_MS = Number(process.env.BROADCAST_INTERVAL_MS ?? 1000);

// Quantas vezes tentar o mesmo destinatário antes de desistir dele.
const MAX_TENTATIVAS = Number(process.env.BROADCAST_MAX_ATTEMPTS ?? 2);

// Promove campanhas agendadas cuja hora chegou, materializando o público.
//
// O UPDATE condicional é a trava: dois workers rodando, só um consegue mudar
// de 'scheduled' pra 'running', e só ele materializa.
export async function promoverAgendadas() {
  const { rows } = await pool.query(
    `UPDATE broadcasts SET status = 'running', started_at = COALESCE(started_at, now())
     WHERE status = 'scheduled' AND scheduled_at IS NOT NULL AND scheduled_at <= now()
     RETURNING *`
  );

  for (const b of rows) {
    const { clausula, params } = montarFiltroPublico(b.workspace_id, b.target_filter_json ?? {});
    await pool.query(
      `INSERT INTO broadcast_recipients (broadcast_id, lead_id)
       SELECT $${params.length + 1}, l.id FROM leads l WHERE ${clausula}
       ON CONFLICT (broadcast_id, lead_id) DO NOTHING`,
      [...params, b.id]
    );
    await pool.query(
      `UPDATE broadcasts SET total_recipients =
         (SELECT COUNT(*) FROM broadcast_recipients WHERE broadcast_id = $1)
       WHERE id = $1`,
      [b.id]
    );
    console.log(`[broadcast] campanha agendada "${b.name}" começou`);
  }
  return rows.length;
}

// Reivindica um lote de destinatários pendentes de campanhas EM ANDAMENTO.
//
// O JOIN com broadcasts dentro do claim é o que faz o "pausar" funcionar sem
// nenhum sinal entre processos: a campanha sai de 'running' e o worker
// simplesmente para de enxergar as linhas dela.
export async function claimDestinatarios(limite = LOTE, workerId = WORKER_ID, leaseMs = LEASE_MS) {
  const { rows } = await pool.query(
    `WITH fila AS (
       SELECT r.id FROM broadcast_recipients r
       JOIN broadcasts b ON b.id = r.broadcast_id
       WHERE r.status = 'pending'
         AND b.status = 'running'
         AND (r.locked_until IS NULL OR r.locked_until < now())
       ORDER BY r.created_at ASC
       LIMIT $1
       FOR UPDATE OF r SKIP LOCKED
     )
     UPDATE broadcast_recipients r
     SET locked_by = $2, locked_until = now() + ($3 || ' milliseconds')::interval
     FROM fila
     WHERE r.id = fila.id
     RETURNING r.*`,
    [limite, workerId, leaseMs]
  );
  return rows;
}

async function finalizarDestinatario(id, status, errorReason) {
  await pool.query(
    `UPDATE broadcast_recipients
     SET status = $2, error_reason = $3, attempts = attempts + 1,
         sent_at = CASE WHEN $2 = 'sent' THEN now() ELSE sent_at END,
         locked_by = NULL, locked_until = NULL
     WHERE id = $1`,
    [id, status, errorReason ?? null]
  );
}

// Devolve o destinatário pra fila (sem consumir o status final) quando ainda
// há tentativa sobrando.
async function reenfileirar(id) {
  await pool.query(
    `UPDATE broadcast_recipients
     SET attempts = attempts + 1, locked_by = NULL, locked_until = NULL
     WHERE id = $1`,
    [id]
  );
}

// Qual conteúdo usar pra falar com quem está fora da janela de 24h.
//
// Ordem: o template escolhido na campanha (se ainda aprovado) > qualquer
// template aprovado da página > o template_json cru da campanha (compatível
// com campanhas criadas antes de existir a tabela de templates).
//
// Template `pending` ou `rejected` não é usado: enviar com ele é justamente o
// que faz a Meta restringir o app.
async function resolverTemplate(ctx) {
  if (ctx.template_id) {
    const { rows } = await pool.query(
      `SELECT * FROM message_templates WHERE id = $1 AND meta_status = 'approved'`,
      [ctx.template_id]
    );
    if (rows[0]) return { conteudo: rows[0].content_json, tag: rows[0].message_tag };
  }

  const { rows } = await pool.query(
    `SELECT * FROM message_templates
     WHERE workspace_id = $1 AND meta_status = 'approved'
       AND (page_id = $2 OR page_id IS NULL)
     ORDER BY (page_id = $2) DESC NULLS LAST, created_at ASC
     LIMIT 1`,
    [ctx.workspace_id, ctx.page_id]
  );
  if (rows[0]) return { conteudo: rows[0].content_json, tag: rows[0].message_tag };

  const cru = ctx.template_json;
  if (cru?.text && cru?.tag) return { conteudo: cru, tag: cru.tag };

  return null;
}

export async function processarDestinatario(recipient) {
  const { rows } = await pool.query(
    `SELECT b.*, l.id AS lead_id, l.psid, l.page_id, l.workspace_id AS lead_ws,
            l.messaging_opened_at, l.last_interaction_at, l.name AS lead_name
     FROM broadcast_recipients r
     JOIN broadcasts b ON b.id = r.broadcast_id
     JOIN leads l ON l.id = r.lead_id
     WHERE r.id = $1`,
    [recipient.id]
  );
  const ctx = rows[0];
  if (!ctx) return finalizarDestinatario(recipient.id, 'failed', 'Campanha ou lead sumiu');

  const lead = {
    id: ctx.lead_id, psid: ctx.psid, page_id: ctx.page_id,
    workspace_id: ctx.lead_ws, messaging_opened_at: ctx.messaging_opened_at,
    name: ctx.lead_name,
  };

  // Janela de 24h: dentro dela a mensagem é livre; fora, a Meta só aceita
  // mensagem etiquetada. Sem template configurado não dá pra enviar — e pular
  // é mais honesto do que tentar e tomar erro da Meta em cima de cada lead.
  const dentroDaJanela =
    ctx.last_interaction_at && Date.now() - new Date(ctx.last_interaction_at) < JANELA_24H_MS;

  let conteudo = ctx.message_json;
  let extras = {};

  if (!dentroDaJanela) {
    const template = await resolverTemplate(ctx);
    if (!template) {
      return finalizarDestinatario(
        recipient.id, 'skipped',
        'Fora da janela de 24h e a campanha não tem template aprovado configurado'
      );
    }
    conteudo = template.conteudo;
    extras = { messagingType: 'MESSAGE_TAG', tag: template.tag };
  }

  try {
    await messenger.send(lead, conteudo.text, conteudo.buttons, {
      broadcastId: ctx.id,
      ...extras,
    });
    await finalizarDestinatario(recipient.id, 'sent');
  } catch (err) {
    // Erro de conta (limite do app, restrição, nenhum app disponível no
    // momento) é transitório do ponto de vista do lead: outro app pode
    // entregar, ou o mesmo depois que o limite resetar. Vale nova tentativa,
    // limitada por attempts pra não girar pra sempre.
    //
    // Erro do destinatário (bloqueou a página, PSID inválido) não entra aqui —
    // repetir só gastaria envio pra dar o mesmo erro.
    const transitorio = err.bloqueiaApp || err.semAppDisponivel;
    const podeTentarDeNovo = transitorio && recipient.attempts + 1 < MAX_TENTATIVAS;
    if (podeTentarDeNovo) await reenfileirar(recipient.id);
    else await finalizarDestinatario(recipient.id, 'failed', err.message);
  }
}

// Recalcula os contadores da campanha e a encerra quando não sobra pendente.
export async function atualizarProgresso(broadcastId) {
  const { rows } = await pool.query(
    `UPDATE broadcasts b
     SET total_sent   = c.enviados,
         total_errors = c.erros,
         status       = CASE WHEN b.status = 'running' AND c.pendentes = 0 THEN 'completed' ELSE b.status END,
         finished_at  = CASE WHEN b.status = 'running' AND c.pendentes = 0 THEN now() ELSE b.finished_at END
     FROM (
       SELECT COUNT(*) FILTER (WHERE status = 'sent')::int    AS enviados,
              COUNT(*) FILTER (WHERE status = 'failed')::int  AS erros,
              COUNT(*) FILTER (WHERE status = 'pending')::int AS pendentes
       FROM broadcast_recipients WHERE broadcast_id = $1
     ) c
     WHERE b.id = $1
     RETURNING b.status, b.total_sent, b.total_errors`,
    [broadcastId]
  );
  return rows[0] ?? null;
}

export async function tick() {
  await promoverAgendadas();

  const destinatarios = await claimDestinatarios();
  if (!destinatarios.length) return 0;

  // Sequencial de propósito: em paralelo o lote inteiro sai no mesmo
  // instante e vira pico, que é justamente o que o rate limit existe pra evitar.
  for (const r of destinatarios) {
    await processarDestinatario(r);
  }

  for (const id of new Set(destinatarios.map((r) => r.broadcast_id))) {
    await atualizarProgresso(id);
  }

  return destinatarios.length;
}

export async function main() {
  console.log(`[broadcast] worker ${WORKER_ID}, lote ${LOTE} a cada ${INTERVALO_MS}ms`);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await tick();
    } catch (err) {
      console.error('[broadcast] erro no tick:', err);
    }
    await new Promise((r) => setTimeout(r, INTERVALO_MS));
  }
}

// Só entra em loop quando executado direto (npm run broadcast-worker); ao ser
// importado por um teste, expõe as funções sem disparar nada.
if (process.argv[1]?.endsWith('broadcastWorker.js')) main();
