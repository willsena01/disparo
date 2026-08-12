-- Auto-resposta de comentários.
--
-- flow_triggers deixa de ser "palavra-chave que dispara fluxo" e passa a ser a
-- REGRA completa do que fazer quando alguém comenta: responder no comentário
-- (público), mandar DM (privado), disparar um fluxo — ou qualquer combinação.
--
-- Manter na mesma tabela em vez de criar outra é de propósito: duas tabelas
-- decidindo o que fazer com o mesmo comentário significaria duas coisas
-- podendo responder ao mesmo tempo.

-- Regra pode existir sem fluxo (só DM e/ou resposta pública).
ALTER TABLE flow_triggers ALTER COLUMN flow_id DROP NOT NULL;

-- Post específico. NULL = vale para todos os posts da página, inclusive os
-- publicados depois.
ALTER TABLE flow_triggers ADD COLUMN IF NOT EXISTS post_id TEXT;

-- Texto da DM enviada a quem comentou. É o que captura o lead: a resposta
-- privada é o único caminho permitido pra abrir conversa com quem só comentou.
ALTER TABLE flow_triggers ADD COLUMN IF NOT EXISTS private_reply_text TEXT;

-- Resposta pública no próprio comentário ("te chamamos no privado").
ALTER TABLE flow_triggers ADD COLUMN IF NOT EXISTS public_reply_text TEXT;

-- Entrar no fluxo por um bloco diferente do início — útil pra pular a
-- saudação e cair direto na oferta.
ALTER TABLE flow_triggers ADD COLUMN IF NOT EXISTS start_node_id TEXT;

ALTER TABLE flow_triggers ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE flow_triggers ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE flow_triggers ADD COLUMN IF NOT EXISTS created_by_flow_editor BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'flow_triggers_status_check') THEN
    ALTER TABLE flow_triggers ADD CONSTRAINT flow_triggers_status_check
      CHECK (status IN ('active', 'inactive'));
  END IF;

  -- Uma regra sem nenhuma ação não faz nada e só confunde quem lê a lista.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'flow_triggers_acao_check') THEN
    ALTER TABLE flow_triggers ADD CONSTRAINT flow_triggers_acao_check
      CHECK (
        flow_id IS NOT NULL
        OR btrim(COALESCE(private_reply_text, '')) <> ''
        OR btrim(COALESCE(public_reply_text, '')) <> ''
      );
  END IF;
END $$;

-- O índice antigo era por (flow_id, page_id, keyword). Agora o que não pode
-- repetir é a REGRA: mesma página, mesmo post e mesma palavra-chave. Duas
-- regras casando o mesmo comentário seria ambiguidade, não flexibilidade.
DROP INDEX IF EXISTS idx_flow_triggers_unico;

CREATE UNIQUE INDEX IF NOT EXISTS idx_flow_triggers_regra
  ON flow_triggers (page_id, COALESCE(post_id, ''), lower(keyword), match_type);

CREATE INDEX IF NOT EXISTS idx_flow_triggers_pagina_post
  ON flow_triggers (page_id, post_id) WHERE status = 'active';

-- Registro do que a regra respondeu, pra tela de Comentários mostrar o que
-- aconteceu com cada comentário.
ALTER TABLE comments ADD COLUMN IF NOT EXISTS rule_id UUID REFERENCES flow_triggers(id) ON DELETE SET NULL;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS public_replied_at  TIMESTAMPTZ;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS private_replied_at TIMESTAMPTZ;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS reply_error TEXT;
