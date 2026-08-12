import { pool } from './db/pool.js';
import { ValidationError } from './facebookApps.js';

// Grupos de páginas: rótulo pra selecionar várias páginas de uma vez no
// disparo, sem ter que marcar uma a uma.

export async function listGroups(workspaceId) {
  const { rows } = await pool.query(
    `SELECT g.*, COUNT(p.id)::int AS pages_count
     FROM page_groups g
     LEFT JOIN facebook_pages p ON p.group_id = g.id
     WHERE g.workspace_id = $1
     GROUP BY g.id
     ORDER BY g.name ASC`,
    [workspaceId]
  );
  return rows.map((g) => ({
    id: g.id,
    name: g.name,
    pagesCount: g.pages_count,
    createdAt: g.created_at,
  }));
}

export async function createGroup(workspaceId, name) {
  const nome = name?.trim();
  if (!nome) throw new ValidationError('name é obrigatório');

  try {
    const { rows } = await pool.query(
      'INSERT INTO page_groups (workspace_id, name) VALUES ($1, $2) RETURNING *',
      [workspaceId, nome]
    );
    return { id: rows[0].id, name: rows[0].name, pagesCount: 0, createdAt: rows[0].created_at };
  } catch (err) {
    // O índice é sobre lower(name): "Vendas" e "vendas" seriam o mesmo grupo
    // na cabeça do operador, e dois na tela.
    if (err.code === '23505') throw new ValidationError(`Já existe um grupo chamado "${nome}"`);
    throw err;
  }
}

export async function renameGroup(workspaceId, id, name) {
  const nome = name?.trim();
  if (!nome) throw new ValidationError('name é obrigatório');

  try {
    const { rows } = await pool.query(
      `UPDATE page_groups SET name = $3 WHERE workspace_id = $1 AND id = $2 RETURNING *`,
      [workspaceId, id, nome]
    );
    return rows[0] ? { id: rows[0].id, name: rows[0].name } : null;
  } catch (err) {
    if (err.code === '23505') throw new ValidationError(`Já existe um grupo chamado "${nome}"`);
    throw err;
  }
}

// Apagar o grupo não desconecta as páginas — o ON DELETE SET NULL da migration
// só tira o rótulo. Excluir um agrupamento não pode derrubar o disparo.
export async function deleteGroup(workspaceId, id) {
  const res = await pool.query(
    'DELETE FROM page_groups WHERE workspace_id = $1 AND id = $2',
    [workspaceId, id]
  );
  return res.rowCount > 0;
}
