import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { pool } from './db/pool.js';
import { ValidationError } from './facebookApps.js';
import { baseUrl } from './facebookOAuth.js';

const scrypt = promisify(crypto.scrypt);

export const NOME_DO_COOKIE = 'disparo_sessao';
const DURACAO_MS = Number(process.env.SESSION_DAYS ?? 14) * 24 * 60 * 60 * 1000;

// Trava de força bruta: depois de 5 erros, 15 minutos de espera.
const MAX_TENTATIVAS = 5;
const BLOQUEIO_MS = 15 * 60 * 1000;

// ------------------------------------------------------------------ senha ---

// scrypt vem do próprio Node — sem dependência nova, e é lento de propósito:
// é isso que torna caro testar senha por força bruta com o banco em mãos.
export async function hashDeSenha(senha) {
  const sal = crypto.randomBytes(16);
  const derivada = await scrypt(senha, sal, 64);
  return `scrypt$${sal.toString('hex')}$${derivada.toString('hex')}`;
}

export async function senhaConfere(senha, hash) {
  const [algoritmo, salHex, esperadoHex] = String(hash ?? '').split('$');
  if (algoritmo !== 'scrypt' || !salHex || !esperadoHex) return false;

  const derivada = await scrypt(senha, Buffer.from(salHex, 'hex'), 64);
  const esperado = Buffer.from(esperadoHex, 'hex');
  if (derivada.length !== esperado.length) return false;
  return crypto.timingSafeEqual(derivada, esperado);
}

function validarSenha(senha) {
  if (!senha || senha.length < 8) {
    throw new ValidationError('A senha precisa ter pelo menos 8 caracteres');
  }
}

function normalizarEmail(email) {
  const e = email?.trim().toLowerCase();
  if (!e || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
    throw new ValidationError('Informe um e-mail válido');
  }
  return e;
}

// ----------------------------------------------------------------- sessão ---

const hashDoToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

export async function criarSessao(userId, userAgent) {
  const token = crypto.randomBytes(32).toString('base64url');
  await pool.query(
    `INSERT INTO sessions (user_id, token_hash, user_agent, expires_at)
     VALUES ($1,$2,$3, now() + ($4 || ' milliseconds')::interval)`,
    [userId, hashDoToken(token), userAgent?.slice(0, 200) ?? null, DURACAO_MS]
  );
  return token;
}

export async function usuarioDaSessao(token) {
  if (!token) return null;
  const { rows } = await pool.query(
    `SELECT u.id, u.email, u.name, u.role, u.workspace_id
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [hashDoToken(token)]
  );
  return rows[0] ?? null;
}

export async function encerrarSessao(token) {
  if (!token) return;
  await pool.query('DELETE FROM sessions WHERE token_hash = $1', [hashDoToken(token)]);
}

// Sessões vencidas não servem pra nada e a tabela só cresce.
export async function limparSessoesVencidas() {
  await pool.query('DELETE FROM sessions WHERE expires_at < now()');
}

// ----------------------------------------------------------------- cadastro ---

export async function existeUsuario() {
  const { rows } = await pool.query('SELECT 1 FROM users LIMIT 1');
  return rows.length > 0;
}

// Primeiro acesso: cria o dono no workspace existente. Só funciona enquanto não
// houver nenhum usuário — senão seria uma porta aberta para criar contas.
export async function criarPrimeiroUsuario({ email, senha, nome }) {
  if (await existeUsuario()) {
    throw new ValidationError('Já existe uma conta. Faça login.');
  }

  const e = normalizarEmail(email);
  validarSenha(senha);

  const { rows: ws } = await pool.query(
    'SELECT id FROM workspaces ORDER BY created_at ASC LIMIT 1'
  );
  if (!ws[0]) throw new ValidationError('Nenhum workspace encontrado — rode `npm run seed` antes.');

  const { rows } = await pool.query(
    `INSERT INTO users (workspace_id, email, name, password_hash, role)
     VALUES ($1,$2,$3,$4,'owner')
     RETURNING id, email, name, role, workspace_id`,
    [ws[0].id, e, nome?.trim() || null, await hashDeSenha(senha)]
  );
  return rows[0];
}

// -------------------------------------------------------------------- login ---

async function conferirBloqueio(email) {
  const { rows } = await pool.query('SELECT * FROM login_attempts WHERE email = $1', [email]);
  const t = rows[0];
  if (t?.locked_until && new Date(t.locked_until) > new Date()) {
    const minutos = Math.ceil((new Date(t.locked_until) - Date.now()) / 60000);
    throw new ValidationError(`Muitas tentativas. Tente de novo em ${minutos} minuto(s).`);
  }
}

async function registrarFalha(email) {
  await pool.query(
    `INSERT INTO login_attempts (email, failures, updated_at) VALUES ($1, 1, now())
     ON CONFLICT (email) DO UPDATE
       SET failures = login_attempts.failures + 1,
           updated_at = now(),
           locked_until = CASE
             WHEN login_attempts.failures + 1 >= $2 THEN now() + ($3 || ' milliseconds')::interval
             ELSE login_attempts.locked_until
           END`,
    [email, MAX_TENTATIVAS, BLOQUEIO_MS]
  );
}

export async function autenticar({ email, senha }) {
  const e = normalizarEmail(email);
  await conferirBloqueio(e);

  const { rows } = await pool.query('SELECT * FROM users WHERE lower(email) = $1', [e]);
  const user = rows[0];

  // Mesma mensagem para e-mail inexistente e senha errada: dizer qual dos dois
  // falhou entrega ao atacante a lista de e-mails cadastrados.
  const ok = user && (await senhaConfere(senha ?? '', user.password_hash));
  if (!ok) {
    await registrarFalha(e);
    throw new ValidationError('E-mail ou senha incorretos');
  }

  await pool.query('DELETE FROM login_attempts WHERE email = $1', [e]);
  await pool.query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);

  return { id: user.id, email: user.email, name: user.name, role: user.role, workspace_id: user.workspace_id };
}

export async function trocarSenha(userId, { senhaAtual, senhaNova }) {
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
  const user = rows[0];
  if (!user) throw new ValidationError('Usuário não encontrado');
  if (!(await senhaConfere(senhaAtual ?? '', user.password_hash))) {
    throw new ValidationError('Senha atual incorreta');
  }
  validarSenha(senhaNova);

  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [
    await hashDeSenha(senhaNova), userId,
  ]);
  // Trocar a senha derruba as outras sessões: se a troca foi porque a senha
  // vazou, deixar as sessões antigas vivas anula o motivo de ter trocado.
  await pool.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
}

// ----------------------------------------------------------------- cookie ---

// Parse manual do header Cookie: é uma linha de código contra uma dependência
// a mais na árvore.
export function lerCookie(req, nome) {
  const bruto = req.headers.cookie;
  if (!bruto) return null;
  for (const parte of bruto.split(';')) {
    const [k, ...resto] = parte.trim().split('=');
    if (k === nome) return decodeURIComponent(resto.join('='));
  }
  return null;
}

export function definirCookie(res, token) {
  const seguro = baseUrl().startsWith('https://');
  res.append('Set-Cookie', [
    `${NOME_DO_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    // httpOnly: JavaScript da página não lê o cookie, então um XSS não leva a
    // sessão junto.
    'HttpOnly',
    'SameSite=Lax',
    seguro ? 'Secure' : null,
    `Max-Age=${Math.floor(DURACAO_MS / 1000)}`,
  ].filter(Boolean).join('; '));
}

export function limparCookie(res) {
  res.append('Set-Cookie', `${NOME_DO_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}
