import crypto from 'node:crypto';
import { pool } from './db/pool.js';
import { ValidationError } from './facebookApps.js';

// Campanhas de envio em massa para leads já capturados.

export const STATUSES = ['draft', 'scheduled', 'running', 'paused', 'completed', 'failed'];

// A Meta só permite mensagem livre dentro de 24h da última interação do lead.
// Fora disso é preciso mensagem etiquetada (template aprovado).
export const JANELA_24H_MS = 24 * 60 * 60 * 1000;

// ------------------------------------------------------------------ público ---

// Monta o WHERE do público a partir do filtro da campanha.
//
// Os dois padrões (só inscritos, só entregáveis) são ligados por omissão de
// propósito: disparar pra quem descadastrou ou pra quem a Meta já disse que
// está inalcançável é o caminho mais rápido pra queimar o app.
export function montarFiltroPublico(workspaceId, filtro = {}) {
  const where = ['l.workspace_id = $1'];
  const params = [workspaceId];
  const add = (sql, valor) => {
    params.push(valor);
    where.push(sql.replace('$n', `$${params.length}`));
  };

  if (filtro.onlySubscribed !== false) where.push('l.subscribed = true');
  if (filtro.onlyDeliverable !== false) where.push(`l.deliverability_status <> 'blocked'`);

  if (filtro.pageIds?.length) add('l.page_id = ANY($n)', filtro.pageIds);
  if (filtro.sources?.length) add('l.source = ANY($n)', filtro.sources);

  // Grupo de páginas é açúcar sobre page_ids: resolvido aqui pra não obrigar
  // a interface a expandir o grupo antes de criar a campanha.
  if (filtro.groupIds?.length) {
    add(
      'l.page_id IN (SELECT page_id FROM facebook_pages WHERE group_id = ANY($n))',
      filtro.groupIds
    );
  }

  // Várias tags = quem tem QUALQUER uma delas (união, não interseção): é o que
  // "público: vip, quente" significa pra quem monta a campanha.
  if (filtro.tags?.length) {
    add(
      'EXISTS (SELECT 1 FROM lead_tags t WHERE t.lead_id = l.id AND t.tag_name = ANY($n))',
      filtro.tags
    );
  }

  return { clausula: where.join(' AND '), params };
}

// Quantos leads o filtro alcança agora. A interface usa isso pra mostrar o
// tamanho do público ANTES de disparar.
export async function previewPublico(workspaceId, filtro) {
  const { clausula, params } = montarFiltroPublico(workspaceId, filtro);
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (
              WHERE l.last_interaction_at > now() - interval '24 hours'
            )::int AS na_janela
     FROM leads l WHERE ${clausula}`,
    params
  );
  return {
    total: rows[0].total,
    dentroDaJanela24h: rows[0].na_janela,
    foraDaJanela24h: rows[0].total - rows[0].na_janela,
  };
}

// ------------------------------------------------------------------- CRUD ---

function gerarCodigo() {
  return `BC-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

export async function create(workspaceId, input) {
  const name = input.name?.trim();
  if (!name) throw new ValidationError('name é obrigatório');

  const texto = input.message?.text?.trim();
  if (!texto) throw new ValidationError('message.text é obrigatório');

  if (input.scheduledAt && Number.isNaN(Date.parse(input.scheduledAt))) {
    throw new ValidationError('scheduledAt inválido');
  }

  const agendada = Boolean(input.scheduledAt);

  const { rows } = await pool.query(
    `INSERT INTO broadcasts
       (workspace_id, name, code, status, target_filter_json, message_json, template_json, scheduled_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      workspaceId,
      name,
      gerarCodigo(),
      agendada ? 'scheduled' : 'draft',
      JSON.stringify(input.targetFilter ?? {}),
      JSON.stringify({ text: texto, buttons: input.message?.buttons ?? null }),
      input.template ? JSON.stringify(input.template) : null,
      input.scheduledAt ?? null,
    ]
  );
  return toPublic(rows[0]);
}

export async function get(workspaceId, id) {
  const { rows } = await pool.query(
    'SELECT * FROM broadcasts WHERE workspace_id = $1 AND id = $2',
    [workspaceId, id]
  );
  return rows[0] ? toPublic(rows[0]) : null;
}

export async function list(workspaceId, { status } = {}) {
  const params = [workspaceId];
  let filtro = '';
  if (status) {
    params.push(status);
    filtro = ' AND status = $2';
  }
  const { rows } = await pool.query(
    `SELECT * FROM broadcasts WHERE workspace_id = $1${filtro} ORDER BY created_at DESC`,
    params
  );
  return rows.map(toPublic);
}

export async function update(workspaceId, id, input) {
  const atual = await getRow(workspaceId, id);
  if (!atual) return null;
  // Depois de começar, mudar público ou mensagem produziria uma campanha em
  // que metade das pessoas recebeu uma coisa e metade outra.
  if (!['draft', 'scheduled'].includes(atual.status)) {
    throw new ValidationError(
      `Campanha "${atual.status}" não pode ser editada. Só rascunho ou agendada.`
    );
  }

  const { rows } = await pool.query(
    `UPDATE broadcasts
     SET name               = COALESCE($3, name),
         target_filter_json = COALESCE($4, target_filter_json),
         message_json       = COALESCE($5, message_json),
         template_json      = COALESCE($6, template_json),
         scheduled_at       = CASE WHEN $7::boolean THEN $8::timestamptz ELSE scheduled_at END,
         status             = CASE
                                WHEN $7::boolean AND $8 IS NOT NULL THEN 'scheduled'
                                WHEN $7::boolean AND $8 IS NULL THEN 'draft'
                                ELSE status
                              END
     WHERE workspace_id = $1 AND id = $2
     RETURNING *`,
    [
      workspaceId, id,
      input.name?.trim() ?? null,
      input.targetFilter ? JSON.stringify(input.targetFilter) : null,
      input.message ? JSON.stringify(input.message) : null,
      input.template ? JSON.stringify(input.template) : null,
      Object.hasOwn(input, 'scheduledAt'),
      input.scheduledAt ?? null,
    ]
  );
  return toPublic(rows[0]);
}

export async function remove(workspaceId, id) {
  const atual = await getRow(workspaceId, id);
  if (!atual) return false;
  if (atual.status === 'running') {
    throw new ValidationError('Pause a campanha antes de excluir.');
  }
  // messages.broadcast_id referencia a campanha: o histórico de envio tem que
  // sobreviver à exclusão, então a referência é anulada em vez de cascatear.
  await pool.query('UPDATE messages SET broadcast_id = NULL WHERE broadcast_id = $1', [id]);
  const res = await pool.query(
    'DELETE FROM broadcasts WHERE workspace_id = $1 AND id = $2',
    [workspaceId, id]
  );
  return res.rowCount > 0;
}

async function getRow(workspaceId, id) {
  const { rows } = await pool.query(
    'SELECT * FROM broadcasts WHERE workspace_id = $1 AND id = $2',
    [workspaceId, id]
  );
  return rows[0] ?? null;
}

// -------------------------------------------------------------- ciclo de vida ---

// Congela o público em broadcast_recipients e coloca a campanha pra rodar.
//
// A materialização é ON CONFLICT DO NOTHING: retomar uma campanha ou um start
// repetido não duplica destinatário nem reenvia pra quem já recebeu.
export async function start(workspaceId, id) {
  const atual = await getRow(workspaceId, id);
  if (!atual) return null;
  if (['running', 'completed'].includes(atual.status)) {
    throw new ValidationError(`Campanha já está "${atual.status}"`);
  }

  const filtro = atual.target_filter_json ?? {};
  const { clausula, params } = montarFiltroPublico(workspaceId, filtro);

  await pool.query(
    `INSERT INTO broadcast_recipients (broadcast_id, lead_id)
     SELECT $${params.length + 1}, l.id FROM leads l WHERE ${clausula}
     ON CONFLICT (broadcast_id, lead_id) DO NOTHING`,
    [...params, id]
  );

  const { rows } = await pool.query(
    `UPDATE broadcasts
     SET status = 'running',
         started_at = COALESCE(started_at, now()),
         finished_at = NULL,
         error = NULL,
         total_recipients = (SELECT COUNT(*) FROM broadcast_recipients WHERE broadcast_id = $2)
     WHERE workspace_id = $1 AND id = $2
     RETURNING *`,
    [workspaceId, id]
  );
  return toPublic(rows[0]);
}

// Pausar só muda o status: os envios já reivindicados terminam (o lease deles
// já foi pago), e o worker para de pegar novos. Nada de progresso se perde
// porque o progresso mora em broadcast_recipients, não na memória.
export async function pause(workspaceId, id) {
  const { rows } = await pool.query(
    `UPDATE broadcasts SET status = 'paused'
     WHERE workspace_id = $1 AND id = $2 AND status = 'running'
     RETURNING *`,
    [workspaceId, id]
  );
  return rows[0] ? toPublic(rows[0]) : null;
}

export async function resume(workspaceId, id) {
  const { rows } = await pool.query(
    `UPDATE broadcasts SET status = 'running'
     WHERE workspace_id = $1 AND id = $2 AND status IN ('paused', 'failed')
     RETURNING *`,
    [workspaceId, id]
  );
  return rows[0] ? toPublic(rows[0]) : null;
}

// Progresso lido da fila, não de contador em memória — sobrevive a reinício.
export async function progress(workspaceId, id) {
  const b = await getRow(workspaceId, id);
  if (!b) return null;

  const { rows } = await pool.query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status = 'sent')::int    AS enviados,
       COUNT(*) FILTER (WHERE status = 'failed')::int  AS erros,
       COUNT(*) FILTER (WHERE status = 'skipped')::int AS pulados,
       COUNT(*) FILTER (WHERE status = 'pending')::int AS pendentes
     FROM broadcast_recipients WHERE broadcast_id = $1`,
    [id]
  );
  const p = rows[0];
  const processados = p.enviados + p.erros + p.pulados;

  return {
    id: b.id,
    status: b.status,
    total: p.total,
    enviados: p.enviados,
    erros: p.erros,
    pulados: p.pulados,
    pendentes: p.pendentes,
    percentual: p.total ? Math.round((processados / p.total) * 100) : 0,
    startedAt: b.started_at,
    finishedAt: b.finished_at,
  };
}

function toPublic(b) {
  const processados = b.total_sent + b.total_errors;
  return {
    id: b.id,
    code: b.code,
    name: b.name,
    status: b.status,
    targetFilter: b.target_filter_json,
    message: b.message_json,
    template: b.template_json,
    scheduledAt: b.scheduled_at,
    startedAt: b.started_at,
    finishedAt: b.finished_at,
    totalRecipients: b.total_recipients,
    totalSent: b.total_sent,
    totalErrors: b.total_errors,
    percentual: b.total_recipients ? Math.round((processados / b.total_recipients) * 100) : 0,
    error: b.error,
    createdAt: b.created_at,
  };
}
