import { useState } from 'react';
import Modal from '../Modal.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { pagesApi, flowsApi } from '../../api/index.js';

// Páginas e palavras-chave do fluxo.
//
// O roteiro previa dois botões separados ("Páginas" e "Gatilho"), mas no
// modelo de dados os dois editam a MESMA linha: um gatilho é a dupla
// página + palavra-chave. Duas telas mexendo na mesma coisa só criam a dúvida
// de qual delas manda.
const ROTULO_DO_TIPO = {
  contains: 'contém',
  exact: 'texto exato',
  any: 'qualquer comentário',
};

export default function TriggersModal({ aberto, flow, onFechar, onMudou }) {
  const [pageId, setPageId] = useState('');
  const [keyword, setKeyword] = useState('');
  const [matchType, setMatchType] = useState('contains');
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const paginas = useAsync(() => pagesApi.list(), [aberto]);
  const opcoes = [...new Map((paginas.data ?? []).map((p) => [p.pageId, p])).values()];
  const triggers = flow?.triggers ?? [];
  const qualquer = matchType === 'any';

  async function adicionar(e) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      await flowsApi.addTrigger(flow.id, { pageId, keyword, matchType });
      setKeyword('');
      await onMudou();
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  async function remover(t) {
    try {
      await flowsApi.removeTrigger(flow.id, t.id);
      await onMudou();
    } catch (err) {
      setErro(err.message);
    }
  }

  return (
    <Modal aberto={aberto} titulo="Páginas e gatilhos" onFechar={onFechar} largura={520}>
      <p className="field-hint">
        O fluxo dispara quando alguém comenta num post da página escolhida — com uma palavra-chave
        específica ou com qualquer comentário. Sem gatilho, ele nunca começa sozinho, só pelo teste.
      </p>
      {/* Dúvida recorrente: "preciso cadastrar o gatilho a cada vídeo novo?".
          Não — o gatilho é da página. Dizer isso aqui evita a pergunta. */}
      <p className="field-hint destaque">
        O gatilho vale para <strong>todos os posts da página</strong>, inclusive os que você
        publicar depois. Não é preciso cadastrar nada a cada vídeo novo.
      </p>

      {triggers.length > 0 ? (
        <ul className="gatilhos">
          {triggers.map((t) => (
            <li key={t.id}>
              <span className="gat-kw">
                {t.matchType === 'any' ? 'Qualquer comentário' : `“${t.keyword}”`}
              </span>
              <span className="badge">{opcoes.find((p) => p.pageId === t.pageId)?.name ?? t.pageId}</span>
              <span className={`badge ${t.matchType === 'any' ? 'badge-warn' : ''}`}>
                {ROTULO_DO_TIPO[t.matchType]}
              </span>
              <button className="btn btn-sm btn-danger" onClick={() => remover(t)}>Remover</button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-state">Nenhum gatilho ainda.</p>
      )}

      <form onSubmit={adicionar} className="form-col">
        <div className={`linha-gat${qualquer ? ' sem-keyword' : ''}`}>
          <div className="field">
            <label htmlFor="gat-pagina">Página</label>
            <select id="gat-pagina" className="select" value={pageId} onChange={(e) => setPageId(e.target.value)}>
              <option value="">Escolha…</option>
              {opcoes.map((p) => <option key={p.pageId} value={p.pageId}>{p.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="gat-tipo">Disparar quando</label>
            <select id="gat-tipo" className="select" value={matchType} onChange={(e) => setMatchType(e.target.value)}>
              <option value="contains">O comentário contém a palavra-chave</option>
              <option value="exact">O comentário é exatamente a palavra-chave</option>
              <option value="any">Qualquer comentário</option>
            </select>
          </div>
          {/* Em "qualquer comentário" não há palavra-chave: deixar o campo na
              tela sugeriria que ele ainda vale pra alguma coisa. */}
          {!qualquer && (
            <div className="field">
              <label htmlFor="gat-kw">Palavra-chave</label>
              <input id="gat-kw" className="input" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="EU QUERO" />
            </div>
          )}
        </div>

        {qualquer && (
          <p className="gat-alerta">
            <strong>Todo comentário nessa página vira lead e entra no fluxo</strong> — inclusive
            reclamação, resposta a outra pessoa e comentário de quem já está na base. Se houver
            também gatilhos de palavra-chave, eles têm prioridade; este só vale quando nenhum
            deles casar.
          </p>
        )}

        {erro && <p className="form-erro">{erro}</p>}

        <div className="form-acoes">
          <button
            type="submit" className="btn btn-primary"
            disabled={salvando || !pageId || (!qualquer && !keyword.trim())}
          >
            Adicionar gatilho
          </button>
        </div>
      </form>

      <style>{`
        .gatilhos { list-style: none; display: flex; flex-direction: column; gap: 2px; }
        .gatilhos li {
          display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
          padding: 9px 0; border-bottom: 1px solid var(--border);
        }
        .gat-kw { font-size: 13px; flex: 1; }
        .form-col { display: flex; flex-direction: column; gap: 12px; }
        .form-erro { font-size: 12.5px; color: var(--danger); }
        .form-acoes { display: flex; justify-content: flex-end; }
        .linha-gat { display: grid; grid-template-columns: 0.9fr 1.3fr 0.9fr; gap: 10px; }
        .linha-gat.sem-keyword { grid-template-columns: 0.9fr 1.3fr; }
        .gat-alerta {
          font-size: 12px; line-height: 1.5; color: var(--warning);
          background: var(--warning-soft); padding: 9px 11px; border-radius: 7px;
        }
        .gat-alerta strong { display: block; margin-bottom: 2px; }
        .destaque {
          background: var(--accent-soft); color: var(--accent-ink);
          padding: 8px 10px; border-radius: 7px;
        }
        .destaque strong { font-weight: 600; }
      `}</style>
    </Modal>
  );
}
