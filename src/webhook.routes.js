import express from 'express';
import { findAppByVerifyToken, verifySignature } from './facebookApps.js';
import { handleWebhookPayload } from './facebook.webhook.js';
import { handleMessagingPayload } from './messagingEvents.js';
import { buscarLink, registrarClique } from './tracking.js';
import { pool } from './db/pool.js';

export const webhookRouter = express.Router();

// Que tipo de evento a Meta mandou. O nome do campo (`feed`, `messages`…) é o
// que distingue "chegou comentário" de "chegou confirmação de leitura" — e é
// justamente essa diferença que o operador precisa ver quando nada dispara.
function tipoDoEvento(body) {
  const mudancas = body?.entry?.[0]?.changes;
  if (Array.isArray(mudancas) && mudancas[0]?.field) return mudancas[0].field;
  if (body?.entry?.[0]?.messaging) return 'messaging';
  return body?.object ?? 'desconhecido';
}

// Os carimbos são diagnóstico, não regra de negócio: se a gravação falhar, o
// evento precisa seguir sendo processado. Por isso os erros ficam no log e não
// sobem.
async function registrarVerificacao(appId) {
  try {
    await pool.query('UPDATE facebook_apps SET webhook_verified_at = now() WHERE id = $1', [appId]);
  } catch (err) {
    console.error('[webhook] não consegui carimbar a verificação:', err.message);
  }
}

async function registrarEntrega(appId, tipo) {
  try {
    await pool.query(
      'UPDATE facebook_apps SET last_webhook_at = now(), last_webhook_kind = $2 WHERE id = $1',
      [appId, tipo]
    );
  } catch (err) {
    console.error('[webhook] não consegui carimbar a entrega:', err.message);
  }
}

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
    // Carimba que a Meta chegou até aqui. É a prova de que a URL foi mesmo
    // cadastrada no painel — sem isso, "não disparou" e "nunca configurei o
    // webhook" são a mesma tela em branco.
    await registrarVerificacao(app.id);
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

  // Registra a chegada ANTES de filtrar por object/tipo: um evento que a gente
  // ignora ainda é prova de que a Meta está entregando. Confundir "não chegou
  // nada" com "chegou coisa que eu não trato" custa horas de procura.
  await registrarEntrega(app.id, tipoDoEvento(req.body));

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
