import { useState } from 'react';
import { useAsync } from '../../hooks/useAsync.js';
import { pagesApi, flowsApi } from '../../api/index.js';
import { formatarDuracao } from './nodeTypes.js';

// Painel de teste: escolhe a PÁGINA onde o fluxo vai rodar e simula o envio
// para um lead novo, mostrando a conversa como ela apareceria no Messenger.
//
// A escolha é a página, não um lead da base, de propósito: um lead existente já
// carrega tags de execuções anteriores, e a condição do fluxo se comportaria
// diferente do que acontece com quem acabou de comentar.
export default function TestPanel({ flowId, salvoRecentemente, onPassoAtual }) {
  const [pageId, setPageId] = useState('');
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState(null);
  const [rodando, setRodando] = useState(false);

  const paginas = useAsync(() => pagesApi.list(), []);
  const opcoes = [...new Map((paginas.data ?? []).map((p) => [p.pageId, p])).values()];
  const pagina = opcoes.find((p) => p.pageId === pageId);

  async function testar() {
    setRodando(true);
    setErro(null);
    setResultado(null);
    try {
      const r = await flowsApi.test(flowId, { pageId });
      setResultado(r);
      // Acende um bloco por vez no canvas, na ordem em que o fluxo passou por
      // eles — é isso que transforma a lista de passos em algo legível.
      for (const passo of r.passos) {
        onPassoAtual(passo.nodeId ?? null);
        await new Promise((res) => setTimeout(res, 420));
      }
      onPassoAtual(null);
    } catch (err) {
      setErro(err.message);
    } finally {
      setRodando(false);
    }
  }

  const pronto = Boolean(flowId && pageId && salvoRecentemente);

  return (
    <aside className="teste">
      <div className="teste-abas">
        <span className="aba aba-ativa">Testar fluxo</span>
        <span className="aba">Bloco</span>
      </div>

      {!flowId ? (
        <p className="empty-state">Salve o fluxo antes de testar.</p>
      ) : (
        <>
          <select
            className="select" value={pageId} onChange={(e) => setPageId(e.target.value)}
            aria-label="Página onde o fluxo vai rodar"
          >
            <option value="">Escolha a página…</option>
            {opcoes.map((p) => <option key={p.pageId} value={p.pageId}>{p.name}</option>)}
          </select>

          <div className="teste-linha">
            <span className={`selo ${pronto ? 'selo-ok' : ''}`}>
              ▷ {pronto ? 'Pronto para testar' : !pageId ? 'Escolha a página' : 'Salve o fluxo'}
            </span>
            <button className="btn btn-dark" onClick={testar} disabled={!pageId || rodando}>
              ▷ {rodando ? 'Rodando…' : 'Testar fluxo'}
            </button>
          </div>

          {salvoRecentemente === false && (
            <p className="teste-alerta">
              O teste roda a versão <strong>salva</strong> do fluxo. Salve para testar suas
              alterações.
            </p>
          )}

          <p className="tags-linha">
            Tags do lead:{' '}
            {resultado?.tagsFinais.length
              ? resultado.tagsFinais.map((t) => <span className="tag" key={t}>{t}</span>)
              : <span className="tags-vazio">nenhuma ainda</span>}
          </p>

          {erro && <p className="teste-erro">{erro}</p>}

          <Celular pagina={pagina} passos={resultado?.passos} />

          {resultado && <p className="teste-aviso">{resultado.aviso}</p>}
        </>
      )}

      <style>{estilo}</style>
    </aside>
  );
}

function Celular({ pagina, passos }) {
  return (
    <div className="celular">
      <div className="celular-topo">
        <span className="celular-voltar">‹</span>
        <span className="celular-avatar">
          {pagina?.avatarUrl
            ? <img src={pagina.avatarUrl} alt="" />
            : (pagina?.name ?? 'P').trim()[0].toUpperCase()}
          <span className="celular-online" />
        </span>
        <span className="celular-info">
          <span className="celular-nome">{pagina?.name ?? 'Sua página'}</span>
          <span className="celular-status">Ativo agora</span>
        </span>
      </div>

      <div className="celular-corpo">
        {!passos?.length ? (
          <p className="celular-placeholder">
            Aperte “Testar fluxo” para rodar o fluxo passo a passo, com os blocos acendendo no
            quadro ao lado.
          </p>
        ) : (
          passos.map((p, i) => <Passo key={i} passo={p} />)
        )}
      </div>

      <div className="celular-input">
        <span className="celular-campo">Aa</span>
        <span className="celular-joia">👍</span>
      </div>
    </div>
  );
}

// Só o passo de mensagem vira balão de conversa; os outros são anotações de
// bastidor. Misturar os dois faria parecer que a pessoa recebe "tag aplicada".
function Passo({ passo }) {
  if (passo.tipo === 'mensagem') {
    return (
      <>
        <div className="balao">
          {passo.text
            ? <p>{passo.text}</p>
            : <p className="balao-midia">[{passo.parte}] {passo.url || 'sem arquivo'}</p>}
          {passo.buttons?.length > 0 && (
            <div className="balao-botoes">
              {passo.buttons.map((b, i) => <span className="balao-botao" key={i}>{b.title}</span>)}
            </div>
          )}
        </div>
        {/* Resposta rápida não fica dentro do balão: no Messenger ela aparece
            acima do teclado, separada da mensagem. */}
        {passo.quickReplies?.length > 0 && (
          <div className="rapidas">
            {passo.quickReplies.map((q, i) => <span className="rapida" key={i}>{q.title}</span>)}
          </div>
        )}
      </>
    );
  }

  const texto = {
    espera: `aguarda ${formatarDuracao(passo.segundos)}`,
    tag: `aplica a tag “${passo.tag}”`,
    condicao: `condição “${passo.tag}”: ${passo.caminho}`,
    erro: passo.texto,
  }[passo.tipo];

  return <p className={`nota${passo.tipo === 'erro' ? ' nota-erro' : ''}`}>— {texto} —</p>;
}

const estilo = `
  .teste {
    display: flex; flex-direction: column; gap: 10px;
    padding: 14px; border-left: 1px solid var(--border);
    min-width: 0; overflow-y: auto;
  }
  .teste-abas { display: flex; gap: 4px; }
  .aba {
    font-size: 12.5px; padding: 5px 11px; border-radius: 7px;
    color: var(--muted); background: var(--surface-2);
  }
  .aba-ativa { background: var(--surface); color: var(--ink); box-shadow: var(--shadow-card); font-weight: 500; }
  .teste-linha { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
  .selo {
    font-size: 11.5px; padding: 4px 9px; border-radius: 999px;
    background: var(--surface-2); color: var(--muted-2);
  }
  .selo-ok { color: var(--muted); }
  .teste-alerta {
    font-size: 12px; color: var(--warning); background: var(--warning-soft);
    padding: 8px 10px; border-radius: 7px; line-height: 1.45;
  }
  .teste-erro { font-size: 12.5px; color: var(--danger); }
  .teste-aviso { font-size: 11px; color: var(--muted-2); line-height: 1.45; }
  .tags-linha { font-size: 12px; color: var(--muted); display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
  .tags-vazio { color: var(--muted-2); }
  .tag {
    font-size: 11px; padding: 2px 8px; border-radius: 999px;
    background: var(--accent-soft); color: var(--accent-ink);
  }

  .celular {
    border: 3px solid var(--ink); border-radius: 22px; overflow: hidden;
    display: flex; flex-direction: column; background: var(--surface);
    min-height: 340px;
  }
  .celular-topo {
    display: flex; align-items: center; gap: 8px;
    padding: 9px 11px; border-bottom: 1px solid var(--border);
  }
  .celular-voltar { color: var(--accent); font-size: 17px; line-height: 1; }
  .celular-avatar {
    position: relative; width: 30px; height: 30px; border-radius: 50%;
    background: var(--muted); color: #fff; flex: none;
    display: grid; place-items: center; font-size: 12px; font-weight: 600;
  }
  .celular-avatar img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; }
  .celular-online {
    position: absolute; right: -1px; bottom: -1px; width: 9px; height: 9px;
    border-radius: 50%; background: var(--success); border: 2px solid var(--surface);
  }
  .celular-info { display: flex; flex-direction: column; min-width: 0; }
  .celular-nome { font-size: 12.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .celular-status { font-size: 10.5px; color: var(--muted-2); }
  .celular-corpo {
    flex: 1; padding: 14px 12px; display: flex; flex-direction: column; gap: 7px;
    background: var(--surface); max-height: 300px; overflow-y: auto;
  }
  .celular-placeholder {
    margin: auto 0; text-align: center; font-size: 12px;
    color: var(--muted-2); line-height: 1.55;
  }
  .celular-input {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 11px; border-top: 1px solid var(--border);
  }
  .celular-campo {
    flex: 1; background: var(--surface-2); color: var(--muted-2);
    font-size: 12px; padding: 6px 12px; border-radius: 999px;
  }
  .celular-joia { font-size: 14px; }

  .balao {
    align-self: flex-start; max-width: 85%;
    background: var(--accent); color: #fff;
    padding: 8px 11px; border-radius: 14px 14px 14px 4px;
    font-size: 12.5px; line-height: 1.45;
  }
  .balao-midia { font-style: italic; opacity: 0.9; word-break: break-all; }
  .balao-botoes { display: flex; flex-direction: column; gap: 4px; margin-top: 7px; }
  .balao-botao {
    background: rgba(255,255,255,0.16); border-radius: 7px;
    padding: 5px 8px; font-size: 11.5px; text-align: center;
  }
  .rapidas { display: flex; gap: 5px; flex-wrap: wrap; align-self: flex-end; }
  .rapida {
    font-size: 11.5px; padding: 4px 10px; border-radius: 999px;
    border: 1px solid var(--accent); color: var(--accent); background: var(--surface);
  }
  .nota { font-size: 11px; color: var(--muted-2); text-align: center; }
  .nota-erro { color: var(--danger); }
`;
