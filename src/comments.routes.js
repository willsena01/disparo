import express from 'express';
import { pool } from './db/pool.js';
import { getDefaultWorkspaceId } from './workspace.js';
import { ValidationError } from './facebookApps.js';
import * as regras from './commentRules.js';

export const commentsRouter = express.Router();

commentsRouter.use(express.json());

function route(handler) {
  return async (req, res) => {
    try {
      const workspaceId = req.user?.workspace_id ?? (await getDefaultWorkspaceId());
      const data = await handler(workspaceId, req, res);
      if (!res.headersSent) res.json(data);
    } catch (err) {
      if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
      console.error('[comments]', req.path, err);
      res.status(500).json({ error: err.message || 'Erro desconhecido' });
    }
  };
}

// ------------------------------------------------------------------ regras ---

commentsRouter.get('/rules', route((ws, req) => regras.list(ws, { pageId: req.query.pageId })));

commentsRouter.post('/rules', route(async (ws, req, res) => {
  res.status(201).json(await regras.create(ws, req.body ?? {}));
}));

commentsRouter.patch('/rules/:id', route(async (ws, req, res) => {
  const r = await regras.update(ws, req.params.id, req.body ?? {});
  if (!r) return res.status(404).json({ error: 'Regra não encontrada' });
  return r;
}));

commentsRouter.delete('/rules/:id', route(async (ws, req, res) => {
  const ok = await regras.remove(ws, req.params.id);
  if (!ok) return res.status(404).json({ error: 'Regra não encontrada' });
  res.status(204).end();
}));

// -------------------------------------------------------------- histórico ---

// Comentários capturados, com o que a regra respondeu em cada um.
commentsRouter.get('/', route(async (ws, req) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const perPage = Math.min(100, Math.max(1, Number(req.query.perPage) || 25));

  const where = ['c.workspace_id = $1'];
  const params = [ws];
  if (req.query.pageId) {
    params.push(req.query.pageId);
    where.push(`c.page_id = $${params.length}`);
  }
  // "só os que viraram lead" / "só os que não viraram" — é a pergunta que se
  // faz olhando essa tela.
  if (req.query.virouLead === 'true') where.push('c.lead_id IS NOT NULL');
  if (req.query.virouLead === 'false') where.push('c.lead_id IS NULL');

  const clausula = where.join(' AND ');

  const { rows: totalRows } = await pool.query(
    `SELECT COUNT(*)::int AS total FROM comments c WHERE ${clausula}`, params
  );

  const { rows } = await pool.query(
    `SELECT c.*, p.name AS page_name, f.name AS flow_name, l.name AS lead_name
     FROM comments c
     LEFT JOIN LATERAL (SELECT name FROM facebook_pages WHERE page_id = c.page_id LIMIT 1) p ON true
     LEFT JOIN flows f ON f.id = c.flow_id
     LEFT JOIN leads l ON l.id = c.lead_id
     WHERE ${clausula}
     ORDER BY c.created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, perPage, (page - 1) * perPage]
  );

  return {
    data: rows.map((c) => ({
      id: c.id,
      pageId: c.page_id,
      pageName: c.page_name,
      postId: c.post_id,
      commentId: c.comment_id,
      commenterName: c.commenter_name,
      text: c.comment_text,
      matchedKeyword: c.matched_keyword,
      leadId: c.lead_id,
      leadName: c.lead_name,
      flowName: c.flow_name,
      respondeuPublico: Boolean(c.public_replied_at),
      respondeuPrivado: Boolean(c.private_replied_at),
      erro: c.reply_error,
      createdAt: c.created_at,
    })),
    total: totalRows[0].total,
    page,
    perPage,
    totalPages: Math.ceil(totalRows[0].total / perPage) || 1,
  };
}));
