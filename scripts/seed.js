import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { pool } from '../src/db/pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(path.join(__dirname, '..', 'migrations', 'seed.sql'), 'utf8');

pool
  .query(sql)
  .then(() => console.log('Seed aplicado.'))
  .catch((err) => {
    console.error('Falha ao aplicar seed:', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
