import express from 'express';
import { getDefaultWorkspaceId } from './workspace.js';
import {
  listApps,
  getApp,
  createApp,
  updateApp,
  deleteApp,
  ValidationError,
} from './facebookApps.js';

export const facebookAppsRouter = express.Router();

facebookAppsRouter.use(express.json());

// ValidationError vira 400 (o operador errou o formulário); o resto vira 500
// com o motivo — o mesmo critério do route() do server.js, mas aqui precisamos
// distinguir os dois casos.
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
      console.error('[facebook-apps]', req.path, err);
      res.status(500).json({ error: err.message || 'Erro desconhecido' });
    }
  };
}

facebookAppsRouter.get('/', route((ws) => listApps(ws)));

facebookAppsRouter.get(
  '/:id',
  route(async (ws, req, res) => {
    const app = await getApp(ws, req.params.id);
    if (!app) return res.status(404).json({ error: 'App não encontrado' });
    return app;
  })
);

facebookAppsRouter.post(
  '/',
  route(async (ws, req, res) => {
    const app = await createApp(ws, req.body ?? {});
    res.status(201).json(app);
  })
);

facebookAppsRouter.patch(
  '/:id',
  route(async (ws, req, res) => {
    const app = await updateApp(ws, req.params.id, req.body ?? {});
    if (!app) return res.status(404).json({ error: 'App não encontrado' });
    return app;
  })
);

facebookAppsRouter.delete(
  '/:id',
  route(async (ws, req, res) => {
    const ok = await deleteApp(ws, req.params.id);
    if (!ok) return res.status(404).json({ error: 'App não encontrado' });
    res.status(204).end();
  })
);
