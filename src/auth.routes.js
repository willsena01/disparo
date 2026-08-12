import express from 'express';
import { ValidationError } from './facebookApps.js';
import {
  NOME_DO_COOKIE, autenticar, criarPrimeiroUsuario, criarSessao, definirCookie,
  encerrarSessao, existeUsuario, lerCookie, limparCookie, trocarSenha, usuarioDaSessao,
} from './auth.js';

export const authRouter = express.Router();
authRouter.use(express.json());

function route(handler) {
  return async (req, res) => {
    try {
      const data = await handler(req, res);
      if (!res.headersSent) res.json(data);
    } catch (err) {
      if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
      console.error('[auth]', req.path, err);
      res.status(500).json({ error: 'Erro ao processar' });
    }
  };
}

// A tela de login pergunta se já existe conta pra decidir entre "entrar" e
// "criar a primeira conta".
authRouter.get('/status', route(async () => ({ configurado: await existeUsuario() })));

authRouter.get('/me', route(async (req, res) => {
  const user = await usuarioDaSessao(lerCookie(req, NOME_DO_COOKIE));
  if (!user) return res.status(401).json({ error: 'Não autenticado' });
  return { user };
}));

authRouter.post('/setup', route(async (req, res) => {
  const user = await criarPrimeiroUsuario(req.body ?? {});
  definirCookie(res, await criarSessao(user.id, req.get('user-agent')));
  res.status(201).json({ user });
}));

authRouter.post('/login', route(async (req, res) => {
  const user = await autenticar(req.body ?? {});
  definirCookie(res, await criarSessao(user.id, req.get('user-agent')));
  return { user };
}));

authRouter.post('/logout', route(async (req, res) => {
  await encerrarSessao(lerCookie(req, NOME_DO_COOKIE));
  limparCookie(res);
  res.status(204).end();
}));

authRouter.post('/password', route(async (req, res) => {
  const user = await usuarioDaSessao(lerCookie(req, NOME_DO_COOKIE));
  if (!user) return res.status(401).json({ error: 'Não autenticado' });
  await trocarSenha(user.id, req.body ?? {});
  // A troca derruba todas as sessões, inclusive esta — o cookie some junto.
  limparCookie(res);
  return { ok: true, precisaEntrarDeNovo: true };
}));

// ------------------------------------------------------------- middleware ---

// Rotas que a Meta chama e por isso NÃO podem exigir sessão. Elas não ficam
// desprotegidas: o webhook valida a assinatura HMAC do payload e o
// data-deletion valida o signed_request. A proteção existe, só não é cookie.
const PUBLICAS = [
  /^\/api\/webhook/,
  /^\/api\/data-deletion/,
  /^\/api\/auth\//,
  // Chamado por cron externo, com segredo próprio no header.
  /^\/api\/cron\//,
];

export function exigirSessao(req, res, next) {
  // originalUrl, não req.path: dentro de um app.use('/api', ...) o req.path vem
  // RELATIVO ao ponto de montagem ('/data-deletion'), e comparar com o caminho
  // completo nunca casaria — a Meta tomaria 401 e a exclusão de dados
  // (obrigatória para aprovar o app) pararia de funcionar em produção.
  const caminho = req.originalUrl.split('?')[0];
  if (PUBLICAS.some((re) => re.test(caminho))) return next();

  usuarioDaSessao(lerCookie(req, NOME_DO_COOKIE))
    .then((user) => {
      if (!user) return res.status(401).json({ error: 'Faça login para continuar' });
      // Daqui pra frente todo módulo usa o workspace de QUEM está logado, não
      // "o workspace mais antigo".
      req.user = user;
      next();
    })
    .catch(next);
}
