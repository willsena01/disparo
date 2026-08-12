-- Gatilho que dispara com qualquer comentário na página, sem palavra-chave.
--
-- Casos de uso: post em que a chamada é "comenta qualquer coisa", ou página
-- em que todo comentário deve virar lead.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'flow_triggers_match_check') THEN
    ALTER TABLE flow_triggers DROP CONSTRAINT flow_triggers_match_check;
  END IF;

  ALTER TABLE flow_triggers ADD CONSTRAINT flow_triggers_match_check
    CHECK (match_type IN ('contains', 'exact', 'any'));
END $$;

-- Com match_type = 'any' a keyword não é usada e fica vazia. O índice único em
-- (flow_id, page_id, lower(keyword)) já garante que só existe um gatilho
-- "qualquer comentário" por fluxo e página.
--
-- A regra abaixo impede o inverso: gatilho de palavra-chave com keyword vazia
-- casaria com tudo sem que ninguém tivesse pedido isso.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'flow_triggers_keyword_check') THEN
    ALTER TABLE flow_triggers ADD CONSTRAINT flow_triggers_keyword_check
      CHECK (match_type = 'any' OR btrim(keyword) <> '');
  END IF;
END $$;
