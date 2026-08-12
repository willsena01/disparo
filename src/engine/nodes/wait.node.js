// Node "wait": pausa a execução por node.config.duration_seconds.
// Não define nextNodeId aqui — quando o resume_at vence, o executor retoma
// a execução via handler.resume (ou, na ausência dele, avança direto pro
// node.next_node_id — ver defaultResume em executor.js).

export async function execute(execution, node) {
  const resumeAt = new Date(Date.now() + node.config.duration_seconds * 1000);
  return {
    status: 'waiting',
    resumeAt,
  };
}
