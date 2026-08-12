import { pool } from './db/pool.js';
import { appDisponivelSql, ValidationError } from './facebookApps.js';
import { checkPageToken, subscribeToPage, checkSubscription, CAMPOS_DO_WEBHOOK } from './facebookOAuth.js';

// Páginas do Facebook conectadas: leitura para o envio, conexão via OAuth,
// revalidação de token e agrupamento.

// --------------------------------------------------------------- para envio ---

// Todas as conexões pelas quais dá pra enviar por esta página, em ordem de
// rotação.
//
// Uma mesma página pode estar conectada por mais de um app ao mesmo tempo — é
// exatamente isso que permite continuar enviando quando um app é bloqueado.
// Cada linha de facebook_pages é uma conexão (uma dupla página+app, com o seu
// próprio Page Access Token), e a ordem é a mesma da rotação de apps: o app
// menos usado primeiro. App bloqueado ou no limite não entra na lista.
export async function listSendableConnections(pageId) {
  const { rows } = await pool.query(
    `SELECT p.*, a.id AS app_row_id, a.name AS app_name, a.messages_used, a.message_limit
     FROM facebook_pages p
     JOIN facebook_apps a ON a.id = p.facebook_app_id
     WHERE p.page_id = $1
       AND p.status = 'active'
       AND p.page_access_token IS NOT NULL
       AND ${appDisponivelSql('a')}
     ORDER BY a.messages_used ASC, a.created_at ASC`,
    [pageId]
  );
  return rows;
}

// A página como registro, independente de dar pra enviar por ela agora.
// Serve pra descobrir o workspace dono (o webhook precisa disso antes de
// qualquer envio) e pra reportar o motivo quando não há conexão utilizável.
export async function getPageByPageId(pageId) {
  const { rows } = await pool.query(
    `SELECT * FROM facebook_pages
     WHERE page_id = $1
     ORDER BY (status = 'active') DESC, created_at DESC
     LIMIT 1`,
    [pageId]
  );
  return rows[0] ?? null;
}

// ----------------------------------------------------------------- conexão ---

// Grava as páginas que voltaram do OAuth. É upsert por (app, page_id): refazer
// a conexão renova o token em vez de duplicar a página — e renovar o token é
// justamente o motivo de refazer.
//
// group_id fica de fora do UPDATE de propósito: o agrupamento é escolha do
// operador, e reconectar não pode desfazer isso.
export async function connectPages(workspaceId, app, usuario, paginas) {
  if (!paginas.length) return [];

  const salvas = [];
  for (const p of paginas) {
    const { rows } = await pool.query(
      `INSERT INTO facebook_pages
         (workspace_id, facebook_app_id, page_id, name, page_access_token, avatar_url,
          connected_by_name, connected_by_fb_id, status, health_status, health_checked_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active','ok',now())
       ON CONFLICT (facebook_app_id, page_id) DO UPDATE
         SET name              = EXCLUDED.name,
             page_access_token = EXCLUDED.page_access_token,
             avatar_url        = EXCLUDED.avatar_url,
             connected_by_name = EXCLUDED.connected_by_name,
             connected_by_fb_id= EXCLUDED.connected_by_fb_id,
             status            = 'active',
             health_status     = 'ok',
             health_reason     = NULL,
             health_checked_at = now()
       RETURNING *`,
      [workspaceId, app.id, p.pageId, p.name, p.accessToken, p.avatarUrl,
       usuario?.name ?? null, usuario?.id ?? null]
    );
    // Inscrever o app nos eventos é o que faz a Meta começar a mandar os
    // comentários. Feito uma vez por página, vale para todos os posts —
    // inclusive os publicados depois — sem nenhum passo a cada vídeo novo.
    //
    // Falhar aqui não desfaz a conexão: a página fica conectada com o motivo
    // registrado, e o "Escanear todas" tenta de novo. Perder o token por causa
    // de um erro de inscrição seria pior do que ficar sem receber evento.
    salvas.push(await inscreverNoWebhook(rows[0]));
  }
  return salvas;
}

// Inscreve (ou reinscreve) a página e grava o resultado.
export async function inscreverNoWebhook(pagina) {
  if (!pagina.page_access_token) return pagina;

  const r = await subscribeToPage(pagina.page_id, pagina.page_access_token);
  const { rows } = await pool.query(
    `UPDATE facebook_pages
     SET webhook_subscribed_at = CASE WHEN $2::boolean THEN now() ELSE NULL END,
         webhook_fields        = $3,
         webhook_error         = $4
     WHERE id = $1
     RETURNING *`,
    [pagina.id, r.ok, r.ok ? CAMPOS_DO_WEBHOOK : null, r.ok ? null : r.erro]
  );
  return rows[0];
}

export async function inscreverPorId(workspaceId, id) {
  const { rows } = await pool.query(
    'SELECT * FROM facebook_pages WHERE workspace_id = $1 AND id = $2', [workspaceId, id]
  );
  if (!rows[0]) return null;
  if (!rows[0].page_access_token) {
    throw new ValidationError('Esta página não tem Page Access Token — reconecte-a pelo Facebook.');
  }
  return toPublic(await inscreverNoWebhook(rows[0]));
}

// ---------------------------------------------------------------- listagem ---

function toPublic(row) {
  return {
    id: row.id,
    pageId: row.page_id,
    name: row.name,
    avatarUrl: row.avatar_url,
    status: row.status,
    health: {
      status: row.health_status,
      reason: row.health_reason,
      checkedAt: row.health_checked_at,
    },
    leadsCount: Number(row.leads_count ?? 0),
    // Recebendo eventos? Sem isso o gatilho nunca chega a ser avaliado.
    webhook: {
      inscrito: Boolean(row.webhook_subscribed_at),
      desde: row.webhook_subscribed_at,
      campos: row.webhook_fields ?? [],
      erro: row.webhook_error,
    },
    app: { id: row.facebook_app_id, name: row.app_name, status: row.app_status },
    group: row.group_id ? { id: row.group_id, name: row.group_name } : null,
    connectedBy: row.connected_by_name
      ? { name: row.connected_by_name, fbId: row.connected_by_fb_id }
      : null,
    createdAt: row.created_at,
  };
}

// A contagem de leads é por page_id (o lead é da página, não da conexão), então
// vem de subconsulta: um JOIN faria a contagem multiplicar quando a mesma
// página está conectada por dois apps.
export async function listPages(workspaceId) {
  const { rows } = await pool.query(
    `SELECT p.*,
            a.name AS app_name, a.status AS app_status,
            g.name AS group_name,
            (SELECT COUNT(*) FROM leads l WHERE l.page_id = p.page_id) AS leads_count
     FROM facebook_pages p
     JOIN facebook_apps a ON a.id = p.facebook_app_id
     LEFT JOIN page_groups g ON g.id = p.group_id
     WHERE p.workspace_id = $1
     ORDER BY a.created_at ASC, p.name ASC`,
    [workspaceId]
  );
  return rows.map(toPublic);
}

export async function unlinkPage(workspaceId, id) {
  const res = await pool.query(
    'DELETE FROM facebook_pages WHERE workspace_id = $1 AND id = $2',
    [workspaceId, id]
  );
  return res.rowCount > 0;
}

export async function setPageGroup(workspaceId, id, groupId) {
  if (groupId) {
    const { rows } = await pool.query(
      'SELECT 1 FROM page_groups WHERE workspace_id = $1 AND id = $2',
      [workspaceId, groupId]
    );
    if (!rows[0]) throw new ValidationError('Grupo não encontrado neste workspace');
  }

  const { rows } = await pool.query(
    `UPDATE facebook_pages SET group_id = $3
     WHERE workspace_id = $1 AND id = $2 RETURNING id`,
    [workspaceId, id, groupId ?? null]
  );
  return rows.length > 0;
}

// ------------------------------------------------------------- escanear ---

// Revalida o token de cada página. Token morto vira status 'inactive', o que
// já a tira da rotação de envio — o operador não precisa fazer mais nada pra
// parar de tentar enviar por uma página quebrada.
//
// Sequencial de propósito: em paralelo, dezenas de páginas viram uma rajada de
// chamadas à Graph API e a Meta responde com limite de frequência — que é
// justamente o erro que estamos tentando diagnosticar.
export async function scanAll(workspaceId) {
  const { rows: paginas } = await pool.query(
    `SELECT * FROM facebook_pages WHERE workspace_id = $1 ORDER BY created_at ASC`,
    [workspaceId]
  );

  const resultado = { total: paginas.length, ok: 0, comProblema: 0, reinscritas: 0, paginas: [] };

  for (const pagina of paginas) {
    if (!pagina.page_access_token) {
      await pool.query(
        `UPDATE facebook_pages
         SET health_status = 'token_invalid', health_reason = 'Sem Page Access Token',
             health_checked_at = now(), status = 'inactive'
         WHERE id = $1`,
        [pagina.id]
      );
      resultado.comProblema++;
      resultado.paginas.push({ id: pagina.id, pageId: pagina.page_id, health: 'token_invalid' });
      continue;
    }

    const check = await checkPageToken(pagina.page_id, pagina.page_access_token);
    const saudavel = check.health === 'ok';

    await pool.query(
      `UPDATE facebook_pages
       SET health_status     = $2,
           health_reason     = $3,
           health_checked_at = now(),
           status            = $4,
           name              = COALESCE($5, name),
           avatar_url        = COALESCE($6, avatar_url)
       WHERE id = $1`,
      [
        pagina.id,
        check.health,
        check.reason ?? null,
        // 'unknown' é falha que não soubemos classificar (rede, instabilidade):
        // não desativa a página, senão um soluço da Meta derruba tudo.
        saudavel || check.health === 'unknown' ? pagina.status : 'inactive',
        check.name ?? null,
        check.avatarUrl ?? null,
      ]
    );

    // Com o token válido, confere se o app ainda está inscrito nos eventos.
    // A inscrição cai quando alguém remove o app da página — e o sintoma é
    // "os fluxos pararam de disparar", sem nenhum erro visível em lugar nenhum.
    let inscricao = null;
    if (saudavel) {
      const { rows: [app] } = await pool.query(
        'SELECT app_id FROM facebook_apps WHERE id = $1', [pagina.facebook_app_id]
      );
      inscricao = await checkSubscription(pagina.page_id, pagina.page_access_token, app?.app_id);

      const faltandoCampo = CAMPOS_DO_WEBHOOK.some((c) => !inscricao.campos.includes(c));
      if (!inscricao.inscrito || faltandoCampo) {
        const nova = await inscreverNoWebhook(pagina);
        if (nova.webhook_subscribed_at) {
          resultado.reinscritas++;
          inscricao = { inscrito: true, campos: CAMPOS_DO_WEBHOOK };
        }
      } else {
        await pool.query(
          `UPDATE facebook_pages
           SET webhook_subscribed_at = COALESCE(webhook_subscribed_at, now()),
               webhook_fields = $2, webhook_error = NULL
           WHERE id = $1`,
          [pagina.id, inscricao.campos]
        );
      }
    }

    if (saudavel) resultado.ok++;
    else resultado.comProblema++;
    resultado.paginas.push({
      id: pagina.id, pageId: pagina.page_id, health: check.health,
      inscrito: inscricao?.inscrito ?? false,
    });
  }

  return resultado;
}
