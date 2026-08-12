-- Callback de exclusão de dados exigido pela Meta.
--
-- Quando alguém remove o app da conta do Facebook, a Meta chama a URL de
-- "Data Deletion" e espera um código de confirmação que a pessoa possa
-- consultar depois. Sem esse endpoint funcionando o app não passa na revisão.
CREATE TABLE IF NOT EXISTS data_deletion_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  confirmation_code TEXT NOT NULL UNIQUE,
  facebook_user_id  TEXT NOT NULL,
  facebook_app_id   UUID REFERENCES facebook_apps(id) ON DELETE SET NULL,
  status            TEXT NOT NULL DEFAULT 'completed'
                    CHECK (status IN ('pending', 'completed', 'failed')),
  leads_removed     INTEGER NOT NULL DEFAULT 0,
  error             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_data_deletion_user ON data_deletion_requests (facebook_user_id);
