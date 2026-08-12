import express from 'express';
import { pool } from './db/pool.js';
import { getDefaultWorkspaceId } from './workspace.js';
import { ValidationError } from './facebookApps.js';
import { authorizeUrl, exchangeCodeForPages, verifyState, baseUrl, SCOPES, redirectUri } from './facebookOAuth.js';
import { listPages, connectPages, unlinkPage, setPageGroup, scanAll, inscreverPorId } from './pages.js';
import { listGroups, createGroup, renameGroup, deleteGroup } from './pageGroups.js';

export const pagesRouter = express.Router();

pagesRouter.use(express.json());

function route(handler) {
  return async (req, res) => {
    try {
      const workspaceId = req.user?.workspace_id ?? (await getDefaultWorkspaceId());
      const data = await handler(workspaceId, req, res);
      if (!res.headersSent) res.json(data);
    } catch (err) {
      if (err instanceof ValidationError) {
        return res.status(400).json({ error: err.message });
      }
      console.error('[pages]', req.path, err);
      res.status(500).json({ error: err.message || 'Erro desconhecido' });
    }
  };
}

// ------------------------------------------------------------------ OAuth ---

// Início do "Conectar com Facebook". Redireciona pro diálogo de permissão do
// Facebook; a página do app nunca vê o usuário digitando senha.
pagesRouter.get(
  '/oauth/start',
  route(async (ws, req, res) => {
    const { rows } = await pool.query(
      'SELECT * FROM facebook_apps WHERE workspace_id = $1 AND id = $2',
      [ws, req.query.appId]
    );
    const app = rows[0];
    if (!app) throw new ValidationError('Informe ?appId= de um app cadastrado neste workspace');

    res.redirect(authorizeUrl(app));
  })
);

// Volta do Facebook. Aqui acontecem as três trocas de token (ver
// facebookOAuth.js) e as páginas são gravadas com o token de longa duração.
//
// Redireciona de volta pra interface em vez de responder JSON: quem chega
// aqui é o navegador do operador, no meio de um fluxo visual.
pagesRouter.get(
  '/oauth/callback',
  route(async (ws, req, res) => {
    const destino = `${baseUrl()}/paginas`;

    if (req.query.error) {
      const motivo = req.query.error_description ?? req.query.error;
      return res.redirect(`${destino}?erro=${encodeURIComponent(motivo)}`);
    }
    if (!req.query.code) throw new ValidationError('Facebook não devolveu o code');

    const app = await verifyState(req.query.state);
    const { usuario, paginas } = await exchangeCodeForPages(app, req.query.code);
    const salvas = await connectPages(app.workspace_id, app, usuario, paginas);

    res.redirect(`${destino}?conectadas=${salvas.length}`);
  })
);

// A tela de Configurações mostra isso pra você colar no painel do Meta.
pagesRouter.get(
  '/oauth/config',
  route(() => ({
    redirectUri: redirectUri(),
    scopes: SCOPES,
    webhookUrl: `${baseUrl()}/api/webhook`,
  }))
);

// ---------------------------------------------------------------- páginas ---

pagesRouter.get('/', route((ws) => listPages(ws)));

// Revalida o token de todas as páginas, atualiza saúde e reinscreve no webhook
// quem tiver perdido a inscrição.
pagesRouter.post('/scan', route((ws) => scanAll(ws)));

// Reinscreve uma página nos eventos do webhook (comentários, entrega, leitura).
pagesRouter.post(
  '/:id/subscribe',
  route(async (ws, req, res) => {
    const p = await inscreverPorId(ws, req.params.id);
    if (!p) return res.status(404).json({ error: 'Página não encontrada' });
    return p;
  })
);

pagesRouter.patch(
  '/:id/group',
  route(async (ws, req, res) => {
    const ok = await setPageGroup(ws, req.params.id, req.body?.groupId ?? null);
    if (!ok) return res.status(404).json({ error: 'Página não encontrada' });
    return { ok: true };
  })
);

pagesRouter.delete(
  '/:id',
  route(async (ws, req, res) => {
    const ok = await unlinkPage(ws, req.params.id);
    if (!ok) return res.status(404).json({ error: 'Página não encontrada' });
    res.status(204).end();
  })
);

// ----------------------------------------------------------------- grupos ---

export const pageGroupsRouter = express.Router();
pageGroupsRouter.use(express.json());

pageGroupsRouter.get('/', route((ws) => listGroups(ws)));

pageGroupsRouter.post(
  '/',
  route(async (ws, req, res) => {
    res.status(201).json(await createGroup(ws, req.body?.name));
  })
);

pageGroupsRouter.patch(
  '/:id',
  route(async (ws, req, res) => {
    const g = await renameGroup(ws, req.params.id, req.body?.name);
    if (!g) return res.status(404).json({ error: 'Grupo não encontrado' });
    return g;
  })
);

pageGroupsRouter.delete(
  '/:id',
  route(async (ws, req, res) => {
    const ok = await deleteGroup(ws, req.params.id);
    if (!ok) return res.status(404).json({ error: 'Grupo não encontrado' });
    res.status(204).end();
  })
);
