import * as messageNode from './message.node.js';
import * as waitNode from './wait.node.js';
import * as tagNode from './tag.node.js';
import * as conditionNode from './condition.node.js';

// Registro de handlers por tipo de node.
// Cada handler exporta:
//   - execute(execution, node, deps): chamado na entrada do node
//   - resume(execution, node, deps): opcional, chamado quando uma execução
//     'waiting' desse node tem seu resume_at vencido. Se ausente, o executor
//     usa um default que só avança pro node.next_node_id.
// Ambos retornam { nextNodeId, status, resumeAt?, context? }
export const nodeHandlers = {
  message: messageNode,
  wait: waitNode,
  tag: tagNode,
  condition: conditionNode,
};

export function getHandler(type) {
  const handler = nodeHandlers[type];
  if (!handler) {
    throw new Error(`Nenhum handler registrado para o tipo de node "${type}"`);
  }
  return handler;
}
