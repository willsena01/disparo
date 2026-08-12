import express from 'express';
import { getDefaultWorkspaceId } from './workspace.js';
import { ValidationError } from './facebookApps.js';
import { leads } from './leads.js';

export const leadsRouter = express.Router();

leadsRouter.use(express.json());

function route(handler) {
  return async (req, res) => {
    try {
      const workspaceId = req.user?.workspace_id ?? (await getDefaultWorkspaceId());
      const data = await handler(workspaceId, req, res);
      if (!res.headersSent) res.json(data);
    } catch (err) {
      if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
      console.error('[leads]', req.path, err);
      res.status(500).json({ error: err.message || 'Erro desconhecido' });
    }
  };
}

// Query string chega sempre como texto: 'false' precisa virar false, e um
// parâmetro ausente precisa continuar ausente (nem true nem false).
function booleanoOpcional(valor) {
  if (valor === undefined || valor === '') return undefined;
  return valor === 'true' || valor === '1';
}

leadsRouter.get(
  '/',
  route((ws, req) =>
    leads.list(ws, {
      page: req.query.page,
      perPage: req.query.perPage,
      pageId: req.query.pageId,
      source: req.query.source,
      tag: req.query.tag,
      deliverability: req.query.deliverability,
      subscribed: booleanoOpcional(req.query.subscribed),
      q: req.query.q,
    })
  )
);

// Alimenta o filtro de tags da tela.
leadsRouter.get('/tags', route((ws) => leads.listWorkspaceTags(ws)));

leadsRouter.get(
  '/:id',
  route(async (ws, req, res) => {
    const lead = await leads.get(ws, req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });
    return lead;
  })
);

leadsRouter.patch(
  '/:id',
  route(async (ws, req, res) => {
    const lead = await leads.update(ws, req.params.id, req.body ?? {});
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });
    return lead;
  })
);

leadsRouter.delete(
  '/:id',
  route(async (ws, req, res) => {
    const ok = await leads.remove(ws, req.params.id);
    if (!ok) return res.status(404).json({ error: 'Lead não encontrado' });
    res.status(204).end();
  })
);

// As rotas de tag confirmam que o lead é do workspace antes de mexer — sem
// isso, o id de um lead de outro workspace seria aceito.
async function exigirLead(ws, id) {
  const lead = await leads.get(ws, id);
  if (!lead) throw new ValidationError('Lead não encontrado');
  return lead;
}

leadsRouter.post(
  '/:id/tags',
  route(async (ws, req) => {
    await exigirLead(ws, req.params.id);
    await leads.addTag(req.params.id, req.body?.name);
    return leads.listTags(req.params.id);
  })
);

leadsRouter.delete(
  '/:id/tags/:name',
  route(async (ws, req) => {
    await exigirLead(ws, req.params.id);
    await leads.removeTag(req.params.id, decodeURIComponent(req.params.name));
    return leads.listTags(req.params.id);
  })
);
