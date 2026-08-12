import crypto from 'node:crypto';
import { pool } from './db/pool.js';

// Apps do Meta: CRUD, controle de limite e rotação automática.
//
// A rotação é o ponto crítico da ferramenta. Quando a Meta restringe um app,
// os envios por ele param; sem rotação a operação inteira para junto. A regra
// é escolher o app a cada envio, nunca fixar um.

export const APP_STATUSES = ['active', 'blocked', 'disabled'];

// ---------------------------------------------------------------- rotação ---

// Predicado de "dá pra enviar por este app". Usado tanto na escolha do app
// quanto na escolha da conexão de página (src/pages.js) — precisa ser um só,
// senão a página oferece um app que a rotação já considera esgotado.
// `alias` é o prefixo da tabela na query de destino (ex: 'a' em `... a ON`).
export function appDisponivelSql(alias = '') {
  const p = alias ? `${alias}.` : '';
  return `${p}status = 'active'
          AND (${p}message_limit IS NULL OR ${p}messages_used < ${p}message_limit)`;
}

// Próximo app disponível do workspace.
//
// Ordena por messages_used ASC (menos usado primeiro) em vez de pegar sempre o
// primeiro cadastrado: distribui o volume entre os apps, o que atrasa o momento
// em que qualquer um deles bate no teto. App 'blocked' ou no limite simplesmente
// não aparece na consulta — é isso que faz o "pular" ser automático, sem
// nenhum passo de intervenção.
export async function getNextAvailableApp(workspaceId) {
  const { rows } = await pool.query(
    `SELECT * FROM facebook_apps
     WHERE workspace_id = $1 AND ${appDisponivelSql()}
     ORDER BY messages_used ASC, created_at ASC
     LIMIT 1`,
    [workspaceId]
  );
  return rows[0] ?? null;
}

// Incrementa o uso e, se com isso o app bateu no teto, já o tira de circulação
// na mesma statement — sem uma segunda consulta e sem janela em que a rotação
// ainda enxergaria o app como disponível.
export async function incrementMessagesUsed(appId) {
  if (!appId) return null;
  const { rows } = await pool.query(
    `UPDATE facebook_apps
     SET messages_used = messages_used + 1,
         status = CASE
                    WHEN message_limit IS NOT NULL AND messages_used + 1 >= message_limit
                      THEN 'blocked'
                    ELSE status
                  END,
         blocked_at = CASE
                        WHEN message_limit IS NOT NULL AND messages_used + 1 >= message_limit
                             AND status = 'active'
                          THEN now()
                        ELSE blocked_at
                      END,
         blocked_reason = CASE
                            WHEN message_limit IS NOT NULL AND messages_used + 1 >= message_limit
                                 AND status = 'active'
                              THEN 'Limite de mensagens do app atingido'
                            ELSE blocked_reason
                          END
     WHERE id = $1
     RETURNING *`,
    [appId]
  );
  return rows[0] ?? null;
}

// Tira o app de circulação. Chamado pelo canal de envio quando a Meta responde
// com um erro que indica restrição — é o que fecha o ciclo "levou bloqueio ->
// continua enviando pelos outros" sem ninguém mexer no painel.
export async function markAppBlocked(appId, reason) {
  if (!appId) return null;
  const { rows } = await pool.query(
    `UPDATE facebook_apps
     SET status = 'blocked', blocked_at = now(), blocked_reason = $2
     WHERE id = $1 AND status <> 'blocked'
     RETURNING *`,
    [appId, reason ?? null]
  );
  return rows[0] ?? null;
}

// ------------------------------------------------------------------- CRUD ---

// O App Secret nunca sai da API: com ele qualquer um forja evento de webhook
// assinado. Só os 4 últimos caracteres, o suficiente pra conferir qual é.
// O verify token sai inteiro de propósito — a tela de Configurações precisa
// dele pra você colar no painel do Meta.
function toPublic(app) {
  const secret = app.app_secret ?? '';
  return {
    id: app.id,
    name: app.name,
    appId: app.app_id,
    appSecretMasked: secret ? `${'•'.repeat(8)}${secret.slice(-4)}` : null,
    webhookVerifyToken: app.webhook_verify_token,
    status: app.status,
    messagesUsed: app.messages_used,
    messageLimit: app.message_limit,
    // null = sem teto configurado; a tela mostra "sem limite" em vez de 0%
    pctUsed: app.message_limit ? Math.min(1, app.messages_used / app.message_limit) : null,
    pagesCount: app.pages_count ?? undefined,
    blockedAt: app.blocked_at,
    blockedReason: app.blocked_reason,
    createdAt: app.created_at,
  };
}

export async function listApps(workspaceId) {
  const { rows } = await pool.query(
    `SELECT fa.*, COUNT(fp.id)::int AS pages_count
     FROM facebook_apps fa
     LEFT JOIN facebook_pages fp ON fp.facebook_app_id = fa.id
     WHERE fa.workspace_id = $1
     GROUP BY fa.id
     ORDER BY fa.created_at ASC`,
    [workspaceId]
  );
  return rows.map(toPublic);
}

export async function getApp(workspaceId, id) {
  const { rows } = await pool.query(
    'SELECT * FROM facebook_apps WHERE workspace_id = $1 AND id = $2',
    [workspaceId, id]
  );
  return rows[0] ? toPublic(rows[0]) : null;
}

export async function createApp(workspaceId, input) {
  const name = input.name?.trim();
  const appId = input.appId?.trim();
  const appSecret = input.appSecret?.trim();

  if (!name) throw new ValidationError('name é obrigatório');
  if (!appId) throw new ValidationError('appId é obrigatório');
  if (!appSecret) throw new ValidationError('appSecret é obrigatório');

  // Sem token informado, geramos um: é um segredo compartilhado que só precisa
  // ser igual dos dois lados, e deixar o operador inventar convida a "1234".
  const verifyToken = input.webhookVerifyToken?.trim() || crypto.randomBytes(24).toString('hex');

  try {
    const { rows } = await pool.query(
      `INSERT INTO facebook_apps
         (workspace_id, name, app_id, app_secret, webhook_verify_token, message_limit)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [workspaceId, name, appId, appSecret, verifyToken, input.messageLimit ?? null]
    );
    return toPublic(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      throw new ValidationError(`O App ID ${appId} já está cadastrado neste workspace`);
    }
    throw err;
  }
}

export async function updateApp(workspaceId, id, input) {
  if (input.status && !APP_STATUSES.includes(input.status)) {
    throw new ValidationError(`status inválido: ${input.status}`);
  }

  // Reativar manualmente limpa o registro do bloqueio — senão a tela seguiria
  // mostrando "bloqueado por X" num app que voltou a enviar.
  const { rows } = await pool.query(
    `UPDATE facebook_apps
     SET name                 = COALESCE($3, name),
         app_secret           = COALESCE($4, app_secret),
         webhook_verify_token = COALESCE($5, webhook_verify_token),
         status               = COALESCE($6, status),
         message_limit        = CASE WHEN $7::boolean THEN $8::integer ELSE message_limit END,
         blocked_at           = CASE WHEN $6 = 'active' THEN NULL ELSE blocked_at END,
         blocked_reason       = CASE WHEN $6 = 'active' THEN NULL ELSE blocked_reason END
     WHERE workspace_id = $1 AND id = $2
     RETURNING *`,
    [
      workspaceId,
      id,
      input.name?.trim() ?? null,
      input.appSecret?.trim() ?? null,
      input.webhookVerifyToken?.trim() ?? null,
      input.status ?? null,
      // message_limit precisa aceitar null explícito ("remover o teto"), então
      // o COALESCE não serve: é a presença da chave que decide.
      Object.hasOwn(input, 'messageLimit'),
      input.messageLimit ?? null,
    ]
  );
  return rows[0] ? toPublic(rows[0]) : null;
}

export async function deleteApp(workspaceId, id) {
  const { rows } = await pool.query(
    'SELECT COUNT(*)::int AS total FROM facebook_pages WHERE facebook_app_id = $1',
    [id]
  );
  if (rows[0].total > 0) {
    throw new ValidationError(
      `Este app tem ${rows[0].total} página(s) conectada(s). Desvincule as páginas antes de excluir.`
    );
  }

  const res = await pool.query(
    'DELETE FROM facebook_apps WHERE workspace_id = $1 AND id = $2',
    [workspaceId, id]
  );
  return res.rowCount > 0;
}

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
  }
}

// ---------------------------------------------------------------- webhook ---

// A Meta chama GET /api/webhook com hub.verify_token na hora em que você
// cadastra a Callback URL no painel. Cada app tem o seu token, e a mesma URL
// atende todos — por isso a busca é pelo token, não pelo app.
export async function findAppByVerifyToken(verifyToken) {
  if (!verifyToken) return null;
  const { rows } = await pool.query(
    `SELECT * FROM facebook_apps
     WHERE webhook_verify_token IS NOT NULL
       AND webhook_verify_token = $1
     LIMIT 1`,
    [verifyToken]
  );
  return rows[0] ?? null;
}

// Compara dois digests em tempo constante. timingSafeEqual explode se os
// buffers tiverem tamanhos diferentes, daí a checagem antes.
function safeEqualHex(a, b) {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Valida o header X-Hub-Signature-256 do POST do webhook.
//
// O corpo não diz de qual app veio o evento, e a mesma Callback URL serve
// todos os apps cadastrados (é isso que permite a rotação). Então testamos a
// assinatura contra cada App Secret ativo: o que casar identifica o app de
// origem. Retorna o app ou null se nenhum casar.
//
// Inclui apps 'blocked': um app bloqueado pra ENVIO continua recebendo
// comentário, e recusar o evento aqui perderia leads sem necessidade.
export async function verifySignature(rawBody, signatureHeader) {
  if (!rawBody || !signatureHeader?.startsWith('sha256=')) return null;

  const { rows } = await pool.query(
    `SELECT * FROM facebook_apps WHERE status <> 'disabled'`
  );

  for (const app of rows) {
    const expected =
      'sha256=' +
      crypto.createHmac('sha256', app.app_secret).update(rawBody).digest('hex');
    if (safeEqualHex(expected, signatureHeader)) return app;
  }
  return null;
}
