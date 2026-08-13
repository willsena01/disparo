import { processExecution, WORKER_ID, LEASE_MS } from './engine/engine.js';
import { createExecution } from './engine/flowExecutionRepository.js';
import { leads } from './leads.js';
import { getPageByPageId } from './pages.js';
import { claimComment, attachMatch } from './comments.js';
import { matchRule, responderPublicamente } from './commentRules.js';
import { messenger } from './messenger.js';
import { interpolar, contextoDoLead } from './variables.js';
import { explicarErroDaMeta } from './grafoErros.js';

// Extrai os comentários novos de um payload de webhook do Facebook.
//
// O payload chega como entry[].changes[], onde cada change tem field e value.
// Interessa só field 'feed' com item 'comment' e verb 'add' — edição, remoção,
// like e post não disparam fluxo.
export function extractComments(body) {
  const out = [];

  for (const entry of body?.entry ?? []) {
    const pageId = String(entry.id);

    for (const change of entry.changes ?? []) {
      if (change.field !== 'feed') continue;

      const value = change.value ?? {};
      if (value.item !== 'comment' || value.verb !== 'add') continue;

      const fromId = value.from?.id ? String(value.from.id) : null;
      // A própria página comentando (resposta do admin) não pode virar lead —
      // sem isso o fluxo dispararia contra a página em cima da própria resposta.
      if (!fromId || fromId === pageId) continue;

      out.push({
        page_id: pageId,
        post_id: value.post_id ?? value.parent_id ?? null,
        comment_id: value.comment_id ? String(value.comment_id) : null,
        commenter_psid: fromId,
        commenter_name: value.from?.name ?? null,
        text: value.message ?? '',
      });
    }
  }

  return out;
}

// Ciclo completo de um comentário: registra -> casa keyword -> cria lead ->
// cria a execução já travada pra este processo -> roda o fluxo inline.
//
// A execução nasce com o lease deste worker justamente pra o poller não pegar
// a mesma linha no mesmo instante — a resposta ao comentário sai agora, não no
// próximo tick.
export async function onCommentReceived(comment) {
  const page = await getPageByPageId(comment.page_id);
  const workspaceId = page?.workspace_id ?? null;

  // Primeiro passo é registrar: o INSERT com ON CONFLICT é a trava contra a
  // reentrega da Meta. null aqui significa "esse comment_id já foi tratado".
  const row = await claimComment({ ...comment, workspace_id: workspaceId });
  if (!row) return { status: 'duplicate' };

  const regra = await matchRule(comment.page_id, comment.post_id, comment.text);
  if (!regra) return { status: 'no_match', commentRowId: row.id };

  // findOrCreateLead já carimba last_interaction_at (o comentário É a
  // interação), tanto na criação quanto no reencontro do lead.
  const lead = await leads.findOrCreateLead(comment.commenter_psid, comment.page_id, {
    name: comment.commenter_name,
    workspaceId,
    source: 'comment',
  });

  const erros = [];
  let respondeuPublico = false;
  let respondeuPrivado = false;
  let executionId = null;

  // 1. Resposta pública no próprio comentário.
  //
  // Vem primeiro e num try isolado: ela é visível pra quem passa pelo post, e
  // uma falha na DM não pode impedi-la (nem o contrário).
  if (regra.public_reply_text && comment.comment_id) {
    // A resposta pública não passa pelo canal, então interpola aqui. O nome vem
    // do lead que acabou de ser criado/reencontrado a partir do comentário.
    const texto = interpolar(
      regra.public_reply_text,
      contextoDoLead(lead, {
        pageName: (await getPageByPageId(comment.page_id))?.name,
        keyword: regra.keyword || null,
        comment: comment.text,
      })
    );
    const r = await responderPublicamente(comment.page_id, comment.comment_id, texto);
    respondeuPublico = r.ok;
    if (!r.ok) erros.push(`resposta pública: ${r.erro}`);
  }

  // 2. O que vai na DM: o fluxo, quando houver, senão o texto da regra.
  //
  // Com fluxo configurado o texto privado é ignorado de propósito — mandar os
  // dois faria a pessoa receber duas mensagens seguidas dizendo a mesma coisa.
  // comment_text entra aqui porque o contexto da execução é o que alimenta
  // {{keyword}} e {{comment}} lá no envio — sem ele a variável sairia vazia.
  const ctxDoComentario = {
    comment_id: comment.comment_id,
    post_id: comment.post_id,
    matched_keyword: regra.keyword || null,
    comment_text: comment.text ?? null,
    rule_id: regra.id,
  };

  if (regra.flow_id) {
    // start_node_id permite entrar no meio do fluxo — pular a saudação e cair
    // direto na oferta, por exemplo.
    const primeiroNo = regra.start_node_id || regra.first_node_id;
    const execution = await createExecution(
      regra.flow_id, lead.id, primeiroNo,
      { workerId: WORKER_ID, leaseMs: LEASE_MS },
      { workspaceId, context: ctxDoComentario }
    );
    executionId = execution.id;
    await processExecution(execution);
    respondeuPrivado = true;
  } else if (regra.private_reply_text) {
    try {
      await messenger.send(lead, regra.private_reply_text, null, {
        commentId: comment.comment_id,
        ...ctxDoComentario,
      });
      respondeuPrivado = true;
    } catch (err) {
      erros.push(`DM: ${explicarErroDaMeta(err.message)}`);
    }
  }

  await attachMatch(row.id, {
    matchedKeyword: regra.keyword || null,
    leadId: lead.id,
    flowId: regra.flow_id,
    ruleId: regra.id,
    respondeuPublico,
    respondeuPrivado,
    erro: erros.length ? erros.join(' · ') : null,
  });

  return {
    status: executionId ? 'started' : 'replied',
    executionId,
    leadId: lead.id,
    respondeuPublico,
    respondeuPrivado,
    erros,
  };
}

// Processa um payload inteiro. Erro em um comentário não derruba os outros do
// mesmo lote — a Meta manda vários eventos por request.
export async function handleWebhookPayload(body) {
  const comments = extractComments(body);

  for (const comment of comments) {
    try {
      const result = await onCommentReceived(comment);
      console.log(
        `[webhook] comentário ${comment.comment_id ?? '(sem id)'} da página ${comment.page_id}: ${result.status}`
      );
    } catch (err) {
      console.error(`[webhook] falha no comentário ${comment.comment_id}:`, err);
    }
  }

  return comments.length;
}
