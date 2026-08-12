import { get, post } from './client.js';

export const authApi = {
  // Diz se já existe conta — a tela decide entre "entrar" e "criar a primeira".
  status: () => get('/api/auth/status'),
  me: () => get('/api/auth/me'),
  login: (email, senha) => post('/api/auth/login', { email, senha }),
  setup: (dados) => post('/api/auth/setup', dados),
  logout: () => post('/api/auth/logout'),
  trocarSenha: (senhaAtual, senhaNova) => post('/api/auth/password', { senhaAtual, senhaNova }),
};
