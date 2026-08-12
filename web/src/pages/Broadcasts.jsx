import { useState } from 'react';
import Layout from '../components/Layout.jsx';
import Modal from '../components/Modal.jsx';
import { CardSkeleton, CardError } from '../components/CardState.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { broadcastsApi, pagesApi, pageGroupsApi, leadsApi } from '../api/index.js';

const STATUS = {
  draft: ['badge', 'Rascunho'],
  scheduled: ['badge-accent', 'Agendado'],
  running: ['badge-ok', 'Em andamento'],
  paused: ['badge-warn', 'Pausado'],
  completed: ['badge', 'Concluído'],
  failed: ['badge-danger', 'Falhou'],
};

export default function Broadcasts() {
  const [versao, setVersao] = useState(0);
  const [filtro, setFiltro] = useState('');
  const [novo, setNovo] = useState(false);
  const [erro, setErro] = useState(null);
  const recarregar = () => setVersao((v) => v + 1);

  const lista = useAsync(() => broadcastsApi.list(filtro), [versao, filtro]);

  async function acao(fn, campanha) {
    setErro(null);
    try {
      await fn(campanha.id);
      recarregar();
    } catch (err) {
      setErro(err.message);
    }
  }

  return (
    <Layout title="Broadcasts">
      <div className="page-head">
        <div>
          <h1 className="page-title">Broadcasts</h1>
          <p className="page-sub">Campanhas de envio para leads já capturados.</p>
        </div>
        <div className="page-actions">
          <select
            className="select"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            aria-label="Filtrar por status"
            style={{ width: 'auto' }}
          >
            <option value="">Todos os status</option>
            {Object.entries(STATUS).map(([v, [, l]]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <button className="btn btn-primary" onClick={() => setNovo(true)}>Nova campanha</button>
        </div>
      </div>

      {erro && <p className="aviso-erro">{erro}</p>}

      <div className="card tabela-card">
        {lista.loading && <CardSkeleton lines={5} />}
        {lista.error && <CardError message={lista.error.message} />}

        {lista.data && !lista.data.length && (
          <p className="empty-state">
            {filtro
              ? 'Nenhuma campanha com esse status.'
              : 'Nenhuma campanha ainda. Crie uma para reengajar os leads que já estão na base.'}
          </p>
        )}

        {lista.data?.length > 0 && (
          <div className="tabela-scroll">
            <table className="tabela">
              <thead>
                <tr>
                  <th scope="col">Campanha</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="col-prog">Progresso</th>
                  <th scope="col" className="dir">Enviados</th>
                  <th scope="col" className="dir">Erros</th>
                  <th scope="col">Criada</th>
                  <th scope="col">Início</th>
                  <th scope="col"><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {lista.data.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <span className="camp-nome">{b.name}</span>
                      <span className="camp-code tabular">{b.code}</span>
                    </td>
                    <td>
                      <span className={`badge ${STATUS[b.status]?.[0] ?? ''}`}>
                        {STATUS[b.status]?.[1] ?? b.status}
                      </span>
                    </td>
                    <td className="col-prog">
                      <div className="prog" role="img" aria-label={`${b.percentual}% concluído`}>
                        <div className="prog-fill" style={{ width: `${b.percentual}%` }} />
                      </div>
                      <span className="prog-num tabular">{b.percentual}%</span>
                    </td>
                    <td className="dir tabular">{b.totalSent.toLocaleString('pt-BR')}</td>
                    <td className="dir tabular">
                      {b.totalErrors > 0
                        ? <span className="erros">{b.totalErrors}</span>
                        : b.totalErrors}
                    </td>
                    <td className="tabular">{dataCurta(b.createdAt)}</td>
                    <td className="tabular">{b.startedAt ? dataHora(b.startedAt) : (b.scheduledAt ? `agendada ${dataHora(b.scheduledAt)}` : '—')}</td>
                    <td className="dir">
                      <Acoes campanha={b} onAcao={acao} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <NovaCampanhaModal
        aberto={novo}
        onFechar={() => setNovo(false)}
        onCriada={() => { setNovo(false); recarregar(); }}
      />

      <style>{`
        .aviso-erro { font-size: 13px; padding: 10px 12px; border-radius: 8px; background: var(--danger-soft); color: var(--danger); }
        .tabela-card { padding: 18px 20px; display: flex; flex-direction: column; gap: 14px; min-width: 0; }
        .tabela-scroll { overflow-x: auto; }
        /* Sem min-width a tabela encolhe até caber e as colunas viram texto
           quebrado, em vez de o container rolar na horizontal. */
        .tabela { width: 100%; min-width: 760px; border-collapse: collapse; font-size: 13px; }
        .tabela th {
          text-align: left; font-weight: 500; font-size: 12px; color: var(--muted);
          padding: 0 14px 8px 0; white-space: nowrap; border-bottom: 1px solid var(--border);
        }
        .tabela td { padding: 10px 14px 10px 0; border-bottom: 1px solid var(--border); vertical-align: middle; }
        .tabela tr:last-child td { border-bottom: none; }
        .tabela th.dir, .tabela td.dir { text-align: right; padding-right: 0; }
        .camp-nome { display: block; font-weight: 500; }
        .camp-code { display: block; font-size: 11.5px; color: var(--muted-2); }
        .col-prog { min-width: 140px; }
        .prog { display: inline-block; width: 88px; height: 7px; border-radius: 999px; background: var(--surface-2); overflow: hidden; vertical-align: middle; }
        .prog-fill { height: 100%; background: var(--accent); border-radius: 999px; }
        .prog-num { font-size: 12px; color: var(--muted); margin-left: 8px; }
        .erros { color: var(--danger); font-weight: 600; }
        .sr-only {
          position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
          overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
        }
      `}</style>
    </Layout>
  );
}

// Play/pause por linha. Qual ação aparece depende do estado — mostrar as duas
// sempre obrigaria o operador a saber qual delas o servidor vai recusar.
function Acoes({ campanha, onAcao }) {
  const b = campanha;

  if (b.status === 'running') {
    return (
      <button className="btn btn-sm" onClick={() => onAcao(broadcastsApi.pause, b)} title="Pausar">
        ⏸ Pausar
      </button>
    );
  }
  if (b.status === 'paused' || b.status === 'failed') {
    return (
      <button className="btn btn-sm" onClick={() => onAcao(broadcastsApi.resume, b)} title="Retomar">
        ▶ Retomar
      </button>
    );
  }
  if (b.status === 'draft' || b.status === 'scheduled') {
    return (
      <span className="acoes">
        <button className="btn btn-sm btn-primary" onClick={() => onAcao(broadcastsApi.start, b)}>
          ▶ Disparar
        </button>
        <button
          className="btn btn-sm btn-danger"
          onClick={() => confirm(`Excluir a campanha "${b.name}"?`) && onAcao(broadcastsApi.remove, b)}
        >
          Excluir
        </button>
        <style>{`.acoes { display: inline-flex; gap: 6px; }`}</style>
      </span>
    );
  }
  return <span className="tabular" style={{ color: 'var(--muted-2)', fontSize: 12 }}>—</span>;
}

function NovaCampanhaModal({ aberto, onFechar, onCriada }) {
  const [nome, setNome] = useState('');
  const [texto, setTexto] = useState('');
  const [botaoTitulo, setBotaoTitulo] = useState('');
  const [botaoUrl, setBotaoUrl] = useState('');
  const [pageIds, setPageIds] = useState([]);
  const [groupIds, setGroupIds] = useState([]);
  const [tags, setTags] = useState([]);
  const [agendarEm, setAgendarEm] = useState('');
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [publico, setPublico] = useState(null);

  const paginas = useAsync(() => pagesApi.list(), [aberto]);
  const grupos = useAsync(() => pageGroupsApi.list(), [aberto]);
  const listaTags = useAsync(() => leadsApi.tags(), [aberto]);

  const opcoesPagina = [...new Map((paginas.data ?? []).map((p) => [p.pageId, p])).values()];
  const targetFilter = { pageIds, groupIds, tags };

  async function verPublico() {
    setErro(null);
    try {
      setPublico(await broadcastsApi.preview(targetFilter));
    } catch (err) {
      setErro(err.message);
    }
  }

  async function salvar(e) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      await broadcastsApi.create({
        name: nome,
        message: {
          text: texto,
          buttons: botaoTitulo && botaoUrl ? [{ title: botaoTitulo, url: botaoUrl }] : null,
        },
        targetFilter,
        scheduledAt: agendarEm ? new Date(agendarEm).toISOString() : undefined,
      });
      onCriada();
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal aberto={aberto} titulo="Nova campanha" onFechar={onFechar} largura={560}>
      <form onSubmit={salvar} className="form-col">
        <div className="field">
          <label htmlFor="c-nome">Nome da campanha</label>
          <input id="c-nome" className="input" value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />
        </div>

        <div className="field">
          <label htmlFor="c-texto">Mensagem</label>
          <textarea id="c-texto" className="textarea" value={texto} onChange={(e) => setTexto(e.target.value)} />
        </div>

        <div className="linha-2">
          <div className="field">
            <label htmlFor="c-btn">Botão (opcional)</label>
            <input id="c-btn" className="input" value={botaoTitulo} onChange={(e) => setBotaoTitulo(e.target.value)} placeholder="Ver oferta" />
          </div>
          <div className="field">
            <label htmlFor="c-url">Link do botão</label>
            <input id="c-url" className="input" value={botaoUrl} onChange={(e) => setBotaoUrl(e.target.value)} placeholder="https://…" />
          </div>
        </div>
        <p className="field-hint">
          O link do botão é reescrito pela ferramenta antes do envio — é assim que o clique é medido.
        </p>

        <fieldset className="grupo-campos">
          <legend className="section-title">Público</legend>
          <MultiSelect
            id="c-paginas" rotulo="Páginas"
            opcoes={opcoesPagina.map((p) => [p.pageId, p.name])}
            valor={pageIds} onChange={setPageIds}
          />
          <MultiSelect
            id="c-grupos" rotulo="Grupos de páginas"
            opcoes={(grupos.data ?? []).map((g) => [g.id, g.name])}
            valor={groupIds} onChange={setGroupIds}
          />
          <MultiSelect
            id="c-tags" rotulo="Tags"
            opcoes={(listaTags.data ?? []).map((t) => [t.name, `${t.name} (${t.leadsCount})`])}
            valor={tags} onChange={setTags}
          />
          <p className="field-hint">
            Sem nenhuma seleção, a campanha vai para todos os leads. Descadastrados e leads
            bloqueados ficam sempre de fora.
          </p>
          <div className="publico-linha">
            <button type="button" className="btn btn-sm" onClick={verPublico}>Ver tamanho do público</button>
            {publico && (
              <span className="field-hint">
                <strong>{publico.total}</strong> lead(s) · {publico.dentroDaJanela24h} na janela de
                24h, {publico.foraDaJanela24h} fora (precisam de template aprovado)
              </span>
            )}
          </div>
        </fieldset>

        <div className="field">
          <label htmlFor="c-agenda">Agendar para (opcional)</label>
          <input id="c-agenda" type="datetime-local" className="input" value={agendarEm} onChange={(e) => setAgendarEm(e.target.value)} />
          <span className="field-hint">Em branco, a campanha fica como rascunho até você disparar.</span>
        </div>

        {erro && <p className="form-erro">{erro}</p>}

        <div className="form-acoes">
          <button type="button" className="btn" onClick={onFechar}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={salvando || !nome.trim() || !texto.trim()}>
            {salvando ? 'Criando…' : 'Criar campanha'}
          </button>
        </div>

        <style>{`
          .form-col { display: flex; flex-direction: column; gap: 14px; }
          .form-erro { font-size: 12.5px; color: var(--danger); }
          .form-acoes { display: flex; justify-content: flex-end; gap: 8px; }
          .linha-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
          .grupo-campos {
            border: 1px solid var(--border); border-radius: 9px;
            padding: 14px; display: flex; flex-direction: column; gap: 12px; margin: 0;
          }
          .grupo-campos legend { padding: 0 6px; }
          .publico-linha { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        `}</style>
      </form>
    </Modal>
  );
}

// Multisseleção por caixas em vez de <select multiple>: select múltiplo exige
// Ctrl+clique pra marcar mais de um, e quase ninguém descobre isso sozinho.
function MultiSelect({ id, rotulo, opcoes, valor, onChange }) {
  if (!opcoes.length) return null;

  function alternar(v) {
    onChange(valor.includes(v) ? valor.filter((x) => x !== v) : [...valor, v]);
  }

  return (
    <div className="multi">
      <span className="multi-rotulo" id={`${id}-rot`}>{rotulo}</span>
      <div className="multi-ops" role="group" aria-labelledby={`${id}-rot`}>
        {opcoes.map(([v, l]) => (
          <label className={`chip ${valor.includes(v) ? 'chip-on' : ''}`} key={v}>
            <input type="checkbox" checked={valor.includes(v)} onChange={() => alternar(v)} />
            {l}
          </label>
        ))}
      </div>
      <style>{`
        .multi { display: flex; flex-direction: column; gap: 6px; }
        .multi-rotulo { font-size: 12.5px; color: var(--muted); }
        .multi-ops { display: flex; flex-wrap: wrap; gap: 6px; }
        .chip {
          display: inline-flex; align-items: center; gap: 6px;
          font-size: 12.5px; padding: 5px 10px; border-radius: 999px;
          border: 1px solid var(--border); cursor: pointer;
        }
        .chip-on { background: var(--accent-soft); color: var(--accent-ink); border-color: var(--accent-soft); }
        .chip input { margin: 0; }
      `}</style>
    </div>
  );
}

function dataCurta(iso) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}
function dataHora(iso) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}
