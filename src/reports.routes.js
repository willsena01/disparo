import express from 'express';
import { getDefaultWorkspaceId } from './workspace.js';
import { ValidationError } from './facebookApps.js';
import * as reports from './reports.js';
import * as templates from './templates.js';

function route(handler) {
  return async (req, res) => {
    try {
      const workspaceId = req.user?.workspace_id ?? (await getDefaultWorkspaceId());
      const data = await handler(workspaceId, req, res);
      if (!res.headersSent) res.json(data);
    } catch (err) {
      if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
      console.error('[reports]', req.path, err);
      res.status(500).json({ error: err.message || 'Erro desconhecido' });
    }
  };
}

export const reportsRouter = express.Router();

// Painel inteiro numa chamada: a tela troca o período e recarrega tudo junto.
reportsRouter.get(
  '/',
  route((ws, req) => reports.painel(ws, req.query.dias, req.query.metricaMapa))
);

reportsRouter.get('/resumo', route((ws, req) => reports.resumo(ws, req.query.dias)));
reportsRouter.get('/recomendacoes', route((ws, req) => reports.recomendacoes(ws, req.query.dias)));
reportsRouter.get('/funil-base', route((ws) => reports.funilDaBase(ws)));
reportsRouter.get(
  '/funil-campanha',
  route((ws, req) =>
    reports.funilDaCampanha(ws, { dias: req.query.dias, broadcastId: req.query.broadcastId })
  )
);
reportsRouter.get('/comentarios-por-pagina', route((ws, req) => reports.comentariosPorPagina(ws, req.query.dias)));
reportsRouter.get('/posts', route((ws, req) => reports.postsComMaisComentarios(ws, req.query.dias)));
reportsRouter.get('/paginas', route((ws, req) => reports.desempenhoPorPagina(ws, req.query.dias)));
reportsRouter.get(
  '/mapa-de-calor',
  route((ws, req) => reports.mapaDeCalor(ws, req.query.dias, req.query.metrica))
);
reportsRouter.get('/fontes-de-leads', route((ws, req) => reports.fontesDeLeads(ws, req.query.dias)));

// Progresso nos fluxos (tags). Sem ?flowId= agrega o workspace inteiro.
reportsRouter.get(
  '/progresso-fluxos',
  route((ws, req) => reports.progressoDosFluxos(ws, req.query.flowId))
);

// ---------------------------------------------------------------- templates ---

export const templatesRouter = express.Router();
templatesRouter.use(express.json());

// Lista as message tags que a Meta aceita, com a explicação de cada uma — o
// formulário precisa disso pra não deixar escolher tag errada pro conteúdo.
templatesRouter.get('/message-tags', route(() =>
  Object.entries(templates.MESSAGE_TAGS).map(([tag, descricao]) => ({ tag, descricao }))
));

templatesRouter.get('/', route((ws, req) => templates.list(ws, { pageId: req.query.pageId })));

templatesRouter.post('/', route(async (ws, req, res) => {
  res.status(201).json(await templates.create(ws, req.body ?? {}));
}));

// "Sincronizar todas": consulta a revisão de recurso de cada página.
templatesRouter.post('/sync', route((ws) => templates.syncAll(ws)));

templatesRouter.get('/:id', route(async (ws, req, res) => {
  const t = await templates.get(ws, req.params.id);
  if (!t) return res.status(404).json({ error: 'Template não encontrado' });
  return t;
}));

templatesRouter.patch('/:id', route(async (ws, req, res) => {
  const t = await templates.update(ws, req.params.id, req.body ?? {});
  if (!t) return res.status(404).json({ error: 'Template não encontrado' });
  return t;
}));

templatesRouter.delete('/:id', route(async (ws, req, res) => {
  const ok = await templates.remove(ws, req.params.id);
  if (!ok) return res.status(404).json({ error: 'Template não encontrado' });
  res.status(204).end();
}));
