// Node "tag": adiciona uma tag ao lead e segue direto para o próximo node.

export async function execute(execution, node, { leads }) {
  await leads.addTag(execution.lead_id, node.config.tag_name);
  return { nextNodeId: node.next_node_id, status: 'running' };
}
