# Publicar na Vercel

> **Antes de começar, três coisas que não são opinião:**
>
> 1. Nenhuma chamada real ao Facebook jamais foi feita. OAuth, inscrição da
>    página e envio foram testados contra uma Graph API simulada. Este é o
>    primeiro contato real.
> 2. Em **modo de desenvolvimento**, o Facebook só entrega mensagem a quem tem
>    papel no app (você e testadores). Comentarista qualquer **não recebe** até
>    sair o App Review.
> 3. O cron da Vercel roda **uma vez por dia** no plano Hobby. Sem cron por
>    minuto, fluxo com Espera trava e campanha não sai. Solução no passo 5.

---

## 1. Banco de dados

A Vercel não hospeda Postgres. Crie em [neon.tech](https://neon.tech) ou
[supabase.com](https://supabase.com) (os planos gratuitos servem).

Copie a connection string **pooled** (a que tem `-pooler` no host). Serverless
abre muitas conexões curtas e a string direta estoura o limite.

## 2. Subir o código

```bash
cd C:\Users\esson\Disparo
git init
git add .
git commit -m "primeira versão"
```

Crie um repositório no GitHub e faça o push. Na Vercel: **Add New → Project →
Import** desse repositório. Não mude nada nas configurações de build — o
`vercel.json` já define tudo.

## 3. Variáveis de ambiente (Vercel → Settings → Environment Variables)

| Variável | Valor | Obrigatória |
|---|---|---|
| `DATABASE_URL` | a string pooled do passo 1 | sim |
| `APP_BASE_URL` | `https://seu-projeto.vercel.app` | sim |
| `CRON_SECRET` | qualquer texto longo e aleatório | sim |
| `BLOB_READ_WRITE_TOKEN` | do Vercel Blob | só se usar mídia nos blocos |

`APP_BASE_URL` precisa ser exatamente a URL final, com `https://` e **sem barra
no fim** — ela monta a Callback URL e o Redirect URI que a Meta vai conferir
caractere a caractere.

Faça o deploy.

## 4. Criar as tabelas

Uma vez só, da sua máquina, apontando para o banco de produção:

```bash
set DATABASE_URL=<a mesma string do passo 1>
npm run migrate
npm run seed
```

Depois crie seu usuário: abra `https://seu-projeto.vercel.app` — como não há
conta nenhuma, a tela oferece **criar a primeira**. Ela vira a dona do
workspace.

## 5. Cron (sem isso, metade do produto não funciona)

O poller e o worker de campanha não existem em serverless. Alguém precisa
chamar, **a cada minuto**:

```
GET https://seu-projeto.vercel.app/api/cron/tick
Header: x-cron-secret: <o CRON_SECRET do passo 3>
```

Duas formas:

- **Grátis:** [cron-job.org](https://cron-job.org) — criar conta, novo cronjob,
  intervalo de 1 minuto, adicionar o header. Leva 2 minutos.
- **Plano Pro da Vercel** (US$ 20/mês): adicione ao `vercel.json`:
  ```json
  "crons": [{ "path": "/api/cron/tick", "schedule": "* * * * *" }]
  ```

Para conferir se está rodando: chame a URL você mesmo com o header. Deve
responder `{"ok":true,"execucoes":0,"destinatarios":0,...}`.

## 6. Painel do Meta

Em [developers.facebook.com](https://developers.facebook.com): criar app do
tipo **Empresa** → adicionar produto **Messenger**.

Abra **Configurações** no painel do Disparo — todos os valores abaixo estão lá,
com botão de copiar:

1. **Configurações → Básico** do Meta: cole URL do site, Política de
   Privacidade, Termos de Serviço e Callback de Exclusão de Dados.
2. Copie **App ID** e **App Secret** e cadastre no Disparo (botão “Adicionar
   app”).
3. **Messenger → Webhooks**: cole a Callback URL e o Token de verificação que o
   Disparo mostra. Assine os campos: `feed`, `messages`, `messaging_postbacks`,
   `message_deliveries`, `message_reads`.
4. **Login do Facebook → Configurações**: cole o OAuth Redirect URI.

## 7. Conectar a página e testar

No Disparo: **Páginas → Conectar com Facebook**, autorize e confirme que a
página aparece com o selo **“Recebendo comentários”** (verde). Se aparecer
vermelho, clique em **Ativar**.

Depois: **Fluxos → Novo**, monte um bloco de Mensagem, salve, e em **Páginas e
gatilhos** adicione a página com “qualquer comentário”. Ligue o fluxo.

**Comente você mesmo num post da página.** Em poucos segundos a mensagem deve
chegar no seu Messenger.

## Se não funcionar, olhe nesta ordem

| Sintoma | Onde olhar |
|---|---|
| Página não aparece após o OAuth | Redirect URI diferente do `APP_BASE_URL` |
| Selo “Não recebe comentários” | Clique em Ativar; se falhar, falta permissão no app |
| Comentei e nada aconteceu | Fluxo desligado, sem gatilho, ou webhook sem o campo `feed` |
| Fluxo manda a 1ª e para | Cron não está rodando (passo 5) |
| Mensagem não chega a outra pessoa | Modo de desenvolvimento — precisa de App Review |
| Imagem some do bloco | Falta `BLOB_READ_WRITE_TOKEN` |

Logs em tempo real: Vercel → seu projeto → **Logs**.

---

## Alternativa a considerar

Em **Railway** ou **Render**, os dois workers rodam de verdade (sem cron
externo), as mídias ficam no disco (sem Blob) e o comando é um só:

```bash
npm run build && npm run migrate && npm run server
```

mais `npm start` e `npm run broadcast-worker` como processos separados. Para
este app, sai mais simples e provavelmente mais barato que o Pro da Vercel.
