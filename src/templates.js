import { pool } from './db/pool.js';
import { ValidationError } from './facebookApps.js';
import { getPageByPageId } from './pages.js';

const GRAPH_VERSION = process.env.FB_GRAPH_VERSION ?? 'v21.0';

// Templates de utilidade: conteúdo reutilizável pra falar com quem está fora
// da janela de 24h.
//
// IMPORTANTE, e diferente do que costuma se supor: o Messenger NÃO tem
// aprovação de template. Isso é do WhatsApp Cloud API. Aqui o mecanismo é a
// message tag, e a Meta não revisa uma a uma — ela revisa o RECURSO da página
// (messaging_feature_review). Por isso "sincronizar" consulta a página, não um
// endpoint de template que não existe.

// Tags que a Meta aceita fora da janela de 24h. Usar tag fora dessa lista, ou
// usar a tag errada pro conteúdo, é o que leva o app a ser restringido.
export const MESSAGE_TAGS = {
  CONFIRMED_EVENT_UPDATE: 'Lembrete de evento que a pessoa confirmou',
  POST_PURCHASE_UPDATE: 'Atualização sobre uma compra que a pessoa fez',
  ACCOUNT_UPDATE: 'Mudança no cadastro ou na conta da pessoa',
  HUMAN_AGENT: 'Resposta de atendente humano (até 7 dias)',
};

export async function list(workspaceId, { pageId } = {}) {
  const params = [workspaceId];
  let filtro = '';
  if (pageId) {
    params.push(pageId);
    filtro = ' AND (page_id = $2 OR page_id IS NULL)';
  }
  const { rows } = await pool.query(
    `SELECT * FROM message_templates WHERE workspace_id = $1${filtro} ORDER BY created_at DESC`,
    params
  );
  return rows.map(toPublic);
}

export async function get(workspaceId, id) {
  const { rows } = await pool.query(
    'SELECT * FROM message_templates WHERE workspace_id = $1 AND id = $2',
    [workspaceId, id]
  );
  return rows[0] ? toPublic(rows[0]) : null;
}

export async function create(workspaceId, input) {
  const name = input.name?.trim();
  const text = input.content?.text?.trim();
  const tag = input.messageTag;

  if (!name) throw new ValidationError('name é obrigatório');
  if (!text) throw new ValidationError('content.text é obrigatório');
  if (!tag) throw new ValidationError('messageTag é obrigatório');
  if (!MESSAGE_TAGS[tag]) {
    throw new ValidationError(
      `messageTag inválida: "${tag}". A Meta só aceita ${Object.keys(MESSAGE_TAGS).join(', ')}`
    );
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO message_templates
         (workspace_id, page_id, name, content_json, message_tag)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [
        workspaceId,
        input.pageId ?? null,
        name,
        JSON.stringify({ text, buttons: input.content?.buttons ?? null }),
        tag,
      ]
    );
    return toPublic(rows[0]);
  } catch (err) {
    if (err.code === '23505') throw new ValidationError(`Já existe um template chamado "${name}"`);
    throw err;
  }
}

export async function update(workspaceId, id, input) {
  if (input.messageTag && !MESSAGE_TAGS[input.messageTag]) {
    throw new ValidationError(`messageTag inválida: "${input.messageTag}"`);
  }

  // Mexer no conteúdo invalida a sincronização anterior: o que a Meta revisou
  // (ou o que sabíamos da página) já não descreve este template.
  const mexeuNoConteudo = Boolean(input.content || input.messageTag);

  try {
    const { rows } = await pool.query(
      `UPDATE message_templates
       SET name         = COALESCE($3, name),
           content_json = COALESCE($4, content_json),
           message_tag  = COALESCE($5, message_tag),
           page_id      = CASE WHEN $6::boolean THEN $7 ELSE page_id END,
           meta_status  = CASE WHEN $8::boolean THEN 'pending' ELSE meta_status END,
           meta_status_reason = CASE WHEN $8::boolean THEN NULL ELSE meta_status_reason END
       WHERE workspace_id = $1 AND id = $2
       RETURNING *`,
      [
        workspaceId, id,
        input.name?.trim() ?? null,
        input.content ? JSON.stringify(input.content) : null,
        input.messageTag ?? null,
        Object.hasOwn(input, 'pageId'),
        input.pageId ?? null,
        mexeuNoConteudo,
      ]
    );
    return rows[0] ? toPublic(rows[0]) : null;
  } catch (err) {
    if (err.code === '23505') throw new ValidationError('Já existe um template com esse nome');
    throw err;
  }
}

export async function remove(workspaceId, id) {
  const { rows } = await pool.query(
    'SELECT COUNT(*)::int AS total FROM broadcasts WHERE template_id = $1', [id]
  );
  if (rows[0].total > 0) {
    throw new ValidationError(`Este template está em ${rows[0].total} campanha(s).`);
  }
  const res = await pool.query(
    'DELETE FROM message_templates WHERE workspace_id = $1 AND id = $2', [workspaceId, id]
  );
  return res.rowCount > 0;
}

// --------------------------------------------------------- sincronização ---

// Consulta o messaging_feature_review da página — a revisão de recurso que a
// Meta de fato faz. É isso que determina se a página pode mandar mensagem fora
// da janela, e portanto se o template é utilizável.
async function revisarPagina(pageId) {
  const page = await getPageByPageId(pageId);
  if (!page?.page_access_token) {
    return { status: 'pending', reason: `Página ${pageId} sem token — não dá pra verificar` };
  }

  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${pageId}?fields=messaging_feature_review`,
    { headers: { Authorization: `Bearer ${page.page_access_token}` } }
  );
  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    return { status: 'pending', reason: body.error?.message ?? `Graph API ${res.status}` };
  }

  const features = body.messaging_feature_review ?? [];
  const subscription = features.find((f) => f.feature === 'subscription_messaging');

  // Sem o recurso na lista, a página opera só com as tags padrão — que não
  // precisam de revisão. Do ponto de vista do template, está liberado.
  if (!subscription) {
    return {
      status: 'approved',
      reason: 'Message tags padrão não passam por revisão individual no Messenger',
    };
  }
  if (subscription.status === 'approved') return { status: 'approved', reason: null };
  if (subscription.status === 'rejected') {
    return { status: 'rejected', reason: 'A Meta rejeitou o envio de mensagens desta página' };
  }
  return { status: 'pending', reason: `Revisão da página em "${subscription.status}"` };
}

// "Sincronizar todas": revalida cada template contra a página dele.
// Sequencial pelo mesmo motivo do scan de páginas — rajada na Graph API vira
// limite de frequência.
export async function syncAll(workspaceId) {
  const { rows } = await pool.query(
    'SELECT * FROM message_templates WHERE workspace_id = $1', [workspaceId]
  );

  const resultado = { total: rows.length, aprovados: 0, pendentes: 0, rejeitados: 0 };
  const cache = new Map();

  for (const t of rows) {
    let revisao;
    if (!t.page_id) {
      // Template sem página: vale pra qualquer uma, e não há o que revisar.
      revisao = { status: 'approved', reason: 'Template geral, sem página específica' };
    } else {
      if (!cache.has(t.page_id)) cache.set(t.page_id, await revisarPagina(t.page_id));
      revisao = cache.get(t.page_id);
    }

    await pool.query(
      `UPDATE message_templates
       SET meta_status = $2, meta_status_reason = $3, meta_synced_at = now()
       WHERE id = $1`,
      [t.id, revisao.status, revisao.reason]
    );

    if (revisao.status === 'approved') resultado.aprovados++;
    else if (revisao.status === 'rejected') resultado.rejeitados++;
    else resultado.pendentes++;
  }

  return resultado;
}

// Template utilizável pra falar com um lead fora da janela: aprovado, e da
// página do lead (ou geral).
export async function templateParaEnvio(workspaceId, pageId) {
  const { rows } = await pool.query(
    `SELECT * FROM message_templates
     WHERE workspace_id = $1 AND meta_status = 'approved'
       AND (page_id = $2 OR page_id IS NULL)
     ORDER BY (page_id = $2) DESC NULLS LAST, created_at ASC
     LIMIT 1`,
    [workspaceId, pageId]
  );
  return rows[0] ? toPublic(rows[0]) : null;
}

function toPublic(t) {
  return {
    id: t.id,
    pageId: t.page_id,
    name: t.name,
    content: t.content_json,
    messageTag: t.message_tag,
    messageTagLabel: MESSAGE_TAGS[t.message_tag] ?? null,
    metaStatus: t.meta_status,
    metaStatusReason: t.meta_status_reason,
    metaSyncedAt: t.meta_synced_at,
    createdAt: t.created_at,
  };
}
