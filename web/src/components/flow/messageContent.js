// Espelho do src/messageContent.js do backend, com o mínimo que a interface
// precisa. São dois processos separados (Node e navegador) sem código
// compartilhado no projeto — os limites vivem aqui e lá, e mudar um sem o
// outro faz a tela aceitar o que o envio recusa.
export const LIMITE_TEXTO = 2000;
export const MAX_BOTOES = 3;
export const MAX_RESPOSTAS_RAPIDAS = 13;

// Aceita o formato antigo (config.text) e devolve sempre a lista de partes.
export function normalizarPartes(config = {}) {
  if (Array.isArray(config.parts) && config.parts.length) return config.parts;
  if (config.text) return [{ type: 'texto', text: config.text }];
  return [];
}

export function resumirConteudo(config = {}) {
  const partes = normalizarPartes(config);
  if (!partes.length) return 'sem conteúdo';

  const texto = partes.find((p) => p.type === 'texto')?.text;
  const extras = [];
  const midias = partes.filter((p) => p.type !== 'texto').length;
  if (midias) extras.push(`${midias} mídia`);
  if (config.buttons?.length) extras.push(`${config.buttons.length} botão(ões)`);
  if (config.quickReplies?.length) extras.push(`${config.quickReplies.length} resp. rápida(s)`);

  const base = texto || partes[0].type;
  return extras.length ? `${base} · ${extras.join(' · ')}` : base;
}
