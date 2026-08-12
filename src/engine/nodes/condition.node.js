// Node "condition": ramifica com base em uma tag do lead.

export async function execute(execution, node, { leads }) {
  const hasTag = await leads.hasTag(execution.lead_id, node.config.tag_to_check);
  const nextNodeId = hasTag
    ? node.config.true_branch_node_id
    : node.config.false_branch_node_id;
  return { nextNodeId, status: 'running' };
}
