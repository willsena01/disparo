-- Workspaces, billing (plans/subscriptions) e telemetria de mensagens/páginas.
-- Necessário pro dashboard virar dado real em vez de mock.

CREATE TABLE IF NOT EXISTS workspaces (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ainda não existe auth/sessão — todo o app opera sobre um único workspace
-- "default" (ver src/workspace.js). Essas colunas ficam nullable até esse
-- fio ser puxado no resto do motor (webhook, criação de flow, etc).
ALTER TABLE flows ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id);
ALTER TABLE flow_executions ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id);

CREATE INDEX IF NOT EXISTS idx_leads_workspace_created ON leads (workspace_id, created_at);
CREATE INDEX IF NOT EXISTS idx_flow_executions_workspace_created ON flow_executions (workspace_id, created_at);

-- Um registro por mensagem efetivamente enviada por um node (ex: message.node.js).
-- 'failed' é a aproximação usada pra "caiu em spam/bloqueio" — o Facebook não
-- expõe motivo de bloqueio via API, só que a entrega falhou.
CREATE TABLE IF NOT EXISTS messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL REFERENCES workspaces(id),
  lead_id           UUID NOT NULL REFERENCES leads(id),
  flow_execution_id UUID REFERENCES flow_executions(id),
  status            TEXT NOT NULL CHECK (status IN ('sent', 'delivered', 'read', 'failed')),
  sent_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_workspace_sentat ON messages (workspace_id, sent_at);
CREATE INDEX IF NOT EXISTS idx_messages_workspace_status_sentat ON messages (workspace_id, status, sent_at);

-- Planos disponíveis. max_* = NULL significa ilimitado.
CREATE TABLE IF NOT EXISTS plans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  price_cents     INTEGER NOT NULL DEFAULT 0,
  max_leads       INTEGER,
  max_messages    INTEGER NOT NULL,
  max_pages       INTEGER,
  max_flows       INTEGER,
  max_broadcasts  INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id),
  plan_id       UUID NOT NULL REFERENCES plans(id),
  status        TEXT NOT NULL CHECK (status IN ('active', 'past_due', 'canceled')) DEFAULT 'active',
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  renews_at     TIMESTAMPTZ
);

-- Só uma assinatura ativa por workspace de cada vez.
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_active_workspace
  ON subscriptions (workspace_id) WHERE status = 'active';

-- Credenciais de app do Meta cadastradas pelo workspace (tela Configurações).
CREATE TABLE IF NOT EXISTS facebook_apps (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL REFERENCES workspaces(id),
  name           TEXT NOT NULL,
  app_id         TEXT NOT NULL,
  app_secret     TEXT NOT NULL, -- TODO: hoje texto puro; precisa virar secret criptografado antes de produção
  status         TEXT NOT NULL DEFAULT 'active',
  messages_used  INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_facebook_apps_workspace ON facebook_apps (workspace_id);

-- Páginas do Facebook conectadas através de um app.
CREATE TABLE IF NOT EXISTS facebook_pages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID NOT NULL REFERENCES workspaces(id),
  facebook_app_id  UUID NOT NULL REFERENCES facebook_apps(id),
  page_id          TEXT NOT NULL,
  name             TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'active',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_facebook_pages_workspace ON facebook_pages (workspace_id);

-- Stub mínimo: só o suficiente pra contar uso contra o limite do plano.
-- O motor de envio de broadcast em si ainda não existe.
CREATE TABLE IF NOT EXISTS broadcasts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id),
  name          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'draft',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_broadcasts_workspace ON broadcasts (workspace_id);
