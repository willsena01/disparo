import { pool } from './db/pool.js';
import { ValidationError } from './facebookApps.js';
import { getPageByPageId, listSendableConnections } from './pages.js';

const GRAPH_VERSION = process.env.FB_GRAPH_VERSION ?? 'v21.0';

// Regras de auto-resposta de comentário.
//
// Uma regra responde à pergunta "quando alguém comentar isto, aqui, o que a
// gente faz?" — e as três ações são independentes e combináveis:
//   resposta pública  -> responde no próprio comentário
//   resposta privada  -> manda DM (é o que captura o lead)
//   fluxo             -> coloca a pessoa numa sequência
//
// Sem nenhuma delas a regra não faz nada; o banco recusa (flow_triggers_acao_check).

export const MATCH_TYPES = ['exact', 'contains', 'any'];

function toPublic(r) {
  return {
    id: r.id,
    name: r.name,
    pageId: r.page_id,
    postId: r.post_id,
    keyword: r.keyword || null,
    matchType: r.match_type,
    privateReplyText: r.private_reply_text,
    publicReplyText: r.public_reply_text,
    flowId: r.flow_id,
    flowName: r.flow_name ?? null,
    startNodeId: r.start_node_id,
    status: r.status,
    createdAt: r.created_at,
  };
}

export async function list(workspaceId, { pageId } = {}) {
  const params = [workspaceId];
  let filtro = '';
  if (pageId) {
    params.push(pageId);
    filtro = ' AND t.page_id = $2';
  }

  const { rows } = await pool.query(
    `SELECT t.*, f.name AS flow_name
     FROM flow_triggers t
     LEFT JOIN flows f ON f.id = t.flow_id
     WHERE t.page_id IN (SELECT page_id FROM facebook_pages WHERE workspace_id = $1)${filtro}
     ORDER BY t.created_at DESC`,
    params
  );
  return rows.map(toPublic);
}

// Confere que a página é do workspace antes de deixar mexer — sem isso o id de
// uma página de outro workspace seria aceito.
async function exigirPagina(workspaceId, pageId) {
  const { rows } = await pool.query(
    'SELECT 1 FROM facebook_pages WHERE workspace_id = $1 AND page_id = $2 LIMIT 1',
    [workspaceId, pageId]
  );
  if (!rows[0]) throw new ValidationError('Página não encontrada neste workspace');
}

function validar(input) {
  const tipo = input.matchType ?? (input.keyword?.trim() ? 'contains' : 'any');
  if (!MATCH_TYPES.includes(tipo)) throw new ValidationError(`matchType inválido: ${input.matchType}`);

  const keyword = tipo === 'any' ? '' : (input.keyword?.trim() ?? '');
  if (tipo !== 'any' && !keyword) {
    throw new ValidationError('Escolha "qualquer comentário" ou informe a palavra-chave');
  }

  const dm = input.privateReplyText?.trim() || null;
  const publica = input.publicReplyText?.trim() || null;
  if (!dm && !publica && !input.flowId) {
    throw new ValidationError(
      'A regra precisa de pelo menos uma ação: resposta privada, resposta pública ou um fluxo'
    );
  }
  return { tipo, keyword, dm, publica };
}

export async function create(workspaceId, input) {
  if (!input.pageId) throw new ValidationError('Escolha a página');
  await exigirPagina(workspaceId, input.pageId);
  const { tipo, keyword, dm, publica } = validar(input);

  try {
    const { rows } = await pool.query(
      `INSERT INTO flow_triggers
         (page_id, post_id, keyword, match_type, private_reply_text, public_reply_text,
          flow_id, start_node_id, name, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'active')
       RETURNING *`,
      [
        input.pageId, input.postId?.trim() || null, keyword, tipo, dm, publica,
        input.flowId || null, input.startNodeId || null, input.name?.trim() || null,
      ]
    );
    return toPublic(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      throw new ValidationError(
        'Já existe uma regra com essa combinação de página, post e palavra-chave'
      );
    }
    throw err;
  }
}

export async function update(workspaceId, id, input) {
  const atual = await getRow(workspaceId, id);
  if (!atual) return null;

  const combinado = {
    pageId: input.pageId ?? atual.page_id,
    postId: 'postId' in input ? input.postId : atual.post_id,
    keyword: 'keyword' in input ? input.keyword : atual.keyword,
    matchType: input.matchType ?? atual.match_type,
    privateReplyText: 'privateReplyText' in input ? input.privateReplyText : atual.private_reply_text,
    publicReplyText: 'publicReplyText' in input ? input.publicReplyText : atual.public_reply_text,
    flowId: 'flowId' in input ? input.flowId : atual.flow_id,
    startNodeId: 'startNodeId' in input ? input.startNodeId : atual.start_node_id,
    name: 'name' in input ? input.name : atual.name,
  };

  await exigirPagina(workspaceId, combinado.pageId);
  const { tipo, keyword, dm, publica } = validar(combinado);

  if (input.status && !['active', 'inactive'].includes(input.status)) {
    throw new ValidationError(`status inválido: ${input.status}`);
  }

  try {
    const { rows } = await pool.query(
      `UPDATE flow_triggers
       SET page_id = $2, post_id = $3, keyword = $4, match_type = $5,
           private_reply_text = $6, public_reply_text = $7,
           flow_id = $8, start_node_id = $9, name = $10,
           status = COALESCE($11, status)
       WHERE id = $1
       RETURNING *`,
      [
        id, combinado.pageId, combinado.postId?.trim() || null, keyword, tipo, dm, publica,
        combinado.flowId || null, combinado.startNodeId || null, combinado.name?.trim() || null,
        input.status ?? null,
      ]
    );
    return toPublic(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      throw new ValidationError('Já existe outra regra com essa combinação de página, post e palavra-chave');
    }
    throw err;
  }
}

export async function remove(workspaceId, id) {
  const atual = await getRow(workspaceId, id);
  if (!atual) return false;
  await pool.query('DELETE FROM flow_triggers WHERE id = $1', [id]);
  return true;
}

async function getRow(workspaceId, id) {
  const { rows } = await pool.query(
    `SELECT t.* FROM flow_triggers t
     WHERE t.id = $1
       AND t.page_id IN (SELECT page_id FROM facebook_pages WHERE workspace_id = $2)`,
    [id, workspaceId]
  );
  return rows[0] ?? null;
}

// ---------------------------------------------------------------- matching ---

// Escolhe a regra que responde a este comentário.
//
// Prioridade, da mais específica para a mais genérica:
//   1. regra de um post específico antes de regra da página inteira
//   2. exact > contains > any
//   3. palavra-chave mais longa (mais específica)
//   4. a mais antiga, pra a escolha ser sempre a mesma diante do mesmo comentário
//
// Sem essa ordem, uma regra "qualquer comentário" engoliria as de palavra-chave
// e ninguém entenderia por que a específica nunca dispara.
export async function matchRule(pageId, postId, text) {
  const { rows } = await pool.query(
    `SELECT t.*, f.name AS flow_name, f.first_node_id, f.status AS flow_status
     FROM flow_triggers t
     LEFT JOIN flows f ON f.id = t.flow_id
     WHERE t.page_id = $1
       AND t.status = 'active'
       AND (t.post_id IS NULL OR t.post_id = $2)
       -- Regra que aponta pra um fluxo desligado não vale: é o que o
       -- interruptor do fluxo significa.
       AND (t.flow_id IS NULL OR f.status = 'active')
       AND (
         t.match_type = 'any'
         OR (t.match_type = 'contains' AND t.keyword <> ''
             AND position(lower(t.keyword) in lower($3)) > 0)
         OR (t.match_type = 'exact' AND t.keyword <> ''
             AND lower(btrim($3)) = lower(t.keyword))
       )
     ORDER BY (t.post_id IS NOT NULL) DESC,
              CASE t.match_type WHEN 'exact' THEN 0 WHEN 'contains' THEN 1 ELSE 2 END,
              length(t.keyword) DESC,
              t.created_at ASC
     LIMIT 1`,
    [pageId, postId ?? null, text ?? '']
  );
  return rows[0] ?? null;
}

// ----------------------------------------------------------------- ações ---

async function tokenDaPagina(pageId) {
  const conexoes = await listSendableConnections(pageId);
  if (conexoes[0]) return conexoes[0].page_access_token;
  // Resposta pública não gasta cota de mensagem, então serve até token de
  // página fora do rodízio de envio.
  const page = await getPageByPageId(pageId);
  return page?.page_access_token ?? null;
}

// Responde no próprio comentário, publicamente.
export async function responderPublicamente(pageId, commentId, texto) {
  const token = await tokenDaPagina(pageId);
  if (!token) return { ok: false, erro: `Página ${pageId} sem Page Access Token` };

  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${commentId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ message: texto }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, erro: body.error?.message ?? `Graph API ${res.status}` };
  return { ok: true, id: body.id };
}
