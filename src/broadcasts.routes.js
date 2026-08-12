import express from 'express';
import { getDefaultWorkspaceId } from './workspace.js';
import { ValidationError } from './facebookApps.js';
import * as broadcasts from './broadcasts.js';

export const broadcastsRouter = express.Router();

broadcastsRouter.use(express.json());

function route(handler) {
  return async (req, res) => {
    try {
      const workspaceId = req.user?.workspace_id ?? (await getDefaultWorkspaceId());
      const data = await handler(workspaceId, req, res);
      if (!res.headersSent) res.json(data);
    } catch (err) {
      if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
      console.error('[broadcasts]', req.path, err);
      res.status(500).json({ error: err.message || 'Erro desconhecido' });
    }
  };
}

// Tamanho do público antes de disparar, já separando quem está dentro e fora
// da janela de 24h — é o que decide se a campanha precisa de template.
broadcastsRouter.post(
  '/preview',
  route((ws, req) => broadcasts.previewPublico(ws, req.body?.targetFilter ?? {}))
);

broadcastsRouter.get('/', route((ws, req) => broadcasts.list(ws, { status: req.query.status })));

broadcastsRouter.post(
  '/',
  route(async (ws, req, res) => {
    res.status(201).json(await broadcasts.create(ws, req.body ?? {}));
  })
);

broadcastsRouter.get(
  '/:id',
  route(async (ws, req, res) => {
    const b = await broadcasts.get(ws, req.params.id);
    if (!b) return res.status(404).json({ error: 'Campanha não encontrada' });
    return b;
  })
);

// Progresso em tempo real: lido da fila, não de contador em memória.
broadcastsRouter.get(
  '/:id/progress',
  route(async (ws, req, res) => {
    const p = await broadcasts.progress(ws, req.params.id);
    if (!p) return res.status(404).json({ error: 'Campanha não encontrada' });
    return p;
  })
);

broadcastsRouter.patch(
  '/:id',
  route(async (ws, req, res) => {
    const b = await broadcasts.update(ws, req.params.id, req.body ?? {});
    if (!b) return res.status(404).json({ error: 'Campanha não encontrada' });
    return b;
  })
);

for (const [rota, acao, erro] of [
  ['start', broadcasts.start, 'Campanha não encontrada'],
  ['pause', broadcasts.pause, 'Só dá pra pausar uma campanha em andamento'],
  ['resume', broadcasts.resume, 'Só dá pra retomar uma campanha pausada ou que falhou'],
]) {
  broadcastsRouter.post(
    `/:id/${rota}`,
    route(async (ws, req, res) => {
      const b = await acao(ws, req.params.id);
      if (!b) return res.status(409).json({ error: erro });
      return b;
    })
  );
}

broadcastsRouter.delete(
  '/:id',
  route(async (ws, req, res) => {
    const ok = await broadcasts.remove(ws, req.params.id);
    if (!ok) return res.status(404).json({ error: 'Campanha não encontrada' });
    res.status(204).end();
  })
);
