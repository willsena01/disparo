import { pool } from '../db/pool.js';
import { getPageByPageId, listSendableConnections } from '../pages.js';
import { incrementMessagesUsed, markAppBlocked } from '../facebookApps.js';
import { leads } from '../leads.js';
import { rastrearBotoes } from '../tracking.js';
import { montarMensagens } from '../messageContent.js';
import { contextoDoLead, interpolarConteudo } from '../variables.js';

const GRAPH_VERSION = process.env.FB_GRAPH_VERSION ?? 'v21.0';
const GRAPH_URL = `https://graph.facebook.com/${GRAPH_VERSION}`;

// Canal Messenger (Facebook). Endereça o lead por psid + page_id — leads de
// comentário não têm telefone, o PSID é o único endereço que existe.

// Códigos da Graph API que significam "este app não envia mais", não "esta
// mensagem falhou". Só eles tiram o app de circulação: um erro de destinatário
// (usuário bloqueou a página, PSID inválido) não pode bloquear o app inteiro,
// senão um lead ruim derruba o disparo de todos.
//
//   4   limite de chamadas da aplicação
//   17  limite de chamadas do usuário
//   190 token inválido/expirado
//   200 permissão ausente ou revogada
//   613 limite de frequência da chamada
//   368 ação bloqueada por comportamento abusivo
const CODIGOS_DE_BLOQUEIO_DO_APP = new Set([4, 17, 190, 200, 368, 613]);

// Códigos que dizem respeito a ESTE destinatário, não ao app: a pessoa
// bloqueou a página, apagou a conta ou o PSID não existe mais. Marcam o lead
// como inalcançável na hora, sem esperar as 3 falhas seguidas — já se sabe o
// desfecho.
//
//   551     a pessoa não está disponível (bloqueou a página)
//   2018001 nenhum usuário corresponde ao PSID informado
const CODIGOS_DE_LEAD_BLOQUEADO = new Set([551, 2018001]);

// O token vai no header, não na query string: é credencial, e query string
// vaza em log de proxy e em histórico de request.
async function graphPost(path, token, body) {
  const res = await fetch(`${GRAPH_URL}/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const meta = payload.error ?? {};
    const err = new Error(
      `Graph API ${res.status}: ${meta.message ?? 'erro desconhecido'}` +
        (meta.code ? ` (code ${meta.code}${meta.error_subcode ? `/${meta.error_subcode}` : ''})` : '')
    );
    err.graphCode = meta.code;
    err.bloqueiaApp = CODIGOS_DE_BLOQUEIO_DO_APP.has(meta.code);
    err.bloqueiaLead = CODIGOS_DE_LEAD_BLOQUEADO.has(meta.code);
    throw err;
  }
  return payload;
}

async function markMessagingOpened(leadId) {
  await pool.query(
    'UPDATE leads SET messaging_opened_at = now() WHERE id = $1 AND messaging_opened_at IS NULL',
    [leadId]
  );
}

// Registra o envio pra o dashboard. 'failed' é o proxy usado pra
// "caiu em spam/bloqueio" — a Meta não expõe isso, só que a entrega falhou.
async function recordMessage(lead, workspaceId, status, { executionId, broadcastId, errorReason, mid }) {
  const ws = workspaceId ?? lead.workspace_id;
  if (!ws) return;

  // O mid é o que permite casar o webhook de entrega/leitura com esta linha.
  await pool.query(
    `INSERT INTO messages
       (workspace_id, lead_id, flow_execution_id, broadcast_id, status, error_reason, mid)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [ws, lead.id, executionId ?? null, broadcastId ?? null, status, errorReason ?? null, mid ?? null]
  );
}

// Uma tentativa de entrega por uma conexão (página + app) específica.
async function enviarPor(conn, lead, message, ctx) {
  // A Meta não deixa abrir conversa no Messenger com quem só comentou: o
  // Send API responde erro até existir uma interação da pessoa. O caminho
  // permitido pra primeira mensagem é o private_replies do comentário, que
  // é o que abre a janela de 24h. A partir daí, Send API normal.
  if (!lead.messaging_opened_at && ctx.commentId) {
    const r = await graphPost(`${ctx.commentId}/private_replies`, conn.page_access_token, { message });
    await markMessagingOpened(lead.id);
    return r;
  } else {
    // Dentro da janela de 24h a mensagem é livre (RESPONSE). Fora dela a Meta
    // só aceita mensagem etiquetada — o broadcast passa messagingType
    // 'MESSAGE_TAG' + a tag do template aprovado.
    const body = {
      recipient: { id: lead.psid },
      messaging_type: ctx.messagingType ?? 'RESPONSE',
      message,
    };
    if (ctx.tag) body.tag = ctx.tag;
    return graphPost('me/messages', conn.page_access_token, body);
  }
}

export const messengerChannel = {
  name: 'messenger',

  supports(lead) {
    return Boolean(lead?.psid && lead?.page_id);
  },

  // Atalho para quem manda só um texto (broadcast, resposta de regra de
  // comentário). Delega pro caminho rico com uma parte só.
  async send(lead, text, buttons, ctx = {}) {
    return this.sendRich(lead, { parts: [{ type: 'texto', text }], buttons }, ctx);
  },

  // Envia o conteúdo de um bloco: várias partes (texto, imagem, áudio, vídeo)
  // em sequência, com botões e respostas rápidas presos onde a Send API exige.
  //
  // ctx vem do context_json da execução: carrega o comment_id quando o fluxo
  // foi disparado por um comentário, e o id da execução pra rastrear o envio.
  async sendRich(lead, config, ctx = {}) {
    const conexoes = await listSendableConnections(lead.page_id);
    const pagina = await getPageByPageId(lead.page_id);
    const workspaceId = pagina?.workspace_id ?? null;

    if (!conexoes.length) {
      const reason =
        `Nenhum app disponível para a página ${lead.page_id} ` +
        '(sem token, página inativa, ou todos os apps bloqueados/no limite)';
      await recordMessage(lead, workspaceId, 'failed', {
        executionId: ctx.executionId,
        broadcastId: ctx.broadcastId,
        errorReason: reason,
      });
      const err = new Error(reason);
      // Condição da conta, não do destinatário: o app pode voltar (limite
      // reseta, restrição sai). Quem chama decide se tenta de novo — o
      // broadcast tenta, dentro do orçamento de tentativas.
      err.semAppDisponivel = true;
      throw err;
    }

    // Personalização. Aqui é o único ponto por onde TUDO passa — fluxo,
    // broadcast e resposta de regra de comentário chegam neste método —, então
    // é onde o molde vira mensagem daquela pessoa. Feito antes do rastreio de
    // botões para que o título já saia interpolado no link gerado.
    const conteudo = interpolarConteudo(
      config,
      contextoDoLead(lead, {
        pageName: pagina?.name,
        keyword: ctx.matched_keyword,
        comment: ctx.comment_text,
      })
    );

    // Os botões saem apontando pro redirecionador da ferramenta: é a única
    // forma de saber que alguém clicou (a Meta não informa clique em link).
    const botoesRastreados = await rastrearBotoes(conteudo.buttons, {
      workspaceId,
      leadId: lead.id,
      broadcastId: ctx.broadcastId,
      executionId: ctx.executionId,
    });

    const mensagens = montarMensagens({ ...conteudo, buttons: botoesRastreados });
    if (!mensagens.length) return;

    let ultimoErro;
    // Índice da primeira mensagem ainda não entregue. Se a conexão cair no meio
    // do bloco, a próxima retoma daqui — reenviar as anteriores faria a pessoa
    // receber a mesma coisa duas vezes.
    let proxima = 0;

    // É aqui que a rotação acontece de fato: a lista já vem ordenada pelo app
    // menos usado, e um erro de restrição não encerra o envio — marca o app
    // como bloqueado (some das próximas consultas) e tenta o próximo na hora.
    for (const conn of conexoes) {
      try {
        for (; proxima < mensagens.length; proxima++) {
          const resposta = await enviarPor(conn, lead, mensagens[proxima], ctx);
          await recordMessage(lead, workspaceId, 'sent', {
            executionId: ctx.executionId,
            broadcastId: ctx.broadcastId,
            mid: resposta?.message_id,
          });
          await incrementMessagesUsed(conn.app_row_id);
        }
        await leads.recordDeliveryResult(lead.id, { ok: true });
        return;
      } catch (err) {
        ultimoErro = err;

        if (!err.bloqueiaApp) break; // falha da mensagem, não do app: não adianta trocar

        await markAppBlocked(conn.app_row_id, err.message);
        console.warn(
          `[messenger] app "${conn.app_name}" bloqueado (${err.message}) — tentando o próximo`
        );
      }
    }

    await recordMessage(lead, workspaceId, 'failed', {
      executionId: ctx.executionId,
      broadcastId: ctx.broadcastId,
      errorReason: ultimoErro?.message,
    });
    await leads.recordDeliveryResult(lead.id, {
      ok: false,
      bloqueado: Boolean(ultimoErro?.bloqueiaLead),
    });
    throw ultimoErro;
  },
};
