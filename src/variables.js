// Variáveis de personalização: {{first_name}} e companhia.
//
// O texto que o operador escreve no editor é um MOLDE. Quem resolve o molde é
// o canal, no momento do envio, porque só ali existe o lead concreto — o mesmo
// bloco vira uma mensagem diferente para cada pessoa.
//
// Sintaxe: {{chave}} ou {{chave|texto de reserva}}.
//
// O texto de reserva não é enredo: leads que vêm de comentário nem sempre
// trazem nome (o Facebook às vezes não expõe), e "Olá !" é pior do que não
// personalizar. Quem escreve {{first_name|amigo}} nunca manda uma saudação
// quebrada.

// Catálogo. É daqui que a tela monta o menu de inserir variável e que a
// validação sabe o que é chave conhecida — lista única, sem duplicar no front.
export const VARIAVEIS = [
  { chave: 'first_name', rotulo: 'Primeiro nome', exemplo: 'Ana' },
  { chave: 'last_name', rotulo: 'Sobrenome', exemplo: 'Souza' },
  { chave: 'full_name', rotulo: 'Nome completo', exemplo: 'Ana Souza' },
  { chave: 'page_name', rotulo: 'Nome da página', exemplo: 'Minha Página' },
  { chave: 'keyword', rotulo: 'Palavra-chave que disparou', exemplo: 'QUERO' },
  { chave: 'comment', rotulo: 'Texto do comentário', exemplo: 'quero saber mais' },
];

export const CHAVES = VARIAVEIS.map((v) => v.chave);

// {{ chave | reserva }} — espaços à vontade, reserva opcional.
// A reserva vai até o }} e pode conter espaço, mas não outra chave.
const PADRAO = /\{\{\s*([a-z_][a-z0-9_]*)\s*(?:\|([^}]*))?\}\}/gi;

// Primeiro nome = primeira palavra; sobrenome = o resto. Nome de perfil do
// Facebook não tem estrutura garantida, então dividir no primeiro espaço é o
// mais previsível — e é o que o operador espera ao ver "primeiro nome".
function partirNome(nome) {
  const limpo = (nome ?? '').trim().replace(/\s+/g, ' ');
  if (!limpo) return { primeiro: '', ultimo: '', completo: '' };
  const [primeiro, ...resto] = limpo.split(' ');
  return { primeiro, ultimo: resto.join(' '), completo: limpo };
}

// Monta os valores a partir do lead e do que o disparo souber a mais.
// `extras` cobre o que não vive no lead: nome da página e o comentário que
// originou o envio.
export function contextoDoLead(lead, extras = {}) {
  const { primeiro, ultimo, completo } = partirNome(lead?.name);
  return {
    first_name: primeiro,
    last_name: ultimo,
    full_name: completo,
    page_name: extras.pageName ?? '',
    keyword: extras.keyword ?? '',
    comment: extras.comment ?? '',
  };
}

// Substitui as variáveis de um texto.
//
// Chave desconhecida fica INTACTA de propósito. Apagar silenciosamente faria
// um erro de digitação virar uma frase truncada que ninguém rastreia; deixando
// visível, o operador vê o problema no teste do fluxo. A validação do editor
// pega antes disso.
export function interpolar(texto, contexto = {}) {
  if (typeof texto !== 'string' || !texto.includes('{{')) return texto;

  return texto.replace(PADRAO, (original, chave, reserva) => {
    const nome = chave.toLowerCase();
    if (!(nome in contexto)) return original;

    const valor = contexto[nome];
    if (valor != null && String(valor).trim() !== '') return String(valor);
    return reserva != null ? reserva.trim() : '';
  });
}

// Chaves usadas num texto que não existem no catálogo. Alimenta a validação
// do editor, que é onde o erro ainda é barato de corrigir.
export function variaveisDesconhecidas(texto) {
  if (typeof texto !== 'string') return [];
  const achadas = [...texto.matchAll(PADRAO)].map((m) => m[1].toLowerCase());
  return [...new Set(achadas.filter((c) => !CHAVES.includes(c)))];
}

// Aplica a interpolação no config inteiro de um bloco: partes de texto,
// títulos de botão e de resposta rápida.
//
// URL de botão fica de fora: ela passa pelo rastreador de cliques e vira um
// link da ferramenta antes de sair, então variável ali não teria efeito no
// destino final — prometer isso seria mentira.
export function interpolarConteudo(config = {}, contexto = {}) {
  const texto = (t) => interpolar(t, contexto);

  return {
    ...config,
    text: config.text != null ? texto(config.text) : config.text,
    parts: (config.parts ?? []).map((p) =>
      p?.type === 'texto' ? { ...p, text: texto(p.text) } : p
    ),
    buttons: (config.buttons ?? []).map((b) => ({ ...b, title: texto(b?.title) })),
    quickReplies: (config.quickReplies ?? []).map((q) => ({ ...q, title: texto(q?.title) })),
  };
}
