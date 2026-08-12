import pg from 'pg';

const { Pool } = pg;

// Em serverless cada invocação cria a sua própria instância do módulo, e cada
// uma abre seu pool. Com o padrão do pg (10 conexões por pool), algumas
// invocações simultâneas estouram o limite do Neon/Supabase e o sintoma é
// "too many connections" em requisições aleatórias.
//
// Fora de serverless o padrão continua valendo: é um processo só, e um pool
// maior aproveita melhor.
const emServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.PG_POOL_MAX ?? (emServerless ? 2 : 10)),
  // Devolve a conexão rápido em serverless: a invocação morre logo, e conexão
  // ociosa segurada é conexão a menos para a próxima.
  idleTimeoutMillis: emServerless ? 10_000 : 30_000,
  connectionTimeoutMillis: 10_000,
  // Provedores gerenciados (Neon, Supabase) exigem TLS mas usam certificado
  // que o Node não valida por padrão.
  ssl: process.env.DATABASE_SSL === 'false'
    ? false
    : /neon\.tech|supabase|render\.com|amazonaws/.test(process.env.DATABASE_URL ?? '')
      ? { rejectUnauthorized: false }
      : undefined,
});

// Um erro numa conexão ociosa emite 'error' no pool; sem ouvinte, o Node
// derruba o processo inteiro.
pool.on('error', (err) => {
  console.error('[db] erro em conexão ociosa:', err.message);
});

export async function query(text, params) {
  return pool.query(text, params);
}
