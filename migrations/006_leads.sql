-- Etapa 6: leads como entidade de verdade — origem, inscrição, entregabilidade
-- e tags em tabela própria.

-- Como o lead entrou na base. 'comment' é o caminho principal da ferramenta;
-- os outros existem pra distinguir base importada de base conquistada.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'comment';

-- Descadastro. Lead não inscrito continua na base (histórico, relatório), mas
-- fica fora de broadcast.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS subscribed BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_interaction_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Entregabilidade:
--   ok       -> último envio deu certo (ou ainda não houve envio)
--   failing  -> falhas seguidas; provavelmente não chega mais
--   blocked  -> a Meta disse que não dá pra falar com essa pessoa
-- consecutive_failures é o que separa um erro isolado de falha recorrente.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS deliverability_status TEXT NOT NULL DEFAULT 'ok';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS consecutive_failures INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_source_check') THEN
    ALTER TABLE leads ADD CONSTRAINT leads_source_check
      CHECK (source IN ('comment', 'import', 'broadcast', 'manual'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_deliverability_check') THEN
    ALTER TABLE leads ADD CONSTRAINT leads_deliverability_check
      CHECK (deliverability_status IN ('ok', 'failing', 'blocked'));
  END IF;
END $$;

-- Tags saem do array em leads.tags e viram tabela.
--
-- O array não guarda QUANDO a tag foi aplicada, e é exatamente isso que o
-- funil por etapas precisa saber ("quantos leads chegaram neste checkpoint, e
-- quando"). A PK composta já garante a idempotência que o array fazia na mão.
CREATE TABLE IF NOT EXISTS lead_tags (
  lead_id    UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tag_name   TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (lead_id, tag_name)
);

CREATE INDEX IF NOT EXISTS idx_lead_tags_name ON lead_tags (tag_name);

-- Migra o conteúdo do array e remove a coluna. Guardado por EXISTS e executado
-- via EXECUTE: o corpo só é planejado quando a condição passa, então rodar de
-- novo depois da coluna já ter sumido não quebra.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'tags'
  ) THEN
    EXECUTE $sql$
      INSERT INTO lead_tags (lead_id, tag_name)
      SELECT id, unnest(tags) FROM leads
      WHERE tags IS NOT NULL AND array_length(tags, 1) > 0
      ON CONFLICT DO NOTHING
    $sql$;
    EXECUTE 'ALTER TABLE leads DROP COLUMN tags';
  END IF;
END $$;

-- Índices dos filtros da listagem.
CREATE INDEX IF NOT EXISTS idx_leads_workspace_page ON leads (workspace_id, page_id);
CREATE INDEX IF NOT EXISTS idx_leads_workspace_source ON leads (workspace_id, source);
CREATE INDEX IF NOT EXISTS idx_leads_workspace_deliverability
  ON leads (workspace_id, deliverability_status);
CREATE INDEX IF NOT EXISTS idx_leads_last_interaction ON leads (workspace_id, last_interaction_at DESC);
