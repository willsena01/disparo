import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { getDefaultWorkspaceId } from './workspace.js';
import { webhookRouter, trackingRouter } from './webhook.routes.js';
import { reportsRouter, templatesRouter } from './reports.routes.js';
import { facebookAppsRouter } from './facebookApps.routes.js';
import { pagesRouter, pageGroupsRouter } from './pages.routes.js';
import { leadsRouter } from './leads.routes.js';
import { broadcastsRouter } from './broadcasts.routes.js';
import { flowsRouter } from './flows.routes.js';
import { commentsRouter } from './comments.routes.js';
import { uploadsRouter, uploadsStatic } from './uploads.routes.js';
import { settingsRouter } from './settings.routes.js';
import { paginaDePrivacidade, paginaDeTermos } from './legal.js';
import { authRouter, exigirSessao } from './auth.routes.js';
import { cronRouter } from './cron.routes.js';
import {
  getTodayStats,
  getUsage,
  getLeadsSeries,
  getMessagesSeries,
  getConnectedApps,
  getPlanUsage,
} from './dashboard.js';

const PORT = Number(process.env.PORT ?? 3000);

const app = express();

// Cada rota devolve dado real do banco, escopado no workspace de quem está
// logado. Se a query falhar (ex: banco fora do ar), devolve 500 com uma
// mensagem — nunca inventa valor.
// err.message vem vazio em alguns casos comuns (ex: ECONNREFUSED do Postgres
// chega como AggregateError com .message === '' e o detalhe real dentro de
// .errors[]) — sem isso a API devolvia {"error":""}, inútil pra debugar.
function describeError(err) {
  if (err.message) return err.message;
  if (err.errors?.length) return err.errors.map((e) => e.message).filter(Boolean).join('; ');
  return err.code ? `Erro ${err.code}` : 'Erro desconhecido';
}

function route(handler) {
  return async (req, res) => {
    try {
      const workspaceId = req.user?.workspace_id ?? (await getDefaultWorkspaceId());
      const data = await handler(workspaceId, req);
      res.json(data);
    } catch (err) {
      console.error('[server]', req.path, err);
      res.status(500).json({ error: describeError(err) });
    }
  };
}

// Webhook do Facebook. Fica antes das rotas de dashboard e traz o próprio
// body parser — o parser global reserializaria o corpo e quebraria a
// validação de assinatura (ver webhook.routes.js).
app.use('/api/webhook', webhookRouter);

app.use('/api/auth', authRouter);

// Acionado por cron externo, não por navegador: protegido por segredo, não por
// sessão. Fica antes do exigirSessao pelo mesmo motivo do webhook.
app.use('/api/cron', cronRouter);

// Daqui pra baixo, toda rota /api exige sessão. As exceções (webhook e
// exclusão de dados, que a Meta chama) estão listadas em auth.routes.js e são
// protegidas por assinatura, não por cookie.
app.use('/api', exigirSessao);

app.use('/api/facebook-apps', facebookAppsRouter);
app.use('/api/pages', pagesRouter);
app.use('/api/page-groups', pageGroupsRouter);
app.use('/api/leads', leadsRouter);
app.use('/api/broadcasts', broadcastsRouter);
app.use('/api/flows', flowsRouter);
app.use('/api/comments', commentsRouter);
app.use('/api/uploads', uploadsRouter);
app.use('/api/settings', settingsRouter);

// A Meta chama esta URL exatamente assim (sem /settings) quando alguém remove
// o app da conta — é o que vai no campo "Data Deletion" do painel.
app.use('/api/data-deletion', (req, res, next) => {
  req.url = '/data-deletion' + (req.url === '/' ? '' : req.url);
  settingsRouter(req, res, next);
});

// Fora de /api: é a URL que a Meta vai buscar pra montar o anexo.
app.use('/uploads', uploadsStatic);

// Páginas públicas exigidas pela Meta para aprovar o app. Precisam abrir sem
// autenticação — o revisor da Meta acessa direto.
app.get('/privacidade', (_req, res) => res.type('html').send(paginaDePrivacidade()));
app.get('/termos', (_req, res) => res.type('html').send(paginaDeTermos()));
app.use('/api/templates', templatesRouter);
app.use('/api/reports', reportsRouter);

// Fora de /api: essa URL vai dentro da mensagem, quanto mais curta melhor.
app.use('/r', trackingRouter);

app.get('/api/dashboard/today-stats', route(getTodayStats));
app.get('/api/dashboard/usage', route(getUsage));
app.get('/api/dashboard/leads-series', route((ws) => getLeadsSeries(ws, 30)));
app.get('/api/dashboard/messages-series', route((ws) => getMessagesSeries(ws, 7)));
app.get('/api/dashboard/connected-apps', route(getConnectedApps));
app.get('/api/dashboard/plan-usage', route(getPlanUsage));

// ------------------------------------------------------------- frontend ---

// Serve o painel compilado, quando existir. Na Vercel os estáticos são
// entregues pela própria plataforma e isto não é usado; em qualquer outro host
// (Railway, Render, VPS) é o que faz a aplicação inteira rodar em um processo
// só, sem precisar de um servidor web na frente.
//
// Fica DEPOIS de todas as rotas: senão o fallback do SPA engoliria /api,
// /uploads, /r e as páginas legais.
const PASTA_DO_PAINEL = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web', 'dist');

if (fs.existsSync(path.join(PASTA_DO_PAINEL, 'index.html'))) {
  app.use(express.static(PASTA_DO_PAINEL, { index: false, maxAge: '1h' }));

  // Qualquer rota do painel (/leads, /fluxos…) devolve o index: quem resolve
  // o caminho é o React Router, no navegador.
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(PASTA_DO_PAINEL, 'index.html'));
  });
}

// Só escuta numa porta quando executado direto (`npm run server`). Importado
// como função serverless (api/index.js na Vercel), a plataforma é quem cuida
// do transporte — chamar listen() ali seria erro de boot.
const executadoDireto = process.argv[1]?.replace(/\\/g, '/').endsWith('src/server.js');

if (executadoDireto) {
  app.listen(PORT, () => {
    console.log(`[server] API em http://localhost:${PORT}`);
  });
}

export default app;
