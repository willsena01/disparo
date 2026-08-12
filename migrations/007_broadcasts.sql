-- Etapa 7: campanhas de envio em massa.

ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS code                TEXT;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS target_filter_json  JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS message_json        JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Mensagem alternativa pra quem está fora da janela de 24h. Vira referência a
-- um template aprovado quando a etapa 8 existir; por ora é o conteúdo + a tag
-- de mensagem que a Meta exige fora da janela.
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS template_json       JSONB;

ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS scheduled_at        TIMESTAMPTZ;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS started_at          TIMESTAMPTZ;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS finished_at         TIMESTAMPTZ;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS total_recipients    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS total_sent          INTEGER NOT NULL DEFAULT 0;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS total_errors        INTEGER NOT NULL DEFAULT 0;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS error               TEXT;

UPDATE broadcasts SET status = 'draft'
 WHERE status IS NULL
    OR status NOT IN ('draft', 'scheduled', 'running', 'paused', 'completed', 'failed');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'broadcasts_status_check') THEN
    ALTER TABLE broadcasts ADD CONSTRAINT broadcasts_status_check
      CHECK (status IN ('draft', 'scheduled', 'running', 'paused', 'completed', 'failed'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_broadcasts_code ON broadcasts (code) WHERE code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_broadcasts_due ON broadcasts (status, scheduled_at);

-- A fila em si: uma linha por destinatário.
--
-- O público é materializado quando a campanha começa, não resolvido a cada
-- envio. Dois motivos: pausar/retomar precisa saber quem já recebeu, e um
-- filtro reavaliado no meio do caminho mudaria o total (lead novo entrando na
-- tag faria a barra de progresso andar pra trás).
--
-- locked_by/locked_until é o mesmo lease de flow_executions — permite mais de
-- um worker sem enviar duas vezes pro mesmo lead.
CREATE TABLE IF NOT EXISTS broadcast_recipients (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id  UUID NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
  lead_id       UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  attempts      INTEGER NOT NULL DEFAULT 0,
  error_reason  TEXT,
  sent_at       TIMESTAMPTZ,
  locked_by     TEXT,
  locked_until  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- O mesmo lead não pode entrar duas vezes na mesma campanha.
CREATE UNIQUE INDEX IF NOT EXISTS idx_broadcast_recipients_unico
  ON broadcast_recipients (broadcast_id, lead_id);

-- Índice do claim: pendentes de uma campanha, com lease livre.
CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_fila
  ON broadcast_recipients (broadcast_id, status, locked_until);

-- Faltava amarrar a mensagem enviada à campanha que a originou.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS broadcast_id UUID REFERENCES broadcasts(id);
CREATE INDEX IF NOT EXISTS idx_messages_broadcast ON messages (broadcast_id);
