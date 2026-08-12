import { useState } from 'react';
import Layout from '../components/Layout.jsx';
import Avatar from '../components/Avatar.jsx';
import Modal from '../components/Modal.jsx';
import { CardSkeleton, CardError } from '../components/CardState.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { pagesApi, pageGroupsApi, appsApi } from '../api/index.js';

export default function Pages() {
  const [versao, setVersao] = useState(0);
  const recarregar = () => setVersao((v) => v + 1);

  const paginas = useAsync(() => pagesApi.list(), [versao]);
  const grupos = useAsync(() => pageGroupsApi.list(), [versao]);
  const apps = useAsync(() => appsApi.list(), []);

  const [escaneando, setEscaneando] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [novoGrupo, setNovoGrupo] = useState(false);

  async function escanearTodas() {
    setEscaneando(true);
    setAviso(null);
    try {
      const r = await pagesApi.scan();
      setAviso({
        tipo: r.comProblema ? 'alerta' : 'ok',
        texto:
          `${r.total} página(s) verificadas: ${r.ok} com token válido, ${r.comProblema} com problema` +
          (r.reinscritas ? ` · ${r.reinscritas} reinscrita(s) no webhook` : '') + '.',
      });
      recarregar();
    } catch (err) {
      setAviso({ tipo: 'erro', texto: err.message });
    } finally {
      setEscaneando(false);
    }
  }

  async function reinscrever(pagina) {
    setAviso(null);
    try {
      const p = await pagesApi.subscribe(pagina.id);
      setAviso(
        p.webhook.inscrito
          ? { tipo: 'ok', texto: `"${p.name}" já está recebendo os comentários de todos os posts.` }
          : { tipo: 'erro', texto: `Não deu pra ativar "${p.name}": ${p.webhook.erro}` }
      );
      recarregar();
    } catch (err) {
      setAviso({ tipo: 'erro', texto: err.message });
    }
  }

  async function desvincular(pagina) {
    if (!confirm(`Desvincular "${pagina.name}"? Os leads dela continuam na base.`)) return;
    try {
      await pagesApi.unlink(pagina.id);
      recarregar();
    } catch (err) {
      setAviso({ tipo: 'erro', texto: err.message });
    }
  }

  // Conectar página não é o mesmo que enviar mensagem: um app "blocked" saiu do
  // rodízio de ENVIO (bateu limite ou levou restrição), mas segue servindo pra
  // autorizar páginas. Excluir os bloqueados aqui deixaria o operador sem saída
  // justamente quando ele precisa reconectar pra resolver o problema.
  const appsUtilizaveis = (apps.data ?? []).filter((a) => a.status !== 'disabled');
  const todosBloqueados = appsUtilizaveis.length > 0 &&
    appsUtilizaveis.every((a) => a.status === 'blocked');

  return (
    <Layout title="Páginas">
      <div className="page-head">
        <div>
          <h1 className="page-title">Páginas conectadas</h1>
          <p className="page-sub">
            Cada página conectada por mais de um app entra no rodízio de envio.
          </p>
        </div>
        <div className="page-actions">
          <button className="btn" onClick={escanearTodas} disabled={escaneando}>
            {escaneando ? 'Escaneando…' : 'Escanear todas'}
          </button>
          <ConectarFacebook apps={appsUtilizaveis} carregando={apps.loading} />
        </div>
      </div>

      {aviso && <p className={`aviso aviso-${aviso.tipo}`}>{aviso.texto}</p>}

      {/* Sem este aviso, o operador vê "Conectar com Facebook" funcionando e
          não entende por que nenhuma mensagem sai. */}
      {todosBloqueados && (
        <p className="aviso aviso-alerta">
          Todos os seus apps do Facebook estão <strong>bloqueados</strong> e não estão enviando
          mensagens. Dá pra conectar páginas normalmente, mas o disparo só volta depois de
          reativá-los em <a href="/configuracoes">Configurações</a>.
        </p>
      )}

      {paginas.loading && <div className="card" style={{ padding: 20 }}><CardSkeleton lines={4} /></div>}
      {paginas.error && <div className="card" style={{ padding: 20 }}><CardError message={paginas.error.message} /></div>}

      {paginas.data && (
        <ListaAgrupada
          paginas={paginas.data}
          grupos={grupos.data ?? []}
          onDesvincular={desvincular}
          onMudarGrupo={async (pagina, groupId) => {
            await pagesApi.setGroup(pagina.id, groupId || null);
            recarregar();
          }}
          semApps={!apps.loading && appsUtilizaveis.length === 0}
        />
      )}

      <GruposCard
        grupos={grupos}
        onNovo={() => setNovoGrupo(true)}
        onExcluir={async (g) => {
          if (!confirm(`Excluir o grupo "${g.name}"? As páginas continuam conectadas.`)) return;
          await pageGroupsApi.remove(g.id);
          recarregar();
        }}
      />

      <NovoGrupoModal
        aberto={novoGrupo}
        onFechar={() => setNovoGrupo(false)}
        onCriado={() => {
          setNovoGrupo(false);
          recarregar();
        }}
      />

      <style>{`
        .aviso { font-size: 13px; padding: 10px 12px; border-radius: 8px; }
        .aviso-ok { background: var(--success-soft); color: var(--success); }
        .aviso-alerta { background: var(--warning-soft); color: var(--warning); }
        .aviso-erro { background: var(--danger-soft); color: var(--danger); }
      `}</style>
    </Layout>
  );
}

function ConectarFacebook({ apps, carregando }) {
  const [escolhendo, setEscolhendo] = useState(false);

  if (carregando) return <button className="btn btn-primary" disabled>Conectar com Facebook</button>;

  // Sem app cadastrado não há OAuth possível — e mandar pro Facebook sem
  // client_id daria erro lá, longe da explicação.
  if (!apps.length) {
    return (
      <a className="btn" href="/configuracoes" title="Cadastre um app do Facebook primeiro">
        Cadastrar app primeiro
      </a>
    );
  }

  if (apps.length === 1) {
    return (
      <a className="btn btn-primary" href={pagesApi.oauthStartUrl(apps[0].id)}>
        Conectar com Facebook
      </a>
    );
  }

  // Com mais de um app, quem escolhe é o operador — inclusive porque conectar a
  // mesma página por apps diferentes é o que alimenta a rotação.

  return (
    <>
      <button className="btn btn-primary" onClick={() => setEscolhendo(true)}>
        Conectar com Facebook
      </button>
      <Modal aberto={escolhendo} titulo="Conectar por qual app?" onFechar={() => setEscolhendo(false)}>
        <p className="field-hint">
          Conectar a mesma página por mais de um app é o que permite continuar enviando quando um
          deles é bloqueado.
        </p>
        {apps.map((a) => (
          <a key={a.id} className="btn" href={pagesApi.oauthStartUrl(a.id)}>
            {a.name} <span className="badge">App ID {a.appId}</span>
            {a.status === 'blocked' && <span className="badge badge-danger">bloqueado</span>}
          </a>
        ))}
      </Modal>
    </>
  );
}

function ListaAgrupada({ paginas, grupos, onDesvincular, onMudarGrupo, semApps }) {
  if (!paginas.length) {
    return (
      <div className="card" style={{ padding: 28 }}>
        <p className="empty-state">
          {semApps
            ? 'Nenhuma página conectada. Cadastre um app do Facebook em Configurações e depois conecte suas páginas.'
            : 'Nenhuma página conectada ainda. Use "Conectar com Facebook" para autorizar suas páginas.'}
        </p>
      </div>
    );
  }

  // Agrupa pela conta do Facebook que autorizou. Páginas conectadas antes do
  // OAuth (inseridas na mão) não têm essa informação e caem num grupo à parte,
  // em vez de sumirem da tela.
  const porConta = new Map();
  for (const p of paginas) {
    const chave = p.connectedBy?.name ?? `Sem conta vinculada · ${p.app.name}`;
    if (!porConta.has(chave)) porConta.set(chave, []);
    porConta.get(chave).push(p);
  }

  return (
    <>
      {[...porConta.entries()].map(([conta, lista]) => (
        <div className="card conta-card" key={conta}>
          <div className="conta-head">
            <h2 className="section-title">{conta}</h2>
            <span className="badge">{lista.length} página(s)</span>
          </div>
          <ul className="paginas">
            {lista.map((p) => (
              <li className="pagina" key={p.id}>
                <Avatar nome={p.name} url={p.avatarUrl} size={34} />
                <div className="pagina-info">
                  <span className="pagina-nome">{p.name}</span>
                  <span className="pagina-meta tabular">
                    ID {p.pageId} · {p.leadsCount.toLocaleString('pt-BR')} lead(s) · via {p.app.name}
                  </span>
                </div>
                <SaudeBadge pagina={p} />
                <WebhookBadge pagina={p} onReinscrever={() => reinscrever(p)} />
                <select
                  className="select select-grupo"
                  value={p.group?.id ?? ''}
                  onChange={(e) => onMudarGrupo(p, e.target.value)}
                  aria-label={`Grupo da página ${p.name}`}
                >
                  <option value="">Sem grupo</option>
                  {grupos.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
                <button className="btn btn-sm btn-danger" onClick={() => onDesvincular(p)}>
                  Desvincular
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <style>{`
        .conta-card { padding: 18px 20px; display: flex; flex-direction: column; gap: 14px; }
        .conta-head { display: flex; align-items: center; gap: 10px; }
        .paginas { list-style: none; display: flex; flex-direction: column; gap: 2px; }
        .pagina {
          display: flex; align-items: center; gap: 12px;
          padding: 10px 0; border-top: 1px solid var(--border); flex-wrap: wrap;
        }
        .pagina-info { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 180px; }
        .pagina-nome { font-size: 13.5px; font-weight: 500; }
        .pagina-meta { font-size: 12px; color: var(--muted); }
        .select-grupo { width: auto; min-width: 130px; }
      `}</style>
    </>
  );
}

// Sem inscrição, a Meta não manda comentário nenhum — e o sintoma seria
// "cadastrei o gatilho e não acontece nada", sem erro em lugar algum. Por isso
// o estado aparece na linha da página, não escondido num detalhe.
function WebhookBadge({ pagina, onReinscrever }) {
  // Default defensivo: um campo ausente na resposta (API mais antiga, deploy
  // pela metade) não pode derrubar a listagem inteira de páginas.
  const webhook = pagina.webhook ?? {};

  if (webhook.inscrito) {
    return (
      <span
        className="badge badge-ok"
        title={`Recebendo comentários de todos os posts desta página desde ${new Date(webhook.desde).toLocaleDateString('pt-BR')}. Vale também para os posts publicados daqui em diante.`}
      >
        Recebendo comentários
      </span>
    );
  }
  return (
    <span className="webhook-off">
      <span className="badge badge-danger" title={webhook.erro ?? undefined}>
        Não recebe comentários
      </span>
      <button className="btn btn-sm" onClick={onReinscrever}>Ativar</button>
      <style>{`.webhook-off { display: inline-flex; align-items: center; gap: 6px; }`}</style>
    </span>
  );
}

function SaudeBadge({ pagina }) {
  const rotulos = {
    ok: ['badge-ok', 'Token válido'],
    token_invalid: ['badge-danger', 'Token inválido'],
    no_permission: ['badge-danger', 'Sem permissão'],
    unknown: ['badge', 'Não verificada'],
  };
  const [classe, texto] = rotulos[pagina.health.status] ?? rotulos.unknown;
  const inativa = pagina.status !== 'active';

  return (
    <span className={`badge ${classe}`} title={pagina.health.reason ?? undefined}>
      {inativa ? 'Fora do rodízio' : texto}
    </span>
  );
}

function GruposCard({ grupos, onNovo, onExcluir }) {
  return (
    <div className="card grupos-card">
      <div className="conta-head">
        <h2 className="section-title">Grupos de páginas</h2>
        <button className="btn btn-sm" onClick={onNovo}>Novo grupo</button>
      </div>

      {grupos.loading && <CardSkeleton lines={2} />}
      {grupos.error && <CardError message={grupos.error.message} />}
      {grupos.data && !grupos.data.length && (
        <p className="empty-state">
          Nenhum grupo ainda. Grupos servem pra selecionar várias páginas de uma vez ao montar uma
          campanha, em vez de marcar uma a uma.
        </p>
      )}
      {grupos.data?.length > 0 && (
        <ul className="grupos">
          {grupos.data.map((g) => (
            <li key={g.id}>
              <span className="grupo-nome">{g.name}</span>
              <span className="badge">{g.pagesCount} página(s)</span>
              <button className="btn btn-sm btn-danger" onClick={() => onExcluir(g)}>Excluir</button>
            </li>
          ))}
        </ul>
      )}

      <style>{`
        .grupos-card { padding: 18px 20px; display: flex; flex-direction: column; gap: 14px; }
        .conta-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .grupos { list-style: none; display: flex; flex-direction: column; gap: 2px; }
        .grupos li {
          display: flex; align-items: center; gap: 10px;
          padding: 9px 0; border-top: 1px solid var(--border);
        }
        .grupo-nome { font-size: 13.5px; flex: 1; }
      `}</style>
    </div>
  );
}

function NovoGrupoModal({ aberto, onFechar, onCriado }) {
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar(e) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      await pageGroupsApi.create(nome);
      setNome('');
      onCriado();
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal aberto={aberto} titulo="Novo grupo de páginas" onFechar={onFechar} largura={420}>
      <form onSubmit={salvar} className="form-col">
        <div className="field">
          <label htmlFor="grupo-nome">Nome do grupo</label>
          <input
            id="grupo-nome"
            className="input"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex: Páginas de receitas"
            autoFocus
          />
        </div>
        {erro && <p className="form-erro">{erro}</p>}
        <div className="form-acoes">
          <button type="button" className="btn" onClick={onFechar}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={salvando || !nome.trim()}>
            {salvando ? 'Criando…' : 'Criar grupo'}
          </button>
        </div>
        <style>{formCss}</style>
      </form>
    </Modal>
  );
}

export const formCss = `
  .form-col { display: flex; flex-direction: column; gap: 14px; }
  .form-erro { font-size: 12.5px; color: var(--danger); }
  .form-acoes { display: flex; justify-content: flex-end; gap: 8px; }
`;
