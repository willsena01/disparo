-- Etapa 13: o que o editor de fluxos precisa.

-- Liga/desliga do fluxo. Um fluxo desligado não casa gatilho nenhum, mesmo
-- com a palavra-chave cadastrada — é o interruptor da lista "Meus fluxos".
--
-- O padrão é 'active' porque um fluxo sem gatilho já não dispara: quem impede
-- o disparo acidental é a ausência de keyword, não o status.
ALTER TABLE flows ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

UPDATE flows SET status = 'active' WHERE status NOT IN ('active', 'inactive');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'flows_status_check') THEN
    ALTER TABLE flows ADD CONSTRAINT flows_status_check
      CHECK (status IN ('active', 'inactive'));
  END IF;
END $$;

-- Como a palavra-chave casa com o comentário:
--   contains -> aparece em qualquer lugar do texto (padrão)
--   exact    -> o comentário é exatamente a palavra-chave
ALTER TABLE flow_triggers ADD COLUMN IF NOT EXISTS match_type TEXT NOT NULL DEFAULT 'contains';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'flow_triggers_match_check') THEN
    ALTER TABLE flow_triggers ADD CONSTRAINT flow_triggers_match_check
      CHECK (match_type IN ('contains', 'exact'));
  END IF;
END $$;

-- A mesma keyword duas vezes na mesma página do mesmo fluxo é duplicata.
CREATE UNIQUE INDEX IF NOT EXISTS idx_flow_triggers_unico
  ON flow_triggers (flow_id, page_id, lower(keyword));

CREATE INDEX IF NOT EXISTS idx_flows_workspace ON flows (workspace_id, created_at DESC);
