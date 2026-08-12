import crypto from 'node:crypto';
import { pool } from './db/pool.js';
import { ValidationError } from './facebookApps.js';

// Login do Facebook para conectar páginas.
//
// O fluxo tem três trocas e cada uma existe por um motivo:
//   1. code            -> user access token (curto, ~1h)
//   2. token curto     -> token de longa duração (~60 dias)
//   3. token longo     -> GET /me/accounts, que devolve um Page Access Token
//                          por página
//
// O passo 2 não é opcional: Page Access Token derivado de token de usuário
// CURTO também expira em ~1h, e aí o disparo morre sozinho no dia seguinte.
// Derivado de token longo, o token de página não expira enquanto a permissão
// existir — que é o que a ferramenta precisa.

const GRAPH_VERSION = process.env.FB_GRAPH_VERSION ?? 'v21.0';
const GRAPH_URL = `https://graph.facebook.com/${GRAPH_VERSION}`;

// Permissões pedidas no OAuth.
//
// O conjunto disponível depende dos casos de uso habilitados no app do Meta:
// pedir uma que o app não tem faz o Facebook recusar o login inteiro com
// "Invalid Scopes" — não ignora a permissão, derruba a conexão.
//
// Por isso FB_SCOPES permite ajustar a lista sem mexer no código, e conectar
// com o que já está liberado enquanto as demais não são aprovadas.
//
//   pages_show_list        listar suas páginas no login          (essencial)
//   pages_messaging        enviar a DM                            (essencial)
//   pages_manage_metadata  inscrever a página no webhook          (essencial)
//   pages_read_engagement  ler nome/foto e conteúdo da página     (recomendada)
//
// pages_manage_engagement fica DE FORA do padrão de propósito. Ela só serve
// para a resposta pública no comentário — nada do disparo depende dela — e vem
// de outro caso de uso ("Gerenciar tudo na sua Página"), com App Review à
// parte. Pedi-la por padrão significa que todo app recém-criado toma
// "Invalid Scopes" e não conecta nenhuma página. Quem quiser a resposta
// pública habilita o caso de uso e acrescenta a permissão em FB_SCOPES.
export const SCOPES = (process.env.FB_SCOPES ?? [
  'pages_show_list',
  'pages_messaging',
  'pages_manage_metadata',
  'pages_read_engagement',
].join(','))
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// As três sem as quais nada funciona — usado para avisar na tela quando a
// lista configurada estiver incompleta.
export const SCOPES_ESSENCIAIS = ['pages_show_list', 'pages_messaging', 'pages_manage_metadata'];

export function baseUrl() {
  return (process.env.APP_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
}

export function redirectUri() {
  return `${baseUrl()}/api/pages/oauth/callback`;
}

// ------------------------------------------------------------------ state ---

// O `state` protege contra CSRF: sem ele, alguém induz você a abrir uma URL de
// callback com o `code` da conta dele e as páginas do atacante entram no seu
// workspace. Em vez de uma tabela de states, o payload vai assinado com o App
// Secret — o servidor não guarda nada e mesmo assim só aceita state que ele
// mesmo emitiu.
const STATE_TTL_MS = 10 * 60 * 1000;

export function signState(app) {
  const payload = Buffer.from(
    JSON.stringify({ appId: app.id, nonce: crypto.randomBytes(8).toString('hex'), ts: Date.now() })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', app.app_secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export async function verifyState(state) {
  const [payload, sig] = String(state ?? '').split('.');
  if (!payload || !sig) throw new ValidationError('state ausente ou malformado');

  let data;
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    throw new ValidationError('state inválido');
  }

  const { rows } = await pool.query('SELECT * FROM facebook_apps WHERE id = $1', [data.appId]);
  const app = rows[0];
  if (!app) throw new ValidationError('app do state não existe mais');

  const esperado = crypto.createHmac('sha256', app.app_secret).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(esperado);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new ValidationError('assinatura do state não confere');
  }
  if (Date.now() - data.ts > STATE_TTL_MS) {
    throw new ValidationError('state expirado — refaça a conexão');
  }
  return app;
}

// ------------------------------------------------------------------ graph ---

async function graphGet(path, params) {
  const url = new URL(`${GRAPH_URL}/${path}`);
  for (const [k, v] of Object.entries(params ?? {})) {
    if (k !== 'access_token' && v != null) url.searchParams.set(k, v);
  }

  const res = await fetch(url, {
    // O token vai no header pra não entrar em query string (log de proxy).
    headers: params?.access_token ? { Authorization: `Bearer ${params.access_token}` } : {},
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error?.message ?? `Graph API ${res.status}`);
    err.graphCode = body.error?.code;
    err.graphSubcode = body.error?.error_subcode;
    throw err;
  }
  return body;
}

// Troca via POST: client_secret em corpo, nunca em query string.
async function oauthExchange(params) {
  const res = await fetch(`${GRAPH_URL}/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ValidationError(
      `Facebook recusou a troca de token: ${body.error?.message ?? `HTTP ${res.status}`}`
    );
  }
  return body;
}

export function authorizeUrl(app) {
  const url = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
  url.searchParams.set('client_id', app.app_id);
  url.searchParams.set('redirect_uri', redirectUri());
  url.searchParams.set('scope', SCOPES.join(','));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', signState(app));
  return url.toString();
}

// code -> token curto -> token longo -> páginas (com token de cada página)
export async function exchangeCodeForPages(app, code) {
  const curto = await oauthExchange({
    client_id: app.app_id,
    client_secret: app.app_secret,
    redirect_uri: redirectUri(),
    code,
  });

  const longo = await oauthExchange({
    grant_type: 'fb_exchange_token',
    client_id: app.app_id,
    client_secret: app.app_secret,
    fb_exchange_token: curto.access_token,
  });

  const [me, contas] = await Promise.all([
    graphGet('me', { fields: 'id,name', access_token: longo.access_token }),
    graphGet('me/accounts', {
      fields: 'id,name,access_token,picture{url}',
      limit: 100,
      access_token: longo.access_token,
    }),
  ]);

  return {
    usuario: { id: me.id, name: me.name },
    paginas: (contas.data ?? []).map((p) => ({
      pageId: String(p.id),
      name: p.name,
      accessToken: p.access_token,
      avatarUrl: p.picture?.data?.url ?? null,
    })),
  };
}

// Eventos que a página precisa mandar pro webhook.
//
//   feed               comentários nos posts — é o gatilho dos fluxos
//   messages           resposta do lead no Messenger (reabre a janela de 24h)
//   messaging_postbacks clique em botão de payload
//   message_deliveries entrega confirmada
//   message_reads      leitura confirmada
//
// Os dois últimos são o que tira "Entregues" e "Visualizações" de zero.
export const CAMPOS_DO_WEBHOOK = [
  'feed',
  'messages',
  'messaging_postbacks',
  'message_deliveries',
  'message_reads',
];

// Inscreve o app nos eventos da página.
//
// É esta chamada que faz a Meta começar a entregar comentários no webhook — e
// ela vale para a PÁGINA, não para um post: uma vez inscrito, todo post
// publicado depois já nasce coberto, sem nenhum passo extra a cada vídeo.
//
// A inscrição dura até alguém remover o app da página (ou o token morrer), por
// isso o "Escanear todas" confere e reinscreve o que estiver faltando.
export async function subscribeToPage(pageId, pageAccessToken) {
  const res = await fetch(`${GRAPH_URL}/${pageId}/subscribed_apps`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Bearer ${pageAccessToken}`,
    },
    body: new URLSearchParams({ subscribed_fields: CAMPOS_DO_WEBHOOK.join(',') }),
  });
  const body = await res.json().catch(() => ({}));

  if (!res.ok || body.success === false) {
    return { ok: false, erro: body.error?.message ?? `Graph API ${res.status}` };
  }
  return { ok: true, campos: CAMPOS_DO_WEBHOOK };
}

// Confere se o app ainda está inscrito e em quais campos.
export async function checkSubscription(pageId, pageAccessToken, appId) {
  try {
    const body = await graphGet(`${pageId}/subscribed_apps`, {
      fields: 'id,subscribed_fields',
      access_token: pageAccessToken,
    });
    const apps = body.data ?? [];
    // Sem appId (páginas conectadas antes de guardarmos isso), basta haver
    // algum app inscrito — a alternativa seria reinscrever a cada scan.
    const meu = appId ? apps.find((a) => String(a.id) === String(appId)) : apps[0];
    if (!meu) return { inscrito: false, campos: [] };
    return { inscrito: true, campos: meu.subscribed_fields ?? [] };
  } catch (err) {
    return { inscrito: false, campos: [], erro: err.message };
  }
}

// Revalida um Page Access Token. Uma chamada só: se a Meta responde, o token
// vale e ainda aproveitamos pra atualizar nome e avatar.
export async function checkPageToken(pageId, pageAccessToken) {
  try {
    const p = await graphGet(pageId, {
      fields: 'id,name,picture{url}',
      access_token: pageAccessToken,
    });
    return { health: 'ok', name: p.name, avatarUrl: p.picture?.data?.url ?? null };
  } catch (err) {
    // 190 = token expirado/revogado; 10 e 200 = permissão que o app não tem mais.
    if (err.graphCode === 190) return { health: 'token_invalid', reason: err.message };
    if (err.graphCode === 10 || err.graphCode === 200) {
      return { health: 'no_permission', reason: err.message };
    }
    return { health: 'unknown', reason: err.message };
  }
}
