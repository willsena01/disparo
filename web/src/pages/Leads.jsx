import { useEffect, useState } from 'react';
import Layout from '../components/Layout.jsx';
import Avatar from '../components/Avatar.jsx';
import { CardSkeleton, CardError } from '../components/CardState.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { leadsApi, pagesApi } from '../api/index.js';

const ORIGENS = [
  ['comment', 'Comentário'],
  ['import', 'Importação'],
  ['broadcast', 'Campanha'],
  ['manual', 'Manual'],
];

const ENTREGABILIDADE = {
  ok: ['badge-ok', 'Entregável'],
  failing: ['badge-warn', 'Falhando'],
  blocked: ['badge-danger', 'Bloqueado'],
};

export default function Leads() {
  const [pagina, setPagina] = useState(1);
  const [busca, setBusca] = useState('');
  const [buscaAplicada, setBuscaAplicada] = useState('');
  const [pageId, setPageId] = useState('');
  const [source, setSource] = useState('');
  const [tag, setTag] = useState('');

  // Espera o operador parar de digitar: sem isso é uma requisição por tecla, e
  // as respostas chegam fora de ordem em busca rápida.
  useEffect(() => {
    const t = setTimeout(() => {
      setBuscaAplicada(busca);
      setPagina(1);
    }, 350);
    return () => clearTimeout(t);
  }, [busca]);

  const lista = useAsync(
    () => leadsApi.list({ page: pagina, perPage: 25, q: buscaAplicada, pageId, source, tag }),
    [pagina, buscaAplicada, pageId, source, tag]
  );
  const tags = useAsync(() => leadsApi.tags(), []);
  const paginas = useAsync(() => pagesApi.list(), []);

  // Uma página conectada por dois apps aparece duas vezes na listagem — pro
  // filtro o que importa é o page_id, não a conexão.
  const opcoesPagina = [...new Map((paginas.data ?? []).map((p) => [p.pageId, p])).values()];

  function trocarFiltro(setter) {
    return (e) => {
      setter(e.target.value);
      setPagina(1);
    };
  }

  const total = lista.data?.total ?? 0;

  return (
    <Layout title="Leads">
      <div className="page-head">
        <div>
          <h1 className="page-title">Leads</h1>
          <p className="page-sub">
            {lista.loading ? 'Carregando…' : `${total.toLocaleString('pt-BR')} lead(s) no total`}
          </p>
        </div>
      </div>

      <div className="card filtros">
        <div className="field field-busca">
          <label htmlFor="busca">Buscar</label>
          <input
            id="busca"
            className="input"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Nome ou PSID"
          />
        </div>
        <div className="field">
          <label htmlFor="f-pagina">Página</label>
          <select id="f-pagina" className="select" value={pageId} onChange={trocarFiltro(setPageId)}>
            <option value="">Todas</option>
            {opcoesPagina.map((p) => (
              <option key={p.pageId} value={p.pageId}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-origem">Origem</label>
          <select id="f-origem" className="select" value={source} onChange={trocarFiltro(setSource)}>
            <option value="">Todas</option>
            {ORIGENS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-tag">Tag</label>
          <select id="f-tag" className="select" value={tag} onChange={trocarFiltro(setTag)}>
            <option value="">Todas</option>
            {(tags.data ?? []).map((t) => (
              <option key={t.name} value={t.name}>{t.name} ({t.leadsCount})</option>
            ))}
          </select>
        </div>
      </div>

      <div className="card tabela-card">
        {lista.loading && <CardSkeleton lines={6} />}
        {lista.error && <CardError message={lista.error.message} />}

        {lista.data && !lista.data.data.length && (
          <p className="empty-state">
            {buscaAplicada || pageId || source || tag
              ? 'Nenhum lead com esses filtros. Limpe os filtros para ver a base inteira.'
              : 'Nenhum lead ainda. Eles aparecem aqui quando alguém comenta a palavra-chave de um fluxo.'}
          </p>
        )}

        {lista.data?.data.length > 0 && (
          <div className="tabela-scroll">
            <table className="tabela">
              <thead>
                <tr>
                  <th scope="col">Lead</th>
                  <th scope="col">PSID</th>
                  <th scope="col">Página</th>
                  <th scope="col">Origem</th>
                  <th scope="col">Última interação</th>
                  <th scope="col">Inscrito</th>
                  <th scope="col">Tags</th>
                  <th scope="col">Entregabilidade</th>
                </tr>
              </thead>
              <tbody>
                {lista.data.data.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <span className="lead-nome">
                        <Avatar nome={l.name} url={l.avatarUrl} size={26} />
                        {l.name || <span className="sem-nome">sem nome</span>}
                      </span>
                    </td>
                    <td className="tabular psid" title={l.psid}>{l.psid}</td>
                    <td>{l.pageName ?? l.pageId}</td>
                    <td>
                      <span className="badge">{rotulo(ORIGENS, l.source)}</span>
                    </td>
                    <td className="tabular">{dataRelativa(l.lastInteractionAt)}</td>
                    <td>
                      <span className={`badge ${l.subscribed ? 'badge-ok' : ''}`}>
                        {l.subscribed ? 'Sim' : 'Não'}
                      </span>
                    </td>
                    <td>
                      <span className="tags">
                        {l.tags.length
                          ? l.tags.map((t) => <span className="badge badge-accent" key={t}>{t}</span>)
                          : <span className="sem-nome">—</span>}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${ENTREGABILIDADE[l.deliverability]?.[0] ?? ''}`}>
                        {ENTREGABILIDADE[l.deliverability]?.[1] ?? l.deliverability}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {lista.data && lista.data.totalPages > 1 && (
          <div className="paginacao">
            <button
              className="btn btn-sm"
              onClick={() => setPagina((p) => p - 1)}
              disabled={pagina <= 1}
            >
              Anterior
            </button>
            <span className="tabular pag-info">
              Página {lista.data.page} de {lista.data.totalPages}
            </span>
            <button
              className="btn btn-sm"
              onClick={() => setPagina((p) => p + 1)}
              disabled={pagina >= lista.data.totalPages}
            >
              Próxima
            </button>
          </div>
        )}
      </div>

      <style>{`
        .filtros {
          padding: 16px 18px;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 12px;
        }
        .field-busca { grid-column: span 2; min-width: 200px; }
        .tabela-card { padding: 18px 20px; display: flex; flex-direction: column; gap: 14px; min-width: 0; }
        .tabela-scroll { overflow-x: auto; }
        /* min-width é o que faz o overflow engatar: sem ele a tabela encolhe
           até caber e as oito colunas viram texto quebrado em duas linhas,
           em vez de rolarem na horizontal. */
        .tabela { width: 100%; min-width: 780px; border-collapse: collapse; font-size: 13px; }
        .tabela th {
          text-align: left; font-weight: 500; font-size: 12px; color: var(--muted);
          padding: 0 14px 8px 0; white-space: nowrap; border-bottom: 1px solid var(--border);
        }
        .tabela td { padding: 10px 14px 10px 0; border-bottom: 1px solid var(--border); }
        .tabela tr:last-child td { border-bottom: none; }
        .lead-nome { display: inline-flex; align-items: center; gap: 8px; white-space: nowrap; }
        .sem-nome { color: var(--muted-2); }
        /* text-overflow só corta com nowrap; sem ele o PSID quebra em duas
           linhas e desalinha a altura da linha inteira. */
        .psid { max-width: 130px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .tags { display: inline-flex; gap: 4px; flex-wrap: wrap; max-width: 220px; }
        .paginacao { display: flex; align-items: center; justify-content: flex-end; gap: 12px; }
        .pag-info { font-size: 12.5px; color: var(--muted); }
      `}</style>
    </Layout>
  );
}

function rotulo(pares, valor) {
  return pares.find(([v]) => v === valor)?.[1] ?? valor;
}

// "há 3 dias" comunica recência melhor que uma data absoluta numa tabela que
// se lê de relance.
function dataRelativa(iso) {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `há ${d}d`;
  return new Date(iso).toLocaleDateString('pt-BR');
}
