import { resumirConteudo } from './messageContent.js';

// Definição dos quatro tipos de bloco: como aparecem no canvas, o que vai no
// config e como cada um se conecta ao próximo.
//
// Fica num só lugar porque a paleta, o canvas, o painel de configuração e o
// validador do backend precisam concordar — três listas separadas divergem.

export const TIPOS = {
  message: {
    rotulo: 'Mensagem',
    descricao: 'Texto, mídia, botões e respostas rápidas',
    cor: 'var(--accent)',
    saidas: ['next'],
    configPadrao: () => ({ parts: [{ type: 'texto', text: '' }], buttons: [], quickReplies: [] }),
    resumo: (c) => resumirConteudo(c),
  },
  wait: {
    rotulo: 'Espera',
    descricao: 'Pausa antes do próximo bloco',
    cor: '#b45309',
    saidas: ['next'],
    configPadrao: () => ({ duration_seconds: 3600 }),
    resumo: (c) => formatarDuracao(c.duration_seconds),
  },
  tag: {
    rotulo: 'Aplicar tag',
    descricao: 'Marca o lead com uma etapa do funil',
    cor: '#16a34a',
    saidas: ['next'],
    configPadrao: () => ({ tag_name: '', step_order: null }),
    resumo: (c) => (c.tag_name ? `“${c.tag_name}”` : 'sem tag'),
  },
  condition: {
    rotulo: 'Condição',
    descricao: 'Ramifica conforme o lead ter ou não uma tag',
    cor: '#7c3aed',
    // A condição não usa next_node_id: quem decide o caminho são os dois
    // ramos, e ter os três ponteiros deixaria ambíguo qual vale.
    saidas: ['true', 'false'],
    configPadrao: () => ({ tag_to_check: '', true_branch_node_id: null, false_branch_node_id: null }),
    resumo: (c) => (c.tag_to_check ? `tem “${c.tag_to_check}”?` : 'sem tag'),
  },
};

export const ORDEM_DA_PALETA = ['message', 'wait', 'tag', 'condition'];

export function formatarDuracao(segundos) {
  const s = Number(segundos) || 0;
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s < 86400) return `${+(s / 3600).toFixed(1).replace('.0', '')}h`;
  return `${+(s / 86400).toFixed(1).replace('.0', '')} dias`;
}

// Onde cada saída aponta hoje.
export function destinoDaSaida(node, saida) {
  if (saida === 'next') return node.next_node_id ?? null;
  if (saida === 'true') return node.config?.true_branch_node_id ?? null;
  return node.config?.false_branch_node_id ?? null;
}

// Devolve o nó com a saída apontando pra outro bloco (imutável).
export function comDestino(node, saida, alvo) {
  if (saida === 'next') return { ...node, next_node_id: alvo };
  const chave = saida === 'true' ? 'true_branch_node_id' : 'false_branch_node_id';
  return { ...node, config: { ...node.config, [chave]: alvo } };
}

export const ROTULO_DA_SAIDA = { next: '', true: 'sim', false: 'não' };

let contador = 0;
export function novoId() {
  contador += 1;
  return `n${Date.now().toString(36)}${contador}`;
}
