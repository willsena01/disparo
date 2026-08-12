import { pool } from './db/pool.js';

// Ainda não existe autenticação/sessão no projeto. Até isso existir, o app
// inteiro opera sobre um único workspace — o mais antigo cadastrado (o seed
// cria um com id fixo). Isolar essa decisão aqui facilita trocar por
// "workspace do usuário logado" depois, sem caçar essa query pelo código todo.
let cachedWorkspaceId = null;

export async function getDefaultWorkspaceId() {
  if (cachedWorkspaceId) return cachedWorkspaceId;

  const { rows } = await pool.query(
    'SELECT id FROM workspaces ORDER BY created_at ASC LIMIT 1'
  );
  if (!rows[0]) {
    throw new Error(
      'Nenhum workspace encontrado — rode migrations/seed.sql antes de subir a API.'
    );
  }
  cachedWorkspaceId = rows[0].id;
  return cachedWorkspaceId;
}
