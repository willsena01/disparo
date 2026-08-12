import express from 'express';
import { findAppByVerifyToken, verifySignature } from './facebookApps.js';
import { handleWebhookPayload } from './facebook.webhook.js';
import { handleMessagingPayload } from './messagingEvents.js';
import { buscarLink, registrarClique } from './tracking.js';

export const webhookRouter = express.Router();

// Guarda o corpo cru: a assinatura da Meta é o HMAC dos bytes exatos que
// chegaram. Reserializar o JSON depois do parse muda o byte a byte (ordem de
// chave, escape, espaço) e a assinatura nunca mais fecha.
const jsonWithRawBody = express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  },
});

// GET — verificação da Callback URL no painel do Meta for Developers.
// A Meta chama uma vez, com o token que você cadastrou; devolvemos o challenge
// em texto puro se ele bater com o webhook_verify_token de algum app.
webhookRouter.get('/', async (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode !== 'subscribe') return res.sendStatus(400);

  try {
    const app = await findAppByVerifyToken(token);
    if (!app) {
      console.warn('[webhook] verificação recusada: verify_token não confere com nenhum app');
      return res.sendStatus(403);
    }
    console.log(`[webhook] verificado para o app "${app.name}"`);
    return res.type('text/plain').send(String(challenge ?? ''));
  } catch (err) {
    console.error('[webhook] erro na verificação:', err);
    return res.sendStatus(500);
  }
});

// POST — eventos. Sem assinatura válida nada é processado: essa rota é pública
// e sem isso qualquer um poderia forjar comentário e disparar fluxo.
webhookRouter.post('/', jsonWithRawBody, async (req, res) => {
  let app;
  try {
    app = await verifySignature(req.rawBody, req.get('x-hub-signature-256'));
  } catch (err) {
    console.error('[webhook] erro ao validar assinatura:', err);
    return res.sendStatus(500);
  }

  if (!app) {
    console.warn('[webhook] payload recusado: X-Hub-Signature-256 inválida');
    return res.sendStatus(403);
  }

  if (req.body?.object !== 'page') return res.sendStatus(200);

  // 200 primeiro, processamento depois: a Meta reentrega o evento se a resposta
  // demorar, e um fluxo pode levar segundos. A trava contra a reentrega que
  // ainda assim acontecer é o UNIQUE em comments.comment_id.
  res.sendStatus(200);

  // Dois campos no mesmo payload: `feed` são comentários (disparam fluxo),
  // `messaging` são entrega, leitura e resposta do lead (alimentam relatório e
  // a janela de 24h). Um não pode derrubar o outro.
  Promise.allSettled([
    handleWebhookPayload(req.body),
    handleMessagingPayload(req.body),
  ]).then((rs) => {
    for (const r of rs) {
      if (r.status === 'rejected') console.error('[webhook] falha ao processar payload:', r.reason);
    }
  });
});

// Redirecionador de link rastreado. Fica fora de /api de propósito: essa URL
// vai dentro da mensagem, e quanto mais curta, melhor.
export const trackingRouter = express.Router();

trackingRouter.get('/:token', async (req, res) => {
  let link;
  try {
    link = await buscarLink(req.params.token);
  } catch (err) {
    console.error('[tracking] falha ao resolver o link:', err);
    return res.status(500).send('Não foi possível abrir este link.');
  }

  if (!link) return res.status(404).send('Link não encontrado ou expirado.');

  // Redireciona primeiro, contabiliza depois: a pessoa clicou num link seu, e
  // uma falha ao gravar a métrica não pode virar página de erro pra ela.
  res.redirect(302, link.target_url);
  registrarClique(link).catch((err) =>
    console.error('[tracking] clique não contabilizado:', err)
  );
});
