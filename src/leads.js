import { pool } from './db/pool.js';
import { ValidationError } from './facebookApps.js';

export const SOURCES = ['comment', 'import', 'broadcast', 'manual'];
export const DELIVERABILITY = ['ok', 'failing', 'blocked'];

// Depois de quantas falhas seguidas o lead deixa de ser considerado alcançável.
// 1 falha é ruído (instabilidade, timeout); 3 seguidas é padrão.
const FALHAS_ATE_FAILING = 3;

export const leads = {
  // Upsert por (page_id, psid): comentário do mesmo usuário na mesma página
  // sempre resolve pro mesmo lead.
  //
  // O WHERE no ON CONFLICT não é opcional: idx_leads_page_psid é um índice
  // parcial, e o Postgres só o infere como árbitro se o predicado for
  // repetido aqui. Sem ele o INSERT falha com 42P10.
  //
  // name, avatar e workspaceId usam COALESCE no update pra não apagar dado já
  // gravado quando um evento posterior vier sem eles. source fica de fora: a
  // origem é de quando o lead ENTROU, e reescrevê-la apagaria a história.
  async findOrCreateLead(psid, pageId, { name, workspaceId, avatarUrl, source } = {}) {
    const { rows } = await pool.query(
      `INSERT INTO leads (psid, page_id, name, workspace_id, avatar_url, source, last_interaction_at)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'comment'), now())
       ON CONFLICT (page_id, psid) WHERE psid IS NOT NULL DO UPDATE
         SET name                = COALESCE(leads.name, EXCLUDED.name),
             workspace_id        = COALESCE(leads.workspace_id, EXCLUDED.workspace_id),
             avatar_url          = COALESCE(EXCLUDED.avatar_url, leads.avatar_url),
             last_interaction_at = now()
       RETURNING *`,
      [psid, pageId, name ?? null, workspaceId ?? null, avatarUrl ?? null, source ?? null]
    );
    return rows[0];
  },

  // ------------------------------------------------------------------ tags ---

  // Idempotente pela PK composta de lead_tags — sem SELECT antes.
  async addTag(leadId, tagName) {
    const tag = tagName?.trim();
    if (!tag) throw new ValidationError('tag_name vazio');
    await pool.query(
      `INSERT INTO lead_tags (lead_id, tag_name) VALUES ($1, $2)
       ON CONFLICT (lead_id, tag_name) DO NOTHING`,
      [leadId, tag]
    );
  },

  async removeTag(leadId, tagName) {
    const res = await pool.query(
      'DELETE FROM lead_tags WHERE lead_id = $1 AND tag_name = $2',
      [leadId, tagName]
    );
    return res.rowCount > 0;
  },

  async hasTag(leadId, tagName) {
    const { rows } = await pool.query(
      'SELECT 1 FROM lead_tags WHERE lead_id = $1 AND tag_name = $2',
      [leadId, tagName]
    );
    return rows.length > 0;
  },

  async listTags(leadId) {
    const { rows } = await pool.query(
      'SELECT tag_name, created_at FROM lead_tags WHERE lead_id = $1 ORDER BY created_at ASC',
      [leadId]
    );
    return rows.map((r) => ({ name: r.tag_name, createdAt: r.created_at }));
  },

  // Todas as tags em uso no workspace — alimenta o filtro da listagem.
  async listWorkspaceTags(workspaceId) {
    const { rows } = await pool.query(
      `SELECT lt.tag_name, COUNT(DISTINCT lt.lead_id)::int AS leads_count
       FROM lead_tags lt
       JOIN leads l ON l.id = lt.lead_id
       WHERE l.workspace_id = $1
       GROUP BY lt.tag_name
       ORDER BY leads_count DESC, lt.tag_name ASC`,
      [workspaceId]
    );
    return rows.map((r) => ({ name: r.tag_name, leadsCount: r.leads_count }));
  },

  // --------------------------------------------------------- interação ---

  // Chamado sempre que o lead dá sinal de vida (comentário, resposta no
  // Messenger). Além do carimbo, zera o histórico de falha: se a pessoa acabou
  // de interagir, ela é alcançável de novo — inclusive quando estava 'blocked'.
  async touchInteraction(leadId) {
    await pool.query(
      `UPDATE leads
       SET last_interaction_at = now(),
           deliverability_status = 'ok',
           consecutive_failures = 0
       WHERE id = $1`,
      [leadId]
    );
  },

  // Resultado de um envio. `bloqueado` vem do canal quando a Meta diz
  // explicitamente que não dá pra falar com essa pessoa — nesse caso não faz
  // sentido esperar 3 falhas, já se sabe o desfecho.
  async recordDeliveryResult(leadId, { ok, bloqueado = false } = {}) {
    if (ok) {
      await pool.query(
        `UPDATE leads SET consecutive_failures = 0, deliverability_status = 'ok' WHERE id = $1`,
        [leadId]
      );
      return;
    }

    await pool.query(
      `UPDATE leads
       SET consecutive_failures = consecutive_failures + 1,
           deliverability_status = CASE
             WHEN $2::boolean THEN 'blocked'
             WHEN consecutive_failures + 1 >= $3 THEN 'failing'
             ELSE deliverability_status
           END
       WHERE id = $1`,
      [leadId, bloqueado, FALHAS_ATE_FAILING]
    );
  },

  // ------------------------------------------------------------------ CRUD ---

  async get(workspaceId, id) {
    const { rows } = await pool.query(
      `SELECT l.*, p.name AS page_name
       FROM leads l
       LEFT JOIN LATERAL (
         SELECT name FROM facebook_pages WHERE page_id = l.page_id LIMIT 1
       ) p ON true
       WHERE l.workspace_id = $1 AND l.id = $2`,
      [workspaceId, id]
    );
    if (!rows[0]) return null;
    return { ...toPublic(rows[0]), tags: await leads.listTags(id) };
  },

  async update(workspaceId, id, input) {
    if (input.deliverabilityStatus && !DELIVERABILITY.includes(input.deliverabilityStatus)) {
      throw new ValidationError(`deliverability_status inválido: ${input.deliverabilityStatus}`);
    }
    if (input.source && !SOURCES.includes(input.source)) {
      throw new ValidationError(`source inválido: ${input.source}`);
    }

    const { rows } = await pool.query(
      `UPDATE leads
       SET name                  = COALESCE($3, name),
           subscribed            = COALESCE($4, subscribed),
           source                = COALESCE($5, source),
           deliverability_status = COALESCE($6, deliverability_status)
       WHERE workspace_id = $1 AND id = $2
       RETURNING *`,
      [
        workspaceId, id,
        input.name?.trim() ?? null,
        typeof input.subscribed === 'boolean' ? input.subscribed : null,
        input.source ?? null,
        input.deliverabilityStatus ?? null,
      ]
    );
    return rows[0] ? toPublic(rows[0]) : null;
  },

  async remove(workspaceId, id) {
    // lead_tags cai por ON DELETE CASCADE; messages e flow_executions
    // referenciam o lead, então excluir só é possível sem histórico.
    const { rows } = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM messages WHERE lead_id = $1) +
         (SELECT COUNT(*) FROM flow_executions WHERE lead_id = $1) AS refs`,
      [id]
    );
    if (Number(rows[0].refs) > 0) {
      throw new ValidationError(
        'Este lead tem histórico de mensagens ou fluxos. Descadastre em vez de excluir.'
      );
    }
    const res = await pool.query('DELETE FROM leads WHERE workspace_id = $1 AND id = $2', [
      workspaceId, id,
    ]);
    return res.rowCount > 0;
  },

  // -------------------------------------------------------------- listagem ---

  async list(workspaceId, filtros = {}) {
    const page = Math.max(1, Number(filtros.page) || 1);
    const perPage = Math.min(200, Math.max(1, Number(filtros.perPage) || 25));

    const where = ['l.workspace_id = $1'];
    const params = [workspaceId];
    const add = (sql, valor) => {
      params.push(valor);
      where.push(sql.replace('$n', `$${params.length}`));
    };

    if (filtros.pageId) add('l.page_id = $n', filtros.pageId);
    if (filtros.source) add('l.source = $n', filtros.source);
    if (filtros.deliverability) add('l.deliverability_status = $n', filtros.deliverability);
    if (typeof filtros.subscribed === 'boolean') add('l.subscribed = $n', filtros.subscribed);
    if (filtros.tag) {
      add('EXISTS (SELECT 1 FROM lead_tags t WHERE t.lead_id = l.id AND t.tag_name = $n)', filtros.tag);
    }
    if (filtros.q?.trim()) {
      // position() em vez de ILIKE pelo mesmo motivo do match de keyword: com
      // ILIKE, um "%" digitado na busca vira coringa em vez de texto.
      params.push(filtros.q.trim());
      const i = params.length;
      where.push(
        `(position(lower($${i}) in lower(COALESCE(l.name, ''))) > 0 OR position(lower($${i}) in lower(l.psid)) > 0)`
      );
    }

    const clausula = where.join(' AND ');

    const { rows: totalRows } = await pool.query(
      `SELECT COUNT(*)::int AS total FROM leads l WHERE ${clausula}`,
      params
    );
    const total = totalRows[0].total;

    // As tags vêm agregadas por subconsulta: com JOIN, um lead com 3 tags
    // viraria 3 linhas e estouraria a paginação.
    const { rows } = await pool.query(
      `SELECT l.*,
              p.name AS page_name,
              COALESCE(
                (SELECT array_agg(t.tag_name ORDER BY t.created_at)
                 FROM lead_tags t WHERE t.lead_id = l.id),
                '{}'
              ) AS tags
       FROM leads l
       LEFT JOIN LATERAL (
         SELECT name FROM facebook_pages WHERE page_id = l.page_id LIMIT 1
       ) p ON true
       WHERE ${clausula}
       ORDER BY COALESCE(l.last_interaction_at, l.created_at) DESC, l.id
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, perPage, (page - 1) * perPage]
    );

    return {
      data: rows.map(toPublic),
      total,
      page,
      perPage,
      totalPages: Math.ceil(total / perPage) || 1,
    };
  },
};

function toPublic(row) {
  return {
    id: row.id,
    name: row.name,
    avatarUrl: row.avatar_url,
    psid: row.psid,
    pageId: row.page_id,
    pageName: row.page_name ?? null,
    source: row.source,
    subscribed: row.subscribed,
    lastInteractionAt: row.last_interaction_at,
    deliverability: row.deliverability_status,
    consecutiveFailures: row.consecutive_failures,
    tags: row.tags ?? [],
    createdAt: row.created_at,
  };
}
