// Aplica as migrations em migrations/*.sql, em ordem, cada uma dentro da sua
// própria transação e apenas uma vez (schema_migrations guarda o que já rodou).
//
// Antes não havia controle: todo deploy reaplicava tudo, e só funcionava porque
// cada migration era idempotente. Isso proíbe migration destrutiva (DROP,
// backfill) e fica mais lento a cada arquivo novo.
//
// Não roda seed.sql (isso é `npm run seed`, separado de propósito — migration
// é schema, seed é dado de bootstrap).
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { pool } from '../src/db/pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, '..', 'migrations');

const files = readdirSync(migrationsDir)
  .filter((f) => /^\d+_.*\.sql$/.test(f))
  .sort();

async function main() {
  const client = await pool.connect();
  let aplicadas = 0;

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const { rows } = await client.query('SELECT filename FROM schema_migrations');
    const jaAplicadas = new Set(rows.map((r) => r.filename));

    for (const file of files) {
      if (jaAplicadas.has(file)) {
        console.log(`Pulando ${file} (já aplicada).`);
        continue;
      }

      const sql = readFileSync(path.join(migrationsDir, file), 'utf8');
      console.log(`Aplicando ${file}...`);

      // Uma transação por arquivo: se a migration 007 falhar, a 006 continua
      // aplicada e registrada, e o retry recomeça de onde parou.
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        aplicadas++;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }

    console.log(`${aplicadas} migration(s) aplicada(s), ${files.length - aplicadas} já estava(m).`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Falha ao migrar:', err);
  process.exit(1);
});
