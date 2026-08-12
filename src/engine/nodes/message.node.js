// Node "message": envia o conteúdo do bloco (texto, imagem, áudio, vídeo,
// botões e respostas rápidas) e segue direto para o próximo node.

export async function execute(execution, node, { messenger, lead }) {
  // O canal precisa do contexto da execução: o comment_id (gravado pelo
  // webhook) é o que permite a primeira mensagem a quem só comentou, e o id
  // da execução amarra o envio ao fluxo no relatório.
  //
  // sendRich recebe o config inteiro em vez de texto+botões: o bloco pode ter
  // várias partes, e quem sabe traduzir isso pra Send API é src/messageContent.js.
  await messenger.sendRich(lead, node.config, {
    commentId: execution.context_json?.comment_id,
    executionId: execution.id,
  });

  return {
    nextNodeId: node.next_node_id,
    status: 'running',
  };
}
