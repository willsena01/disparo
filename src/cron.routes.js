import crypto from 'node:crypto';
import express from 'express';
import { processExecution, WORKER_ID, LEASE_MS } from './engine/engine.js';
import { claimDueExecutions } from './engine/flowExecutionRepository.js';
import { tick as tickDeBroadcast } from './broadcastWorker.js';
import { limparSessoesVencidas } from './auth.js';

// Acionamento por cron, para hospedagem serverless.
//
// Em servidor comum, `npm start` e `npm run broadcast-worker` ficam rodando em
// laço. Em serverless (Vercel) não existe processo contínuo: quem chama é um
// cron externo, uma vez por minuto, e cada chamada processa um lote.
//
// Isso só é possível porque a fila mora no banco, com lease — o mesmo desenho
// que já protegia contra dois workers processando a mesma linha protege agora
// contra duas invocações do cron se sobrepondo.

export const cronRouter = express.Router();

const SEGREDO = process.env.CRON_SECRET ?? null;
const LOTE = Number(process.env.CRON_BATCH ?? 25);

// Sem sessão (é máquina chamando), então a proteção é um segredo no header.
// Comparação em tempo constante pelo mesmo motivo das outras assinaturas.
function autorizado(req) {
  if (!SEGREDO) return false;
  const enviado =
    req.get('x-cron-secret') ??
    req.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    '';
  const a = Buffer.from(enviado);
  const b = Buffer.from(SEGREDO);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function rodarUmaVolta() {
  const inicio = Date.now();

  // 1. Fluxos: retoma quem estava em espera e já venceu.
  const execucoes = await claimDueExecutions(LOTE, WORKER_ID, LEASE_MS);
  for (const e of execucoes) await processExecution(e);

  // 2. Broadcasts: promove campanhas agendadas e envia um lote.
  const destinatarios = await tickDeBroadcast();

  // 3. Faxina barata que ninguém mais faria em serverless.
  await limparSessoesVencidas();

  return {
    execucoes: execucoes.length,
    destinatarios,
    duracaoMs: Date.now() - inicio,
  };
}

async function responder(req, res) {
  if (!autorizado(req)) {
    // 404 e não 401: sem o segredo, nem confirmamos que a rota existe.
    return res.status(404).json({ error: 'Não encontrado' });
  }
  try {
    res.json({ ok: true, ...(await rodarUmaVolta()) });
  } catch (err) {
    console.error('[cron] falha no tick:', err);
    res.status(500).json({ error: err.message });
  }
}

// GET e POST: o cron da Vercel chama por GET, serviços externos costumam usar POST.
cronRouter.get('/tick', responder);
cronRouter.post('/tick', responder);

export { rodarUmaVolta };
