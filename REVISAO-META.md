# Liberar o disparo para o público — Análise do App da Meta

Guia da última etapa: sair do Acesso Padrão (só quem tem papel no app) para o
Acesso Avançado (qualquer pessoa que comentar).

**Situação atual, comprovada em produção:** o comentário chega, vira lead e o
fluxo executa. A Meta recusa apenas a entrega da mensagem, com
`(#200) Missing Permissions`. Não há nada a corrigir no código.

**O que você NÃO precisa:** virar "Provedor de Tecnologia". Isso só vale para
quem opera páginas de outras empresas. Suas 5 páginas são suas.

---

## Empresa — RESOLVIDO

O portfólio empresarial **"Victor Dos Santos Dias - Api250"**
(ID `1713868336649164`) **já está verificado desde 17/05/2026**. A etapa mais
lenta do processo está pronta.

Entidade verificada:

- 58.338.495 VICTOR DOS SANTOS DIAS
- CNPJ 58.338.495/0001-43
- Av. Oliveira 9A, Salvador/BA, CEP 41.225-850

As páginas legais publicadas foram alinhadas a esses dados em `src/legal.js`,
porque a análise cruza a política com a empresa verificada e divergência
reprova. Antes elas diziam Piracicaba Marketing Digital.

Nada a fazer aqui — pule para a Parte 2.

---

## Parte 1 — Verificação do Negócio ✅ FEITA

Concluída em 17/05/2026. Confira em
[business.facebook.com/settings](https://business.facebook.com/settings) →
**Informações da empresa** → *Status de verificação da empresa*.

(Se um dia precisar refazer para outro portfólio: é nessa mesma tela, botão
**Iniciar verificação**, com cartão CNPJ ou contrato social, e leva de 2 a 10
dias úteis. O nome digitado tem que bater caractere por caractere com o
documento — um "LTDA" faltando reprova. Não confunda com a **Central de
Segurança**, que trata de segurança de anúncios e não tem relação com a análise
do app.)

---

## Parte 2 — Gravar o vídeo (screencast)

**Obrigatório.** É o item que mais reprova, e a causa nº 1 de reprovação é o
vídeo começar com o app já conectado: a Meta precisa ver a **tela de
consentimento do Facebook**, onde as permissões aparecem e são autorizadas.
Não basta mostrar a mensagem chegando.

### 2.1 Preparar um testador

Sem isso você não consegue gravar, porque o envio está bloqueado justamente
para quem não tem papel no app.

1. Painel do app → **Funções do app** → **Testadores**
2. **Adicionar testadores** → digite o perfil do Facebook da pessoa
3. Nesse perfil: [developers.facebook.com/settings](https://developers.facebook.com/settings)
   → aba **Solicitações** → **Confirmar**

### 2.2 Antes de gravar

Para conseguir filmar a tela de consentimento, **desconecte as páginas** no
Disparo (Páginas → remover). Você vai reconectá-las durante a gravação — é
esse momento que o revisor precisa ver.

### 2.3 O que gravar, na ordem

Uma tomada só, sem cortes, mouse visível, 1080p. De 2 a 4 minutos.

| # | O que mostrar | Prova qual permissão |
|---|---|---|
| 1 | Login no painel do Disparo (`disparo-gx97.vercel.app`) | contexto do produto |
| 2 | Páginas → **Conectar com Facebook** | início do fluxo |
| 3 | **A tela de consentimento do Facebook, com a lista de permissões visível** | ⚠️ o item mais importante |
| 4 | A seleção das páginas e o "Continuar" | `pages_show_list` |
| 5 | As páginas aparecendo conectadas no painel | `pages_manage_metadata` |
| 6 | O fluxo montado no editor | contexto do produto |
| 7 | Um post da página **Prosperidade Diária** | a página é sua |
| 8 | O testador escrevendo e publicando o comentário | o gatilho |
| 9 | Painel → **Comentários**, com o comentário capturado | `pages_read_engagement` |
| 10 | O Messenger daquele perfil recebendo a mensagem | `pages_messaging` |
| 11 | A pessoa clicando no botão da mensagem | o fluxo completo |
| 12 | Painel → **Leads**, com o lead criado | fecha o ciclo |

Passe devagar nos itens 3, 9 e 10 — são os que provam cada permissão pedida.
Uma permissão que não apareça em uso no vídeo põe a submissão inteira em risco.

### 2.4 O idioma

O painel do Disparo e o Facebook estarão em português. O revisor é
internacional: **adicione legendas em inglês** ou uma faixa de texto sobre o
vídeo dizendo o que está acontecendo em cada etapa. Interface em outro idioma
sem legenda é motivo declarado de reprovação.

Sugestão de legendas, na ordem das cenas:

1. `Logging into our tool`
2. `Connecting our Facebook Page`
3. `Facebook permission consent screen`
4. `Selecting the Pages we own`
5. `Pages connected`
6. `The automated flow we configured`
7. `A post on our Page`
8. `A user comments on the post`
9. `Our tool reads the comment (pages_read_engagement)`
10. `The user receives a private reply on Messenger (pages_messaging)`
11. `The user taps the button in the message`
12. `The contact is saved in our tool`

**Não grave:** código, banco de dados, ou o painel de desenvolvedores da Meta.

Ferramentas: gravador do Windows (`Win + Alt + R`), OBS ou Loom.
MP4, até 500 MB.

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
| **Vídeo começa já conectado** | Desconecte as páginas antes e refaça o login na gravação |
| **Tela de consentimento não aparece** | Passe devagar nela, com as permissões legíveis |
| **Interface em português sem legenda** | Legendas em inglês (modelo na Parte 2.4) |
| Permissão pedida não aparece em uso | Cada permissão precisa de uma cena que a demonstre |
| Vídeo não mostra a mensagem chegando | Filme a tela do Messenger do testador recebendo |
| Vídeo mostra código ou o painel de dev | Grave só o que um usuário comum veria |
| Cursor escondido ou baixa resolução | Mouse visível, 1080p |
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

- [x] Empresa alinhada (política = empresa verificada na Meta)
- [x] Verificação do Negócio aprovada — 17/05/2026
- [ ] Testador adicionado e convite aceito
- [ ] Fluxo testado de ponta a ponta com o testador
- [ ] Páginas desconectadas para poder filmar a reconexão
- [ ] Vídeo gravado, começando pelo login e pela tela de consentimento
- [ ] Legendas em inglês adicionadas
- [ ] `pages_messaging` solicitada com descrição e vídeo
- [ ] `pages_read_engagement` solicitada com descrição e vídeo
- [ ] Aprovação recebida
- [ ] Testado com perfil sem nenhum papel no app
