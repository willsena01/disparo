-- Estrutura básica do motor de fluxos

CREATE TABLE IF NOT EXISTS flows (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  first_node_id TEXT NOT NULL,
  definition_json JSONB NOT NULL, -- { nodes: [...], edges: [...] } ou nodes indexados por id
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Casamento palavra-chave -> flow, por página (Facebook/Instagram).
CREATE TABLE IF NOT EXISTS flow_triggers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id     UUID NOT NULL REFERENCES flows(id),
  page_id     TEXT NOT NULL,
  keyword     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_flow_triggers_page ON flow_triggers (page_id);

CREATE TABLE IF NOT EXISTS leads (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- um lead pode vir de canais diferentes: WhatsApp (phone) ou
  -- comentário/DM do Facebook/Instagram (psid + page_id). Nenhum dos dois
  -- é obrigatório sozinho, mas pelo menos identificação por canal existe.
  phone       TEXT,
  psid        TEXT,
  page_id     TEXT,
  name        TEXT,
  tags        TEXT[] NOT NULL DEFAULT '{}',
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_page_psid
  ON leads (page_id, psid) WHERE psid IS NOT NULL;

CREATE TABLE IF NOT EXISTS flow_executions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id         UUID NOT NULL REFERENCES flows(id),
  lead_id         UUID NOT NULL REFERENCES leads(id),
  current_node_id TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('running', 'waiting', 'completed', 'failed')),
  resume_at       TIMESTAMPTZ,
  context_json    JSONB NOT NULL DEFAULT '{}'::jsonb,
  error           TEXT,
  -- lease de processamento: permite múltiplos workers sem reclaim duplicado.
  -- uma linha só é elegível pro claim se locked_until for nulo ou já tiver expirado.
  locked_by       TEXT,
  locked_until    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_flow_executions_pending
  ON flow_executions (status, resume_at, locked_until);
