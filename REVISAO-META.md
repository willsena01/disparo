# Liberar o disparo para o público — Análise do App da Meta

Guia da última etapa: sair do Acesso Padrão (só quem tem papel no app) para o
Acesso Avançado (qualquer pessoa que comentar).

**Situação atual, comprovada em produção:** o comentário chega, vira lead e o
fluxo executa. A Meta recusa apenas a entrega da mensagem, com
`(#200) Missing Permissions`. Não há nada a corrigir no código.

**O que você NÃO precisa:** virar "Provedor de Tecnologia". Isso só vale para
quem opera páginas de outras empresas. Suas 5 páginas são suas.

---

## Antes de começar — decida o CNPJ

O app hoje está sob o negócio **"Victor Dos Santos Dias - Api250"**, mas as
páginas legais publicadas (Política de Privacidade e Termos) dizem:

- Piracicaba Marketing Digital
- CNPJ 37.926.095/0001-89
- societario@smccontabil.com.br

**Os dois precisam ser a mesma empresa.** Se o negócio verificado for um e a
política disser outro, a análise reprova por inconsistência. Escolha um e
ajuste o outro lado antes de enviar:

- Manter Piracicaba Marketing Digital → crie/transfira o app para um negócio
  com esse CNPJ no Business Manager
- Manter Victor Dos Santos Dias → altere as variáveis `EMPRESA_NOME`,
  `EMPRESA_DOC` e `EMPRESA_EMAIL` na Vercel e faça redeploy

---

## Parte 1 — Verificação do Negócio

Obrigatória para pedir Acesso Avançado. É a etapa mais lenta: separe os
documentos antes.

1. Acesse [business.facebook.com](https://business.facebook.com)
2. Menu → **Configurações do negócio**
3. **Central de Segurança** (ou *Informações do negócio*)
4. Clique em **Iniciar verificação**
5. Preencha exatamente como está no cartão CNPJ:
   - Razão social
   - CNPJ
   - Endereço completo
   - Telefone
   - Site (`https://disparo-gx97.vercel.app`)
6. Envie **um** destes documentos:
   - Cartão CNPJ (comprovante de inscrição da Receita Federal)
   - Contrato social
   - Conta de luz/água/telefone no nome da empresa (últimos 90 dias)
7. Confirme por telefone, SMS ou e-mail do domínio

**Prazo:** 2 a 10 dias úteis.

**Reprova quando:** o nome no documento difere do digitado (um "LTDA" faltando
já basta), o documento está cortado ou ilegível, ou o endereço não confere.

---

## Parte 2 — Gravar o vídeo (screencast)

É o item que mais reprova. A Meta precisa **ver** o fluxo funcionando, do
comentário até a mensagem chegando.

### 2.1 Preparar um testador

Sem isso você não consegue gravar, porque o envio está bloqueado justamente
para quem não tem papel no app.

1. Painel do app → **Funções do app** → **Testadores**
2. **Adicionar testadores** → digite o perfil do Facebook da pessoa
3. Nesse perfil: [developers.facebook.com/settings](https://developers.facebook.com/settings)
   → aba **Solicitações** → **Confirmar**

### 2.2 O que gravar

Grave a tela em uma tomada só, sem cortes, com o mouse visível. Duração de
1 a 3 minutos. Sem áudio é aceito; legenda ajuda.

| # | O que mostrar | Por quê |
|---|---|---|
| 1 | O post na página **Prosperidade Diária** | prova que a página é sua |
| 2 | O testador escrevendo e publicando o comentário | mostra o gatilho |
| 3 | O Messenger daquele perfil recebendo a mensagem | prova o uso da permissão |
| 4 | A pessoa clicando no botão da mensagem | mostra o fluxo completo |
| 5 | O painel do Disparo → **Comentários**, com o registro | mostra o produto |
| 6 | O painel → **Leads**, com o lead criado | fecha o ciclo |

**Não grave:** telas de código, o banco de dados, ou o painel de
desenvolvedores da Meta. O revisor quer ver o produto do ponto de vista do
usuário.

Ferramentas: gravador de tela do Windows (`Win + Alt + R`), OBS, ou Loom.
Formato MP4, até 500 MB.

---

## Parte 3 — Solicitar o Acesso Avançado

1. Painel do app → **Casos de uso**
2. Abra **Interagir com os clientes no Messenger** → **Personalizar**
3. Aba **Permissões e recursos**
4. Nas linhas abaixo, clique em **Solicitar acesso avançado**:
   - `pages_messaging`
   - `pages_read_engagement`
5. Anexe o vídeo e cole as descrições da próxima seção
6. **Enviar para análise**

**Prazo:** 3 a 15 dias úteis. A resposta chega por e-mail e na Caixa de
Entrada de alertas do app.

---

## Textos prontos para colar

Escreva em **inglês**: os revisores são internacionais e submissões em
português têm mais chance de voltar com pedido de esclarecimento. Abaixo de
cada texto está a tradução, só para você conferir o que está enviando.

### pages_messaging

> Our app sends an automated private reply on Messenger to people who comment
> on posts published on our own Facebook Pages.
>
> When someone comments, we use the `private_replies` edge of that comment to
> send a single message containing the material the person asked for in the
> comment (a link, an audio message, or a file). The person can then continue
> the conversation with quick-reply buttons.
>
> We only message people who have voluntarily commented on our own Pages,
> which is the interaction that opens the 24-hour messaging window. We do not
> import contact lists, we do not message people who have not interacted with
> us, and every message includes a way to stop receiving them.
>
> All Pages used by this app are owned and administered by our business.

*(Enviamos uma resposta privada automática no Messenger para quem comenta nas
publicações das nossas próprias páginas. Usamos o `private_replies` do
comentário para mandar uma mensagem com o material que a pessoa pediu. Só
falamos com quem comentou espontaneamente; não importamos listas nem mandamos
mensagem para quem não interagiu. Todas as páginas são nossas.)*

### pages_read_engagement

> We read the comments published on our own Pages in order to detect who asked
> for our material and to identify the specific comment we must reply to
> privately.
>
> We read the comment ID, the commenter's public name and profile ID, and the
> comment text. The comment text is used to decide which automated flow
> applies. We do not read or store comments from Pages we do not own.

*(Lemos os comentários das nossas próprias páginas para detectar quem pediu o
material e identificar a qual comentário responder em privado. Lemos o ID do
comentário, o nome público e o ID de quem comentou, e o texto. Não lemos
comentários de páginas que não são nossas.)*

### Se pedirem instruções de teste passo a passo

> 1. Open the Facebook Page "Prosperidade Diária"
> 2. Open any published post
> 3. Write a comment, for example "quero"
> 4. Within a few seconds, the commenter receives a private message on
>    Messenger from the Page, containing the requested material
> 5. The message includes a button; clicking it advances the conversation

---

## Motivos comuns de reprovação

| Reprovou por | Como evitar |
|---|---|
| Vídeo não mostra a mensagem chegando | Filme a tela do Messenger do testador recebendo |
| Vídeo mostra código ou o painel de dev | Grave só o que um usuário comum veria |
| Política de Privacidade inacessível | Confirme que `/privacidade` abre sem login |
| Empresa da política ≠ negócio verificado | Resolva antes de enviar (ver topo deste guia) |
| Descrição genérica | Use os textos acima: dizem o dado lido e o porquê |
| App em modo desenvolvimento | Publique antes (já feito) |

---

## Depois da aprovação

Nada a fazer no código. As permissões passam a valer para os tokens
existentes — não é preciso reconectar as páginas.

Confira assim:

1. Comente num post de **qualquer perfil sem papel no app**
2. Painel → **Configurações**: a faixa do app deve estar verde com `(feed)`
3. Painel → **Comentários**: o comentário aparece no histórico
4. A mensagem chega no Messenger daquela pessoa

Se falhar, a tela de Comentários agora mostra o motivo já traduzido — inclusive
"falta Acesso Avançado" — em vez do texto cru da Graph API.

---

## Checklist

- [ ] Decidido qual CNPJ vale (app e política batendo)
- [ ] Verificação do Negócio enviada
- [ ] Verificação do Negócio aprovada
- [ ] Testador adicionado e convite aceito
- [ ] Fluxo testado de ponta a ponta com o testador
- [ ] Vídeo gravado (comentário → mensagem → botão → painel)
- [ ] `pages_messaging` solicitada com descrição e vídeo
- [ ] `pages_read_engagement` solicitada com descrição e vídeo
- [ ] Aprovação recebida
- [ ] Testado com perfil sem nenhum papel no app
