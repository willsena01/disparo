-- Autenticação do painel.
--
-- Até aqui o app resolvia "o workspace mais antigo" e servia a API inteira sem
-- perguntar quem estava chamando. Isso só era aceitável enquanto tudo rodava em
-- localhost; publicado, é o painel inteiro aberto para quem achar a URL.

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  name          TEXT,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'member')),
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- E-mail é o identificador de login: precisa ser único ignorando maiúsculas,
-- senão "Ana@x.com" e "ana@x.com" viram contas diferentes.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users (lower(email));

-- Sessão em tabela, não JWT: revogar um JWT exige lista de bloqueio, que é uma
-- tabela de sessão com outro nome. Aqui "sair" é um DELETE.
CREATE TABLE IF NOT EXISTS sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Guardamos o hash, não o token: com o banco vazado, as sessões ativas não
  -- viram acesso imediato ao painel.
  token_hash  TEXT NOT NULL UNIQUE,
  user_agent  TEXT,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sessions_expira ON sessions (expires_at);

-- Tentativas de login, para travar força bruta por e-mail.
CREATE TABLE IF NOT EXISTS login_attempts (
  email        TEXT PRIMARY KEY,
  failures     INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
