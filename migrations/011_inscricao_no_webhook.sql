-- Inscrição do app nos eventos da página.
--
-- Sem isso a Meta não envia NADA para o webhook, por mais gatilho que exista
-- cadastrado: `subscribed_apps` é o que liga a torneira. Feita a inscrição,
-- ela vale para a página inteira — todos os posts, inclusive os publicados
-- depois — e continua valendo até alguém remover o app da página.

ALTER TABLE facebook_pages ADD COLUMN IF NOT EXISTS webhook_subscribed_at TIMESTAMPTZ;
ALTER TABLE facebook_pages ADD COLUMN IF NOT EXISTS webhook_fields TEXT[];
ALTER TABLE facebook_pages ADD COLUMN IF NOT EXISTS webhook_error TEXT;

-- Páginas que já estavam conectadas antes desta migration ficam com
-- webhook_subscribed_at nulo de propósito: elas realmente não estão inscritas,
-- e marcar como inscritas esconderia justamente o problema que isso resolve.
-- O "Escanear todas" tenta inscrever quem estiver faltando.
