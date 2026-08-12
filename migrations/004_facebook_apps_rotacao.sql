-- Etapa 2: o que a rotação automática entre apps precisa no schema.

-- status é o eixo da rotação, então passa a ser fechado. Qualquer valor legado
-- fora do conjunto vira 'active' antes da constraint entrar.
UPDATE facebook_apps SET status = 'active'
 WHERE status IS NULL OR status NOT IN ('active', 'blocked', 'disabled');

ALTER TABLE facebook_apps ALTER COLUMN status SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'facebook_apps_status_check'
  ) THEN
    ALTER TABLE facebook_apps
      ADD CONSTRAINT facebook_apps_status_check
      CHECK (status IN ('active', 'blocked', 'disabled'));
  END IF;
END $$;

-- Por que o app foi bloqueado e quando. Sem isso o operador vê o app parado na
-- tela e não tem como saber se foi limite, token inválido ou restrição da Meta.
ALTER TABLE facebook_apps ADD COLUMN IF NOT EXISTS blocked_at     TIMESTAMPTZ;
ALTER TABLE facebook_apps ADD COLUMN IF NOT EXISTS blocked_reason TEXT;

-- O mesmo App ID cadastrado duas vezes no mesmo workspace faria a rotação
-- contar o limite do mesmo app como se fossem dois.
CREATE UNIQUE INDEX IF NOT EXISTS idx_facebook_apps_workspace_appid
  ON facebook_apps (workspace_id, app_id);

-- Índice da consulta de rotação: filtra por workspace + status e ordena por uso.
CREATE INDEX IF NOT EXISTS idx_facebook_apps_rotacao
  ON facebook_apps (workspace_id, status, messages_used);

-- Uma página conectada duas vezes pelo mesmo app é duplicata; conectada por
-- apps diferentes é justamente o que permite a rotação — daí o par no índice.
CREATE UNIQUE INDEX IF NOT EXISTS idx_facebook_pages_app_page
  ON facebook_pages (facebook_app_id, page_id);
