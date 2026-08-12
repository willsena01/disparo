import { useRef, useState } from 'react';
import { LIMITE_TEXTO, MAX_BOTOES, MAX_RESPOSTAS_RAPIDAS, normalizarPartes } from './messageContent.js';
import InserirVariavel, { inserirNoCampo } from '../InserirVariavel.jsx';

// Editor do bloco de mensagem: uma lista de partes (texto, imagem, áudio,
// vídeo) que saem em sequência, mais os elementos interativos.
//
// Cada parte tem ↑ ↓ ✕ porque a ORDEM importa — é a ordem em que a pessoa
// recebe as mensagens.
export default function MessageBlockEditor({ titulo, config, onChange, onDuplicar, onExcluir }) {
  const partes = normalizarPartes(config);
  const botoes = config.buttons ?? [];
  const respostas = config.quickReplies ?? [];

  // Toda mutação é funcional: fechar sobre `config` faria duas interações
  // seguidas (antes do re-render) uma sobrescrever a outra — adicionar um link
  // e uma resposta rápida em sequência perdia o link.
  const set = (patch) => onChange((c) => ({ ...c, ...patch }));
  const setPartes = (fn) =>
    onChange((c) => ({ ...c, parts: fn(normalizarPartes(c)), text: undefined }));

  function adicionar(tipo) {
    setPartes((atuais) => [
      ...atuais,
      tipo === 'texto' ? { type: 'texto', text: '' } : { type: tipo, url: '' },
    ]);
  }
  function alterar(i, patch) {
    setPartes((atuais) => atuais.map((p, k) => (k === i ? { ...p, ...patch } : p)));
  }
  function remover(i) {
    setPartes((atuais) => atuais.filter((_, k) => k !== i));
  }
  const adicionarBotao = (novo) =>
    onChange((c) => ({ ...c, buttons: [...(c.buttons ?? []), novo] }));
  const adicionarRapida = () =>
    onChange((c) => ({ ...c, quickReplies: [...(c.quickReplies ?? []), { title: '' }] }));
  // Um textarea por parte de texto — a inserção precisa saber em qual campo
  // está o cursor.
  const camposDeTexto = useRef({});
  function inserirVariavel(i, token) {
    const el = camposDeTexto.current[i];
    alterar(i, { text: inserirNoCampo(el, partes[i]?.text, token, LIMITE_TEXTO) });
  }

  function mover(i, delta) {
    setPartes((atuais) => {
      const alvo = i + delta;
      if (alvo < 0 || alvo >= atuais.length) return atuais;
      const novas = [...atuais];
      [novas[i], novas[alvo]] = [novas[alvo], novas[i]];
      return novas;
    });
  }

  return (
    <div className="bloco-editor">
      <header className="be-head">
        <span className="be-arrasta" aria-hidden="true">⠿</span>
        <span className="be-icone" aria-hidden="true"><IconBalao /></span>
        <span className="be-titulo">{titulo}</span>
        <button type="button" className="be-acao" onClick={onDuplicar} title="Duplicar bloco" aria-label="Duplicar bloco">
          <IconCopiar />
        </button>
        <button type="button" className="be-acao" onClick={onExcluir} title="Excluir bloco" aria-label="Excluir bloco">
          <IconLixeira />
        </button>
      </header>

      <div className="be-corpo">
        {!partes.length && (
          <p className="be-vazio">Escolha abaixo o que este bloco envia.</p>
        )}

        {partes.map((parte, i) => (
          <div className="parte" key={i}>
            <div className="parte-head">
              <span className="parte-tipo">
                {ICONES[parte.type]} {ROTULOS[parte.type]}
              </span>
              <button type="button" className="parte-acao" onClick={() => mover(i, -1)} disabled={i === 0} aria-label="Mover para cima">↑</button>
              <button type="button" className="parte-acao" onClick={() => mover(i, 1)} disabled={i === partes.length - 1} aria-label="Mover para baixo">↓</button>
              <button type="button" className="parte-acao" onClick={() => remover(i)} aria-label="Remover">✕</button>
            </div>

            {parte.type === 'texto' ? (
              <>
                <textarea
                  ref={(el) => { camposDeTexto.current[i] = el; }}
                  className="textarea parte-texto"
                  value={parte.text ?? ''}
                  maxLength={LIMITE_TEXTO}
                  onChange={(e) => alterar(i, { text: e.target.value })}
                  placeholder="Escreva a mensagem…"
                />
                {/* O limite é da Send API, não escolha nossa: acima disso a
                    mensagem inteira é recusada. */}
                <span className="parte-contador tabular">
                  {(parte.text ?? '').length}/{LIMITE_TEXTO.toLocaleString('pt-BR')}
                </span>
                <InserirVariavel onInserir={(token) => inserirVariavel(i, token)} />
              </>
            ) : (
              <CampoDeMidia
                tipo={parte.type}
                parte={parte}
                onChange={(patch) => alterar(i, patch)}
              />
            )}
          </div>
        ))}

        <div className="be-adicionar">
          {['texto', 'imagem', 'audio', 'video'].map((t) => (
            <button type="button" key={t} className="btn btn-sm" onClick={() => adicionar(t)}>
              {ICONES[t]} {ROTULOS[t]}
            </button>
          ))}
        </div>

        <div className="be-interativos">
          <button
            type="button" className="btn btn-sm btn-dark"
            disabled={botoes.length >= MAX_BOTOES}
            onClick={() => adicionarBotao({ title: '', payload: '' })}
          >
            <IconBotao /> Botão
          </button>
          <button
            type="button" className="btn btn-sm chip-link"
            disabled={botoes.length >= MAX_BOTOES}
            onClick={() => adicionarBotao({ title: '', url: '' })}
          >
            <IconLink /> Link
          </button>
          <button
            type="button" className="btn btn-sm chip-rapida"
            disabled={respostas.length >= MAX_RESPOSTAS_RAPIDAS}
            onClick={adicionarRapida}
          >
            <IconBalao /> Resposta rápida
          </button>
        </div>

        {botoes.length > 0 && (
          <Interativos
            titulo={`Botões (${botoes.length}/${MAX_BOTOES})`}
            dica="Aparecem presos à última mensagem de texto do bloco — é o que a Send API permite. O link é reescrito no envio para medir cliques."
            itens={botoes}
            onChange={(v) => set({ buttons: v })}
            comUrl
          />
        )}

        {respostas.length > 0 && (
          <Interativos
            titulo={`Respostas rápidas (${respostas.length}/${MAX_RESPOSTAS_RAPIDAS})`}
            dica="Aparecem como sugestões acima do teclado e somem depois que a pessoa toca numa delas."
            itens={respostas}
            onChange={(v) => set({ quickReplies: v })}
            limiteTitulo={20}
          />
        )}
      </div>

      <footer className="be-pe">CONTINUA →</footer>

      <style>{estilo}</style>
    </div>
  );
}

const ACEITA = { imagem: 'image/*', audio: 'audio/*', video: 'video/*' };

// Campo de mídia: o operador escolhe o arquivo do computador e a ferramenta
// hospeda, devolvendo a URL. A Meta não recebe o arquivo — ela BUSCA numa URL
// pública, então o upload existe justamente pra produzir essa URL.
//
// O campo de URL continua disponível para quem já hospeda o arquivo em outro
// lugar (CDN própria, por exemplo).
function CampoDeMidia({ tipo, parte, onChange }) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(null);
  const inputRef = useRef(null);

  async function enviar(arquivo) {
    if (!arquivo) return;
    setEnviando(true);
    setErro(null);
    try {
      const corpo = new FormData();
      corpo.append('arquivo', arquivo);
      const res = await fetch(`/api/uploads?tipo=${tipo}`, { method: 'POST', body: corpo });
      const dados = await res.json();
      if (!res.ok) throw new Error(dados.error || `Erro ${res.status}`);
      onChange({ url: dados.url, nome: dados.nome });
    } catch (err) {
      setErro(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="midia">
      {parte.url ? (
        <div className="midia-pronta">
          {tipo === 'imagem' && <img className="midia-preview" src={parte.url} alt="" />}
          <span className="midia-nome" title={parte.url}>{parte.nome ?? parte.url}</span>
          <button type="button" className="parte-acao" onClick={() => onChange({ url: '', nome: null })} aria-label="Trocar arquivo">
            Trocar
          </button>
        </div>
      ) : (
        <>
          <button
            type="button" className="btn btn-sm midia-botao"
            onClick={() => inputRef.current?.click()} disabled={enviando}
          >
            {enviando ? 'Enviando…' : `Escolher ${ROTULOS[tipo].toLowerCase()} do computador`}
          </button>
          <input
            ref={inputRef} type="file" accept={ACEITA[tipo]} hidden
            onChange={(e) => { enviar(e.target.files?.[0]); e.target.value = ''; }}
          />
          <details className="midia-url">
            <summary>ou usar um link</summary>
            <input
              className="input" value={parte.url ?? ''}
              onChange={(e) => onChange({ url: e.target.value })}
              placeholder="https://… (URL pública do arquivo)"
            />
          </details>
        </>
      )}

      {erro && <span className="midia-erro">{erro}</span>}

      <style>{`
        .midia { display: flex; flex-direction: column; gap: 6px; }
        .midia-botao { justify-content: center; }
        .midia-pronta { display: flex; align-items: center; gap: 8px; }
        .midia-preview { width: 40px; height: 40px; border-radius: 6px; object-fit: cover; flex: none; }
        .midia-nome {
          flex: 1; min-width: 0; font-size: 12px; color: var(--muted);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .midia-url summary { font-size: 11.5px; color: var(--muted-2); cursor: pointer; }
        .midia-url .input { margin-top: 6px; }
        .midia-erro { font-size: 11.5px; color: var(--danger); line-height: 1.4; }
      `}</style>
    </div>
  );
}

function Interativos({ titulo, dica, itens, onChange, comUrl, limiteTitulo }) {
  return (
    <div className="interativos">
      <span className="interativos-titulo">{titulo}</span>
      {itens.map((item, i) => (
        <div className={`interativo-linha${comUrl && item.url !== undefined ? ' com-url' : ''}`} key={i}>
          <input
            className="input" placeholder="Título" value={item.title ?? ''}
            maxLength={limiteTitulo}
            onChange={(e) => onChange(itens.map((x, k) => (k === i ? { ...x, title: e.target.value } : x)))}
          />
          {comUrl && item.url !== undefined && (
            <input
              className="input" placeholder="https://…" value={item.url ?? ''}
              onChange={(e) => onChange(itens.map((x, k) => (k === i ? { ...x, url: e.target.value } : x)))}
            />
          )}
          <button
            type="button" className="parte-acao"
            onClick={() => onChange(itens.filter((_, k) => k !== i))}
            aria-label="Remover"
          >✕</button>
        </div>
      ))}
      <span className="parte-dica">{dica}</span>
      <style>{`
        .interativos { display: flex; flex-direction: column; gap: 6px; }
        .interativos-titulo { font-size: 12px; color: var(--muted); }
        .interativo-linha { display: grid; grid-template-columns: 1fr auto; gap: 6px; }
        .interativo-linha.com-url { grid-template-columns: 1fr 1.3fr auto; }
      `}</style>
    </div>
  );
}

const ROTULOS = { texto: 'Texto', imagem: 'Imagem', audio: 'Áudio', video: 'Vídeo' };

const Svg = ({ children, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

const IconTexto = () => <Svg><path d="M5 6h14M12 6v12M9 18h6" /></Svg>;
const IconImagem = () => (
  <Svg><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="M21 16l-5-5-8 8" /></Svg>
);
const IconAudio = () => <Svg><path d="M9 18V5l10-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="16" cy="16" r="3" /></Svg>;
const IconVideo = () => <Svg><rect x="2" y="6" width="14" height="12" rx="2" /><path d="M16 10l6-3v10l-6-3" /></Svg>;
const IconBalao = () => <Svg><path d="M4 5h16v11H9l-5 4V5z" /></Svg>;
const IconCopiar = () => <Svg><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h8" /></Svg>;
const IconLixeira = () => <Svg><path d="M4 7h16" /><path d="M9 7V5h6v2" /><path d="M6 7l1 13h10l1-13" /></Svg>;
const IconBotao = () => <Svg><rect x="3" y="8" width="18" height="8" rx="3" /><path d="M12 12h.01" /></Svg>;
const IconLink = () => <Svg><path d="M9 15l6-6" /><path d="M11 5l1-1a4 4 0 0 1 5.7 5.7l-2 2" /><path d="M13 19l-1 1a4 4 0 0 1-5.7-5.7l2-2" /></Svg>;

const ICONES = {
  texto: <IconTexto />, imagem: <IconImagem />, audio: <IconAudio />, video: <IconVideo />,
};

const estilo = `
  .bloco-editor {
    border: 1px solid var(--border); border-radius: 12px; background: var(--surface);
    display: flex; flex-direction: column; overflow: hidden;
  }
  .be-head {
    display: flex; align-items: center; gap: 8px;
    padding: 9px 11px; border-bottom: 1px solid var(--border);
  }
  .be-arrasta { color: var(--muted-2); font-size: 13px; letter-spacing: -1px; }
  .be-icone { color: var(--muted); display: inline-flex; }
  .be-titulo { flex: 1; font-size: 13px; font-weight: 600; }
  .be-acao {
    border: none; background: transparent; color: var(--muted-2);
    padding: 4px; border-radius: 6px; display: inline-flex;
  }
  .be-acao:hover { background: var(--surface-2); color: var(--ink); }
  .be-corpo { padding: 12px; display: flex; flex-direction: column; gap: 12px; }
  .be-vazio { font-size: 12.5px; color: var(--muted-2); }
  .parte {
    border: 1px solid var(--border); border-radius: 9px; padding: 9px 10px;
    display: flex; flex-direction: column; gap: 6px; background: var(--surface);
  }
  .parte-head { display: flex; align-items: center; gap: 4px; }
  .parte-tipo {
    flex: 1; display: inline-flex; align-items: center; gap: 6px;
    font-size: 11px; font-weight: 600; letter-spacing: 0.04em;
    color: var(--muted); text-transform: uppercase;
  }
  .parte-acao {
    border: none; background: transparent; color: var(--muted-2);
    font-size: 12px; line-height: 1; padding: 4px 5px; border-radius: 5px;
  }
  .parte-acao:hover:not(:disabled) { background: var(--surface-2); color: var(--ink); }
  .parte-acao:disabled { opacity: 0.3; cursor: default; }
  .parte-texto { min-height: 120px; border-color: var(--border); }
  .parte-contador { align-self: flex-end; font-size: 11px; color: var(--muted-2); }
  .parte-dica { font-size: 11px; color: var(--muted-2); line-height: 1.4; }
  .be-adicionar, .be-interativos { display: flex; gap: 6px; flex-wrap: wrap; }
  .chip-link { color: var(--accent-ink); background: var(--accent-soft); border-color: var(--accent-soft); }
  .chip-rapida { color: var(--success); background: var(--success-soft); border-color: var(--success-soft); }
  .be-pe {
    padding: 7px 12px; border-top: 1px solid var(--border);
    font-size: 10.5px; letter-spacing: 0.08em; color: var(--muted-2);
  }
`;
