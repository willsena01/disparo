import { pool } from './db/pool.js';

// Todo comentário que chega pelo webhook é registrado, tendo casado keyword
// ou não — é a base da tela de Comentários e da taxa de conversão
// comentário -> lead nos relatórios.

// Insere o comentário e devolve a linha. Se o comment_id já existir, devolve
// null: a Meta reentrega o mesmo evento quando não recebe 200 rápido, e é esse
// null que impede o fluxo de disparar duas vezes pra mesma pessoa.
export async function claimComment(comment) {
  const { rows } = await pool.query(
    `INSERT INTO comments
       (workspace_id, page_id, post_id, comment_id, commenter_psid, commenter_name, comment_text)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (comment_id) WHERE comment_id IS NOT NULL DO NOTHING
     RETURNING *`,
    [
      comment.workspace_id ?? null,
      comment.page_id,
      comment.post_id ?? null,
      comment.comment_id ?? null,
      comment.commenter_psid ?? null,
      comment.commenter_name ?? null,
      comment.text ?? null,
    ]
  );
  return rows[0] ?? null;
}

// Preenche o que só se sabe depois do match: qual regra casou, qual lead
// nasceu dela, qual fluxo foi disparado e o que de fato foi respondido.
//
// Os carimbos de resposta pública e privada são separados porque as duas podem
// falhar de forma independente — e "respondi no comentário mas a DM não saiu"
// é uma situação que precisa aparecer na tela, não sumir num booleano.
export async function attachMatch(commentRowId, {
  matchedKeyword, leadId, flowId, ruleId,
  respondeuPublico, respondeuPrivado, erro,
} = {}) {
  await pool.query(
    `UPDATE comments
     SET matched_keyword    = $2,
         lead_id            = $3,
         flow_id            = $4,
         rule_id            = $5,
         public_replied_at  = CASE WHEN $6::boolean THEN now() ELSE public_replied_at END,
         private_replied_at = CASE WHEN $7::boolean THEN now() ELSE private_replied_at END,
         reply_error        = $8,
         replied_at         = now()
     WHERE id = $1`,
    [
      commentRowId, matchedKeyword ?? null, leadId ?? null, flowId ?? null, ruleId ?? null,
      Boolean(respondeuPublico), Boolean(respondeuPrivado), erro ?? null,
    ]
  );
}
