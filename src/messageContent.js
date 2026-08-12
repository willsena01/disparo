// Conteúdo de um bloco de mensagem.
//
// Um bloco não é mais "um texto com botões": é uma LISTA de partes (texto,
// imagem, áudio, vídeo) que saem em sequência, mais os elementos interativos
// (botão, link, resposta rápida) que se prendem à última parte.
//
// Este módulo é o único lugar que sabe traduzir o config do editor para o que
// a Send API aceita — o node handler e o canal só consomem o resultado.

export const TIPOS_DE_PARTE = ['texto', 'imagem', 'audio', 'video'];

// Limite de caracteres de uma mensagem de texto na Send API.
export const LIMITE_TEXTO = 2000;

// A Meta aceita no máximo 3 botões num template de botões e 13 respostas
// rápidas. Passar disso faz a mensagem inteira ser recusada.
export const MAX_BOTOES = 3;
export const MAX_RESPOSTAS_RAPIDAS = 13;

// Aceita tanto o formato novo (config.parts) quanto o antigo (config.text +
// config.buttons). Fluxos criados antes do editor de partes continuam
// funcionando sem migração de dados.
export function normalizarConteudo(config = {}) {
  const partes = Array.isArray(config.parts) && config.parts.length
    ? config.parts
    : config.text
      ? [{ type: 'texto', text: config.text }]
      : [];

  const botoes = (config.buttons ?? []).filter((b) => b?.title);
  const respostasRapidas = (config.quickReplies ?? []).filter((q) => q?.title);

  return {
    partes: partes.filter((p) => (p.type === 'texto' ? p.text?.trim() : p.url?.trim())),
    botoes: botoes.slice(0, MAX_BOTOES),
    respostasRapidas: respostasRapidas.slice(0, MAX_RESPOSTAS_RAPIDAS),
  };
}

function anexo(tipo, url) {
  const mapa = { imagem: 'image', audio: 'audio', video: 'video' };
  return { attachment: { type: mapa[tipo], payload: { url, is_reusable: true } } };
}

function templateDeBotoes(texto, botoes) {
  return {
    attachment: {
      type: 'template',
      payload: {
        template_type: 'button',
        text: texto,
        buttons: botoes.map((b) =>
          b.url
            ? { type: 'web_url', url: b.url, title: b.title }
            : { type: 'postback', title: b.title, payload: b.payload ?? b.title }
        ),
      },
    },
  };
}

// Converte o conteúdo em N mensagens prontas pra Send API.
//
// Regras que vêm da própria API, não de escolha nossa:
//  - botão/link exigem template de texto, então se prendem à ÚLTIMA parte de
//    texto; anexo não aceita botão junto.
//  - resposta rápida se prende à ÚLTIMA mensagem do bloco, seja ela qual for.
export function montarMensagens(config, { rastrearBotoes } = {}) {
  const { partes, botoes, respostasRapidas } = normalizarConteudo(config);
  if (!partes.length) return [];

  const indiceUltimoTexto = partes.map((p) => p.type).lastIndexOf('texto');

  return partes.map((parte, i) => {
    let msg;

    if (parte.type === 'texto') {
      const texto = parte.text.slice(0, LIMITE_TEXTO);
      msg = (botoes.length && i === indiceUltimoTexto)
        ? templateDeBotoes(texto, rastrearBotoes ? rastrearBotoes(botoes) : botoes)
        : { text: texto };
    } else {
      msg = anexo(parte.type, parte.url);
    }

    if (respostasRapidas.length && i === partes.length - 1) {
      msg.quick_replies = respostasRapidas.map((q) => ({
        content_type: 'text',
        title: q.title.slice(0, 20),
        payload: q.payload ?? q.title,
      }));
    }

    return msg;
  });
}

// Resumo legível de um bloco — usado no canvas e no seletor "começar na etapa".
export function resumirConteudo(config = {}) {
  const { partes, botoes, respostasRapidas } = normalizarConteudo(config);
  if (!partes.length) return 'sem conteúdo';

  const primeiroTexto = partes.find((p) => p.type === 'texto');
  const extras = [];
  const anexos = partes.filter((p) => p.type !== 'texto').length;
  if (anexos) extras.push(`${anexos} mídia`);
  if (botoes.length) extras.push(`${botoes.length} botão(ões)`);
  if (respostasRapidas.length) extras.push(`${respostasRapidas.length} resposta(s) rápida(s)`);

  const base = primeiroTexto?.text ?? `${partes[0].type}`;
  return extras.length ? `${base} · ${extras.join(' · ')}` : base;
}
