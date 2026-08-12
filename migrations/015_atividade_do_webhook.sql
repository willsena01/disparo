-- Sinal de vida do webhook.
--
-- Sem isto, "o fluxo não disparou" é indistinguível de meia dúzia de causas:
-- a URL nunca foi cadastrada no painel da Meta, foi cadastrada mas o campo
-- `feed` não foi assinado, chegou evento de outro tipo, ou chegou comentário e
-- nenhuma regra casou. Só dava pra separar consultando o banco.
--
-- Três carimbos respondem isso na tela:
--   webhook_verified_at  a Meta chamou o GET de verificação  -> URL cadastrada
--   last_webhook_at      a Meta entregou algum POST          -> eventos fluindo
--   last_webhook_kind    que tipo de evento foi o último     -> `feed` ou não

ALTER TABLE facebook_apps ADD COLUMN IF NOT EXISTS webhook_verified_at TIMESTAMPTZ;
ALTER TABLE facebook_apps ADD COLUMN IF NOT EXISTS last_webhook_at TIMESTAMPTZ;
ALTER TABLE facebook_apps ADD COLUMN IF NOT EXISTS last_webhook_kind TEXT;
