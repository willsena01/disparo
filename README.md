# Disparo

Motor de execução de fluxos de automação/disparo de mensagens.

## Estrutura

```
migrations/                      -- schema, aplicado em ordem por `npm run migrate`
src/db/pool.js                   -- pool de conexão Postgres (pg)
src/messenger.js                 -- fachada de envio usada pelos node handlers
src/channels/                    -- canais de envio (hoje: Messenger)
src/pages.js                     -- page_id -> Page Access Token + workspace
src/facebookApps.js              -- verify token e assinatura do webhook
src/webhook.routes.js            -- rotas HTTP GET/POST /api/webhook
src/facebook.webhook.js          -- comentário -> lead -> execução de fluxo
src/comments.js                  -- registro dos comentários recebidos
src/engine/flowExecutionRepository.js
                                  -- acesso a dados: claim de execuções pendentes,
                                     leitura de flow/lead, update de execução
src/engine/nodes/index.js        -- registro de handlers por node.type
src/engine/engine.js             -- loop de hops de uma execução
src/engine/executor.js           -- poller (worker)
src/server.js                    -- API HTTP (dashboard + webhook)
```

## Modelo de execução

`flow_executions` guarda o estado de cada lead dentro de um flow:

- `status = 'running'`   -> pronto para processar agora
- `status = 'waiting'`   -> pausado até `resume_at` (ex: aguardando resposta do lead, delay)
- `status = 'completed'` -> chegou ao fim (node sem `next_node_id`)
- `status = 'failed'`    -> handler lançou erro; `error` guarda a mensagem

## Contrato dos node handlers

Cada arquivo em `src/engine/nodes/*.node.js` exporta:

```js
async function execute(execution, node, { messenger, lead }) {
  // ... side effects (enviar mensagem, chamar webhook, etc.)
  return {
    nextNodeId: node.next_node_id, // null/undefined => encerra a execução
    status: 'running' | 'waiting',
    resumeAt: Date,                 // obrigatório se status = 'waiting'
    context: { ... },               // merge raso sobre execution.context_json
  };
}
```

Registrar o handler em `src/engine/nodes/index.js`.

## Webhook do Facebook

Dois processos, dois papéis: `npm run server` expõe o webhook (e a API do
dashboard), `npm start` roda o poller que retoma as execuções em `waiting`.

- `GET /api/webhook` — verificação da Callback URL. Responde `hub.challenge`
  se `hub.verify_token` bater com o `webhook_verify_token` de algum app
  cadastrado em `facebook_apps`.
- `POST /api/webhook` — eventos do campo `feed`. Valida
  `X-Hub-Signature-256` contra o App Secret de cada app ativo (o app que casar
  identifica a origem), responde 200 na hora e processa em seguida.

Ciclo de um comentário (`onCommentReceived`): registra em `comments` →
casa keyword (`matchKeywordToFlow`) → cria/encontra o lead por `psid + page_id`
→ cria a `flow_execution` já com o lease deste processo → roda o fluxo inline.

**Idempotência:** a Meta reentrega o evento se o 200 demorar. O `UNIQUE` em
`comments.comment_id` é a trava — reentrega colide no INSERT e não dispara o
fluxo de novo.

**Primeira mensagem:** a Meta não deixa abrir conversa no Messenger com quem só
comentou. Enquanto `leads.messaging_opened_at` for NULL, o envio sai por
`POST /{comment_id}/private_replies` (é ele que abre a janela de 24h); depois
disso, Send API normal com `messaging_type: RESPONSE`.

Para o envio funcionar, a página precisa de `page_access_token` preenchido em
`facebook_pages` — o OAuth que obtém esse token é a etapa 3 (módulo `pages`).

## Rodando

```bash
cp .env.example .env   # ajustar DATABASE_URL
npm install
npm run migrate
npm run seed
npm run server   # API + webhook
npm start        # poller de execuções (outro terminal)
```

`.env` não é carregado automaticamente (não há `dotenv`) — as variáveis
precisam estar no ambiente do processo.

## Rotação de apps do Facebook

Quando a Meta restringe um app, os envios por ele param. Sem rotação a
operação inteira para junto — por isso o app é escolhido a cada envio, nunca
fixado.

- `GET|POST|PATCH|DELETE /api/facebook-apps` — CRUD. O App Secret nunca sai da
  API (só os 4 últimos caracteres); o verify token sai inteiro, porque a tela
  de Configurações precisa dele.
- `getNextAvailableApp(workspaceId)` — app `active` que ainda não atingiu
  `message_limit`, **menos usado primeiro**: distribui o volume em vez de
  esgotar um app de cada vez.
- Uma página conectada por vários apps tem uma linha de `facebook_pages` por
  app, cada uma com o seu Page Access Token. É isso que dá alternativa quando
  um app cai.

O bloqueio é automático nos dois sentidos: `incrementMessagesUsed` marca o app
como `blocked` na mesma statement em que o uso atinge `message_limit`, e o
canal de envio marca `blocked` quando a Graph API responde com código de
restrição (4, 17, 190, 200, 368, 613) — e nesse caso **tenta a próxima conexão
na hora**, então o lead recebe a mensagem mesmo assim. Erro de destinatário
(ex: code 100) falha só aquela mensagem, sem queimar app nenhum.

## Conexão de páginas (OAuth)

`GET /api/pages/oauth/start?appId=<uuid>` redireciona pro diálogo do Facebook.
Permissões pedidas: `pages_messaging`, `pages_manage_metadata`,
`pages_read_engagement`, `pages_show_list`.

O callback faz **três** trocas, e a do meio não é opcional:

```
code  ->  user token curto (~1h)  ->  user token longo (~60d)  ->  /me/accounts
```

Page Access Token derivado de token de usuário **curto** também expira em ~1h —
o disparo morreria sozinho no dia seguinte. Derivado do token longo, o token de
página não expira enquanto a permissão existir.

O `state` vai assinado com o App Secret (HMAC + validade de 10 min) em vez de
guardado em tabela: sem ele, alguém induz você a abrir o callback com o `code`
da conta dele e as páginas do atacante entram no seu workspace.

**Inscrição nos eventos.** Conectar a página não basta: sem
`POST /{page-id}/subscribed_apps` a Meta não envia **nada** para o webhook, por
mais gatilho que exista cadastrado. A inscrição é feita no momento da conexão,
nos campos `feed`, `messages`, `messaging_postbacks`, `message_deliveries` e
`message_reads`.

Ela vale para a **página inteira** — todos os posts, inclusive os publicados
depois — e dura até alguém remover o app da página. Não há nada a fazer a cada
vídeo novo.

Falhar ao inscrever **não** desfaz a conexão: a página fica conectada com o
motivo registrado e o token preservado. Perder o token por um erro de inscrição
seria pior do que ficar sem receber evento. `POST /api/pages/:id/subscribe`
tenta de novo.

`POST /api/pages/scan` revalida o token de cada página e **reinscreve quem
tiver perdido a inscrição** ou estiver inscrito em menos campos que o
necessário — a inscrição cai quando alguém remove o app da página, e o sintoma
é "os fluxos pararam de disparar", sem erro visível em lugar nenhum. Token morto vira
`status = 'inactive'`, o que já a tira da rotação de envio — sem passo manual.
Falha não classificada (instabilidade da Meta) marca `unknown` mas **não**
desativa a página.

Outras rotas: `GET /api/pages` (com saúde, app, grupo e contagem de leads),
`DELETE /api/pages/:id`, `PATCH /api/pages/:id/group`, e o CRUD de
`/api/page-groups`. `GET /api/pages/oauth/config` devolve o Redirect URI e a
Callback URL prontos pra colar no painel do Meta.

## Leads

`GET /api/leads` — listagem paginada com filtros combináveis por página,
origem (`comment | import | broadcast | manual`), tag, inscrição e
entregabilidade, mais busca por nome ou PSID. As tags vêm agregadas por
subconsulta: com JOIN, um lead com 3 tags viraria 3 linhas e estouraria a
paginação.

Tags moraram num `TEXT[]` em `leads.tags` e agora são a tabela `lead_tags`
(migration 006, com backfill). O array não guarda **quando** a tag foi
aplicada, e é isso que o funil por etapas precisa saber.

**Entregabilidade** (`ok | failing | blocked`) é derivada do resultado dos
envios, não digitada:

- sucesso zera `consecutive_failures` e volta pra `ok`
- 3 falhas seguidas viram `failing` — 1 falha é ruído (timeout, instabilidade)
- código 551 ou 2018001 da Meta ("a pessoa não está disponível", "nenhum
  usuário corresponde") marca `blocked` na hora, sem esperar as 3
- qualquer nova interação do lead reabilita, inclusive a partir de `blocked`

A distinção importa: erro **do destinatário** marca o lead e não encosta no
app; erro **do app** (códigos 4, 17, 190, …) troca de app e não encosta no
lead.

`DELETE /api/leads/:id` recusa lead com histórico de mensagem ou fluxo e
sugere descadastrar — apagar levaria junto a métrica dos relatórios.

## Broadcasts

Campanhas de envio em massa. `npm run broadcast-worker` roda a fila (processo
separado, como o poller de fluxos).

**A fila é uma tabela, não Redis.** `broadcast_recipients` usa o mesmo lease
(`locked_by` / `locked_until`) de `flow_executions`. O roteiro previa BullMQ;
optamos por Postgres para não ter dois sistemas de fila no projeto — o motor de
fluxos nunca usou BullMQ — e para não depender de infra que ainda não existe.

**O público é congelado no start**, não reavaliado a cada envio. Um filtro
reavaliado no meio faria a barra de progresso andar pra trás quando um lead
novo entrasse na tag, e pausar/retomar não saberia quem já recebeu. Por padrão
o público exclui descadastrados e leads `blocked` — disparar pra eles é o jeito
mais rápido de queimar o app.

**Pausar não precisa de sinal entre processos**: o claim tem `JOIN broadcasts
... WHERE b.status = 'running'`, então a campanha sai de `running` e o worker
simplesmente para de enxergar as linhas dela. O progresso vive na tabela, então
sobrevive a reinício.

**Janela de 24h**: lead com interação nas últimas 24h recebe mensagem livre
(`RESPONSE`); fora dela, a Meta só aceita mensagem etiquetada, então o envio usa
`messaging_type: MESSAGE_TAG` + a tag do template da campanha. Sem template
configurado, o destinatário é marcado `skipped` com o motivo — mais honesto do
que tentar e tomar erro da Meta lead a lead.

**Retentativa** distingue de quem é a culpa: erro de conta (limite do app,
restrição, nenhum app disponível) devolve o destinatário pra fila dentro do
orçamento de `attempts`; erro do destinatário não, porque repetir daria o mesmo
erro gastando envio.

Rate limit: `BROADCAST_BATCH` destinatários a cada `BROADCAST_INTERVAL_MS`
(padrão ~10/s), enviados em sequência para não virar pico.

## Templates

**O Messenger não tem aprovação de template.** Isso é do WhatsApp Cloud API.
Aqui o mecanismo para falar fora da janela de 24h é a *message tag*
(`CONFIRMED_EVENT_UPDATE`, `POST_PURCHASE_UPDATE`, `ACCOUNT_UPDATE`,
`HUMAN_AGENT`), que não passa por revisão individual.

Por isso `POST /api/templates/sync` consulta o `messaging_feature_review` **da
página** — a revisão que a Meta de fato faz e que pode barrar o envio. Editar o
conteúdo de um template devolve ele para `pending`: o que foi verificado antes
já não descreve o que está lá agora. O broadcast só usa template `approved`;
enviar com um pendente é justamente o que faz a Meta restringir o app.

## Telemetria (entrega, leitura e clique)

Três origens de dado que antes não existiam — e sem as quais metade dos
relatórios seria zero permanente:

- **Entrega e leitura**: o webhook passou a tratar o campo `messaging`
  (`delivery` e `read`). A atualização é por *watermark* (a Meta diz "tudo até
  este instante foi entregue"), com os `mids` como reforço. O status nunca
  regride: uma entrega que chega depois da leitura não rebaixa `read`.
- **Resposta do lead** no Messenger reabre a janela de 24h e reabilita o envio.
- **Cliques**: a Meta não informa clique em link. Os botões saem apontando para
  `/r/:token`, que redireciona e contabiliza. Só **botões** são reescritos —
  eles têm a URL num campo estruturado; link solto no texto exigiria adivinhar
  onde a URL começa e termina dentro da frase escrita pelo cliente.

O redirecionador responde primeiro e grava depois: perder uma métrica é
aceitável, mandar quem clicou para uma página de erro não.

## Relatórios

`GET /api/reports?dias=1|7|15|30` devolve o painel inteiro; cada bloco também
tem rota própria. As nove agregações rodam **em sequência** — são consultas
sobre as mesmas tabelas, e em paralelo só disputam I/O entre si.

**As janelas de período são calculadas no SQL**, com o relógio do banco. Usar
`new Date()` do Node como limite superior é uma corrida real: as linhas são
gravadas com `now()` do Postgres, e se esse relógio estiver adiante por
milissegundos, um registro criado agora cai fora de uma janela que termina
"agora" e some do relatório.

**Progresso nos fluxos** (`GET /api/reports/progresso-fluxos`, opcionalmente
`?flowId=`): as etapas saem dos próprios nós de tag dos fluxos, ordenadas pelo
`step_order` do config do nó. Tag sem `step_order` aparece no fim em vez de
sumir. A primeira etapa é a régua de 100%.

Os endpoints incluem um campo `avisos` explicando que zero em cliques ou
visualizações pode ser ausência de instrumentação, não de comportamento. As
recomendações só afirmam o que o dado sustenta: sem envios no período, o card
diz isso em vez de inventar conselho.

## Frontend

`npm run dev --prefix web` (ou o preview do editor). O proxy do vite manda
`/api` e `/r/<token>` pra API; `API_PORT` em `web/.env.local` troca a porta de
destino sem editar o config.

A regra de proxy do redirecionador é **regex** (`^/r/[A-Za-z0-9_-]+$`), não
string: como string o vite casa por prefixo, e `/r` engoliria `/relatorios`.

Telas prontas: **Dashboard** (`/`), **Relatórios** (`/relatorios`), **Páginas**
(`/paginas`), **Leads** (`/leads`), **Broadcasts** (`/broadcasts`) e
**Templates** (`/templates`) e **Fluxos** (`/fluxos`). Faltam Comentários,
Configurações e Cobrança — ainda `ComingSoon`.

Botões, campos e badges vivem em `styles/global.css`, não repetidos por tela:
são seis telas usando os mesmos controles, e duplicar estilo é como as
variações acidentais aparecem. Os diálogos usam `<dialog>` nativo, que já traz
Esc, foco preso e o resto da página inerte para leitor de tela.

## Auto-resposta de comentários

`/comentarios`. Uma **regra** responde "quando alguém comentar isto, aqui, o que
a gente faz?" — e as três ações são independentes e combináveis:

| ação | o que faz |
|---|---|
| resposta pública | responde no próprio comentário (`POST /{comment-id}/comments`) |
| resposta privada | manda DM por `private_replies` — é o que captura o lead |
| fluxo | coloca a pessoa numa sequência, opcionalmente a partir de um bloco escolhido |

Regra sem nenhuma ação é recusada pelo banco (`flow_triggers_acao_check`) — ela
não faria nada e só confundiria quem lê a lista.

**Com fluxo escolhido, o texto privado é ignorado**: mandar os dois faria a
pessoa receber duas mensagens seguidas dizendo a mesma coisa.

**Prioridade entre regras**, da mais específica para a mais genérica: post
específico > `exact` > `contains` > `any` > palavra-chave mais longa > a mais
antiga. Sem essa ordem uma regra "qualquer comentário" engoliria as de
palavra-chave e ninguém entenderia por que a específica nunca dispara.

**As ações falham de forma independente.** Resposta pública e DM têm carimbos
separados em `comments`, e uma falha numa não impede a outra — "respondi no
comentário mas a DM não saiu" precisa aparecer na tela, não sumir num booleano.

A tela mostra as regras e, abaixo, o histórico dos comentários capturados com o
que foi respondido em cada um. Responder publicamente exige a permissão
`pages_manage_engagement`.

## Editor de fluxos

`/fluxos`. Três colunas: lista de fluxos com liga/desliga, paleta + canvas, e
painel de teste.

O canvas guarda `position_x`/`position_y` em cada nó e salva no mesmo formato
que o motor lê (`type`, `config`, `next_node_id`). Antes de gravar, o backend
valida o desenho: ponteiro para bloco inexistente, bloco sem texto/tag/duração
e início inválido são recusados ali — um `next_node_id` quebrado só apareceria
como execução `failed` lá na frente, com o lead no meio do caminho.

**O liga/desliga desliga de verdade**: `matchKeywordToFlow` exige
`status = 'active'`, então um fluxo desligado não dispara mesmo com a
palavra-chave cadastrada.

### Bloco de mensagem

Um bloco não é "um texto com botões": é uma **lista de partes** (texto, imagem,
áudio, vídeo) que saem em sequência, mais botão, link e resposta rápida. A ordem
importa — é a ordem em que a pessoa recebe.

`src/messageContent.js` é o único lugar que traduz isso para a Send API, e as
regras vêm dela, não de escolha nossa:

- cada parte vira **uma mensagem**;
- botão/link exigem template de texto, então se prendem à **última parte de
  texto** — anexo não aceita botão junto;
- resposta rápida se prende à **última mensagem** do bloco;
- limites cortados na origem: 2.000 caracteres, 3 botões, 13 respostas rápidas.

Config antigo (`config.text`) continua valendo — normalizado como uma parte de
texto, sem migração de dados.

### Upload de mídia

A Meta **não recebe** o arquivo: ela busca numa URL pública. `POST
/api/uploads?tipo=imagem|audio|video` hospeda o arquivo e devolve a URL —
é para isso que o upload existe. Nome em disco aleatório (o original permitiria
um upload sobrescrever outro), tipo conferido contra o que a Send API aceita, e
teto de 25 MB. O campo de link continua disponível para quem já hospeda em CDN
própria.

### Testar fluxo

`POST /api/flows/:id/test` com `{ pageId }` roda o fluxo **sem enviar e sem
gravar nada**: reaproveita os handlers reais de `src/engine/nodes` com um
messenger que só anota e um `leads` que opera sobre tags em memória. Reescrever
a lógica aqui faria o teste divergir do motor — que é exatamente o que ninguém
quer descobrir em produção. Ciclo no desenho para em 60 passos e é reportado.

A escolha é a **página**, não um lead da base: um lead existente já carrega tags
de execuções anteriores, e a condição do fluxo se comportaria diferente do que
acontece com quem acabou de comentar. `{ leadId }` continua aceito para testar
contra alguém específico.

**Tipos de gatilho** (`flow_triggers.match_type`):

| tipo | dispara quando |
|---|---|
| `exact` | o comentário inteiro é a palavra-chave |
| `contains` | a palavra-chave aparece em algum ponto do texto |
| `any` | **qualquer comentário** na página, sem palavra-chave |

A prioridade é `exact` > `contains` > `any`: o "qualquer comentário" é a rede
de segurança da página, então só vale quando nenhum gatilho específico casou —
senão engoliria todos os outros. Empate resolve pelo mais antigo, para a
escolha ser sempre a mesma diante do mesmo comentário.

Só existe um gatilho `any` por fluxo e página, e keyword vazia segue proibida
nos outros tipos (constraint no banco) — um `contains` com keyword vazia
casaria com tudo sem ninguém ter pedido isso.

O roteiro previa dois botões, "Páginas" e "Gatilho". No modelo de dados os dois
editam a mesma linha (`flow_triggers` = página + palavra-chave), então viraram
um só: duas telas mexendo na mesma coisa só criam a dúvida de qual manda.

## Configurações

`/configuracoes`. É de onde sai tudo que precisa ser colado no painel do Meta:
Callback URL do webhook, token de verificação (um **por app**), OAuth Redirect
URI, URL do site, Política de Privacidade, Termos e o callback de exclusão de
dados. Cada campo diz **onde** vai no painel — são cinco URLs parecidas e sem
isso não dá pra saber qual é qual.

`GET /api/settings/urls` também devolve `prontoParaProducao: false` enquanto
`APP_BASE_URL` for http ou localhost: a Meta não alcança esses endereços, e
descobrir isso só quando o webhook não dispara custa caro.

**Exclusão de dados** (`POST /api/data-deletion`) é exigido pela Meta para
aprovar o app. Valida o `signed_request` contra o App Secret de cada app
cadastrado, apaga o lead e as tags daquela pessoa, **anonimiza** os comentários
(em vez de apagá-los, o que quebraria a contagem dos relatórios) e devolve o
código de confirmação no formato que a Meta espera. `GET
/api/settings/data-deletion/:codigo` é a página que a pessoa abre com o código.

**Política de Privacidade** (`/privacidade`) e **Termos** (`/termos`) são
servidos pela própria ferramenta, sem autenticação — o revisor da Meta acessa
direto. O texto não é genérico: descreve exatamente o que o sistema coleta
(PSID, nome e foto de quem comenta, texto do comentário, status de entrega e
leitura, cliques, tags), as permissões pedidas no OAuth e os dois caminhos de
exclusão. Descrever a mais ou a menos é o que reprova na revisão.

O responsável (Piracicaba Marketing Digital, CNPJ 37.926.095/0001-89,
societario@smccontabil.com.br) é o padrão em `src/legal.js`, sobrescrevível por
`EMPRESA_NOME`/`EMPRESA_DOC`/`EMPRESA_EMAIL`/`EMPRESA_ENDERECO` para quem rodar
sob outra razão social. Sem identificação preenchida a página marca o campo em
destaque em vez de publicar em branco.

## Autenticação

Todo `/api/*` exige sessão. As únicas exceções são as rotas que a **Meta**
chama — `/api/webhook` e `/api/data-deletion` — e elas não ficam
desprotegidas: validam assinatura HMAC e `signed_request`. A proteção existe,
só não é cookie.

- Senha com **scrypt** (do próprio Node, sem dependência nova) — lento de
  propósito, é o que encarece a força bruta com o banco em mãos.
- Sessão em tabela, guardando o **hash** do token: com o banco vazado, as
  sessões ativas não viram acesso ao painel. "Sair" é um DELETE de verdade.
- Cookie `HttpOnly` + `SameSite=Lax`, e `Secure` quando `APP_BASE_URL` é HTTPS.
- E-mail inexistente e senha errada dão a **mesma** mensagem — a diferença
  entregaria a lista de e-mails cadastrados.
- 5 tentativas erradas travam a conta por 15 minutos.
- Trocar a senha derruba todas as sessões: se a troca foi por vazamento, deixar
  as antigas vivas anula o motivo de ter trocado.

Primeiro acesso: com o banco sem usuários, a tela oferece criar a conta dona do
workspace. `POST /api/auth/setup` fecha depois disso — senão seria porta aberta.

Cada rota usa o workspace de **quem está logado** (`req.user.workspace_id`), não
mais "o workspace mais antigo".

## Publicando

```bash
npm run build      # compila o painel em web/dist
npm run migrate    # aplica migrations pendentes
npm run server     # sobe API + painel no mesmo processo
```

Com `web/dist` existindo, o Express serve o painel junto da API — a aplicação
inteira roda em **um processo só**, sem servidor web na frente. Serve para
Railway, Render ou VPS. O fallback do SPA fica depois de todas as rotas, então
`/api`, `/uploads`, `/r` e as páginas legais continuam respondendo o que devem.

Em servidor comum, suba também os dois processos de fundo:

```bash
npm start                 # poller: retoma fluxos em Espera
npm run broadcast-worker  # fila de campanhas
```

Em serverless eles não existem — ver a seção seguinte.

## Hospedagem na Vercel

A Vercel é serverless: **não existe processo contínuo**. Duas peças dependiam
disso e foram adaptadas.

**Fluxos e campanhas** viviam de dois laços (`npm start` e
`npm run broadcast-worker`). Em serverless quem aciona é um cron externo:

```
GET /api/cron/tick     header: x-cron-secret: $CRON_SECRET
```

Cada chamada retoma um lote de fluxos em espera, promove campanhas agendadas,
envia um lote de destinatários e limpa sessões vencidas. Isso só funciona
porque a fila mora no banco com lease — o mesmo desenho que protegia contra
dois workers agora protege contra duas invocações do cron se sobrepondo.

Sem o segredo a rota devolve **404**, não 401: não confirma nem que existe.

⚠️ **O cron da Vercel roda uma vez por dia no plano Hobby.** Para fluxo com
Espera e campanha, isso é inútil — precisa do plano Pro (cron por minuto) ou de
um cron externo gratuito (cron-job.org, por exemplo) batendo em
`/api/cron/tick` a cada minuto.

**Mídias** iam para o disco local, que na Vercel é apagado entre invocações —
a imagem funcionaria no teste e sumiria no disparo. Com `BLOB_READ_WRITE_TOKEN`
definido, os arquivos vão para o Vercel Blob. Sem ele, em `VERCEL`, a tela
avisa.

**Banco**: a Vercel não hospeda Postgres. Use Neon ou Supabase e prefira a
string **pooled** — serverless abre muitas conexões curtas e o limite estoura
rápido. Rode `npm run migrate` a cada deploy que traga migration nova.

Variáveis obrigatórias: `DATABASE_URL`, `APP_BASE_URL` (HTTPS público),
`CRON_SECRET`. Recomendadas: `BLOB_READ_WRITE_TOKEN`, `EMPRESA_*`.

## Migrations

`npm run migrate` aplica cada arquivo **uma vez**, registrando em
`schema_migrations`, cada um na sua própria transação. Antes reaplicava tudo a
cada execução, o que só funcionava porque toda migration era idempotente —
proibia migration destrutiva e ficava mais lento a cada arquivo.

## Pendências / decisões em aberto

- Para entrega/leitura chegarem, o app precisa assinar os campos
  `message_deliveries` e `message_reads` no painel do Meta (além de `feed`).
- O card "APIs conectadas" do dashboard calcula % sobre o limite do **plano**
  (era o que a etapa 9 pedia), enquanto `/api/facebook-apps` calcula sobre o
  `message_limit` do **app**. Os dois números podem divergir.
- `app_secret` e `page_access_token` estão em texto puro no banco.
- O OAuth foi testado com a Graph API simulada; falta uma rodada com app real
  (exige `APP_BASE_URL` em HTTPS público cadastrado no painel do Meta).
- Lease não testado com múltiplos workers em paralelo.
- Formato exato de `flows.definition_json.nodes` (array com `id`/`type`/`config`/`next_node_id`).
- Janela de 24h fora do primeiro contato: envio por template aprovado (etapa 8).
