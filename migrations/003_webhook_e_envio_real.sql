-- Etapa 5: o que o webhook real e o envio via Messenger precisam ter no banco.
-- (Os módulos completos de facebook-apps e pages são as etapas 2 e 3 — aqui
-- entra só a coluna/tabela sem a qual o webhook não fecha o ciclo.)

-- Token que a Meta manda em hub.verify_token na verificação do webhook (GET).
ALTER TABLE facebook_apps ADD COLUMN IF NOT EXISTS webhook_verify_token TEXT;
-- Teto de mensagens do app. NULL = sem teto conhecido. A rotação automática
-- (etapa 2) lê essa coluna junto com messages_used.
ALTER TABLE facebook_apps ADD COLUMN IF NOT EXISTS message_limit INTEGER;

-- Page Access Token de longa duração. Sem ele não existe envio: o Send API
-- autentica por página, não por app.
ALTER TABLE facebook_pages ADD COLUMN IF NOT EXISTS page_access_token TEXT;

CREATE INDEX IF NOT EXISTS idx_facebook_pages_page_id ON facebook_pages (page_id);

-- A janela de 24h só abre depois que a pessoa interage no Messenger. Enquanto
-- isso for NULL, o único canal permitido pra falar com quem comentou é o
-- private_replies do próprio comentário (ver src/channels/messenger.channel.js).
ALTER TABLE leads ADD COLUMN IF NOT EXISTS messaging_opened_at TIMESTAMPTZ;

-- Motivo da falha de entrega. Alimenta o card de "caiu em spam/bloqueio" do
-- dashboard, que hoje só sabe que status = 'failed', não por quê.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS error_reason TEXT;

-- Todo comentário que chega pelo webhook vira uma linha aqui, tendo casado
-- keyword ou não — é o histórico que a tela de Comentários lê e a base pra
-- medir taxa de conversão comentário -> lead.
CREATE TABLE IF NOT EXISTS comments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID REFERENCES workspaces(id),
  page_id         TEXT NOT NULL,
  post_id         TEXT,
  comment_id      TEXT,
  commenter_psid  TEXT,
  commenter_name  TEXT,
  comment_text    TEXT,
  matched_keyword TEXT,
  lead_id         UUID REFERENCES leads(id),
  flow_id         UUID REFERENCES flows(id),
  replied_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A Meta reentrega o mesmo evento quando não recebe 200 rápido o bastante.
-- Esse índice é o que transforma o INSERT do comentário em trava de
-- idempotência: reentrega colide, não dispara o fluxo duas vezes.
CREATE UNIQUE INDEX IF NOT EXISTS idx_comments_comment_id
  ON comments (comment_id) WHERE comment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_comments_page_created ON comments (page_id, created_at);
