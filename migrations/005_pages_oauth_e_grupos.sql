-- Etapa 3: conexão de páginas via OAuth, saúde do token e grupos de páginas.

-- Grupos servem pra selecionar várias páginas de uma vez no disparo.
CREATE TABLE IF NOT EXISTS page_groups (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  name         TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_page_groups_workspace_name
  ON page_groups (workspace_id, lower(name));

-- ON DELETE SET NULL: apagar um grupo não pode desconectar as páginas dele.
ALTER TABLE facebook_pages
  ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES page_groups(id) ON DELETE SET NULL;

ALTER TABLE facebook_pages ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Quem autorizou a conexão. A tela de Páginas agrupa por conta do Facebook, e
-- sem isso não há como dizer por qual login cada página entrou.
ALTER TABLE facebook_pages ADD COLUMN IF NOT EXISTS connected_by_name TEXT;
ALTER TABLE facebook_pages ADD COLUMN IF NOT EXISTS connected_by_fb_id TEXT;

-- Saúde do token, preenchida pelo "escanear todas".
--   ok            -> a Meta respondeu com o token da página
--   token_invalid -> token expirado ou revogado (a pessoa saiu do app)
--   no_permission -> o app perdeu a permissão sobre a página
--   unknown       -> nunca escaneada, ou falha que não sabemos classificar
ALTER TABLE facebook_pages ADD COLUMN IF NOT EXISTS health_status     TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE facebook_pages ADD COLUMN IF NOT EXISTS health_reason     TEXT;
ALTER TABLE facebook_pages ADD COLUMN IF NOT EXISTS health_checked_at TIMESTAMPTZ;

-- status é o que a rotação de envio consulta ('active' entra no rodízio).
-- Um token morto vira 'inactive' no escaneamento e some do rodízio sozinho.
UPDATE facebook_pages SET status = 'active'
 WHERE status IS NULL OR status NOT IN ('active', 'inactive');

ALTER TABLE facebook_pages ALTER COLUMN status SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'facebook_pages_status_check') THEN
    ALTER TABLE facebook_pages
      ADD CONSTRAINT facebook_pages_status_check CHECK (status IN ('active', 'inactive'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'facebook_pages_health_check') THEN
    ALTER TABLE facebook_pages
      ADD CONSTRAINT facebook_pages_health_check
      CHECK (health_status IN ('ok', 'token_invalid', 'no_permission', 'unknown'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_facebook_pages_group ON facebook_pages (group_id);
