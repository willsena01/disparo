-- Etapa 8: templates, e a telemetria sem a qual os relatórios seriam zeros.

-- ------------------------------------------------------------- templates ---
-- Conteúdo reutilizável pra falar com quem está fora da janela de 24h.
--
-- message_tag é o que a Meta exige nesse caso. Diferente do WhatsApp, o
-- Messenger NÃO revisa template por template: a tag já é o mecanismo aprovado.
-- meta_status existe pra registrar a revisão de recurso DA PÁGINA
-- (messaging_feature_review), que é a coisa real que pode barrar o envio.
CREATE TABLE IF NOT EXISTS message_templates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL REFERENCES workspaces(id),
  page_id           TEXT,
  name              TEXT NOT NULL,
  content_json      JSONB NOT NULL,
  message_tag       TEXT NOT NULL,
  meta_status       TEXT NOT NULL DEFAULT 'pending'
                    CHECK (meta_status IN ('pending', 'approved', 'rejected')),
  meta_status_reason TEXT,
  meta_synced_at    TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_message_templates_nome
  ON message_templates (workspace_id, lower(name));

ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES message_templates(id);

-- ------------------------------------------------------------ telemetria ---
-- mid é o id que o Send API devolve. Os webhooks de entrega e leitura chegam
-- por mid e/ou por watermark (timestamp); guardar o mid permite casar exato.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS mid          TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS read_at      TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_messages_mid ON messages (mid) WHERE mid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_lead_sentat ON messages (lead_id, sent_at);

-- Link rastreado: um por (destinatário, botão). O token é o que aparece na URL
-- encurtada; a URL real fica só aqui.
--
-- Sem isso "cliques" no relatório seria zero pra sempre — a Meta não informa
-- clique em link, só o próprio redirecionador sabe.
CREATE TABLE IF NOT EXISTS tracked_links (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token        TEXT NOT NULL UNIQUE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  lead_id      UUID REFERENCES leads(id) ON DELETE CASCADE,
  message_id   UUID REFERENCES messages(id) ON DELETE SET NULL,
  broadcast_id UUID REFERENCES broadcasts(id) ON DELETE SET NULL,
  flow_execution_id UUID REFERENCES flow_executions(id) ON DELETE SET NULL,
  target_url   TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Uma linha por clique (a mesma pessoa pode clicar duas vezes). "Quantos
-- clicaram" nos funis conta lead distinto, não clique.
CREATE TABLE IF NOT EXISTS link_clicks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracked_link_id UUID NOT NULL REFERENCES tracked_links(id) ON DELETE CASCADE,
  lead_id         UUID REFERENCES leads(id) ON DELETE CASCADE,
  clicked_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_link_clicks_clicked ON link_clicks (clicked_at);
CREATE INDEX IF NOT EXISTS idx_link_clicks_lead ON link_clicks (lead_id);
CREATE INDEX IF NOT EXISTS idx_tracked_links_broadcast ON tracked_links (broadcast_id);
