import express from 'express';
import { getDefaultWorkspaceId } from './workspace.js';
import { ValidationError } from './facebookApps.js';
import * as flows from './flows.js';

export const flowsRouter = express.Router();

flowsRouter.use(express.json({ limit: '1mb' }));

function route(handler) {
  return async (req, res) => {
    try {
      const workspaceId = req.user?.workspace_id ?? (await getDefaultWorkspaceId());
      const data = await handler(workspaceId, req, res);
      if (!res.headersSent) res.json(data);
    } catch (err) {
      if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
      console.error('[flows]', req.path, err);
      res.status(500).json({ error: err.message || 'Erro desconhecido' });
    }
  };
}

flowsRouter.get('/', route((ws) => flows.list(ws)));

flowsRouter.post('/', route(async (ws, req, res) => {
  res.status(201).json(await flows.create(ws, req.body ?? {}));
}));

flowsRouter.get('/:id', route(async (ws, req, res) => {
  const f = await flows.get(ws, req.params.id);
  if (!f) return res.status(404).json({ error: 'Fluxo não encontrado' });
  return f;
}));

flowsRouter.patch('/:id', route(async (ws, req, res) => {
  const f = await flows.update(ws, req.params.id, req.body ?? {});
  if (!f) return res.status(404).json({ error: 'Fluxo não encontrado' });
  return f;
}));

flowsRouter.delete('/:id', route(async (ws, req, res) => {
  const ok = await flows.remove(ws, req.params.id);
  if (!ok) return res.status(404).json({ error: 'Fluxo não encontrado' });
  res.status(204).end();
}));

// Gatilhos (palavras-chave por página)
flowsRouter.post('/:id/triggers', route(async (ws, req, res) => {
  res.status(201).json(await flows.addTrigger(ws, req.params.id, req.body ?? {}));
}));

flowsRouter.delete('/:id/triggers/:triggerId', route(async (ws, req, res) => {
  const ok = await flows.removeTrigger(ws, req.params.id, req.params.triggerId);
  if (!ok) return res.status(404).json({ error: 'Gatilho não encontrado' });
  res.status(204).end();
}));

// Executa o fluxo contra um lead sem enviar nem gravar nada.
flowsRouter.post('/:id/test', route((ws, req) =>
  flows.simular(ws, req.params.id, {
    pageId: req.body?.pageId,
    leadId: req.body?.leadId,
  })
));
