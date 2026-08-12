import { useRef, useState } from 'react';
import Layout from '../components/Layout.jsx';
import InserirVariavel, { inserirNoCampo } from '../components/InserirVariavel.jsx';
import Modal from '../components/Modal.jsx';
import { CardSkeleton, CardError } from '../components/CardState.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { commentsApi, pagesApi, flowsApi, settingsApi } from '../api/index.js';

export default function Comments() {
  const [versao, setVersao] = useState(0);
  const [editando, setEditando] = useState(null); // regra ou {} para nova
  const [aviso, setAviso] = useState(null);
  const recarregar = () => setVersao((v) => v + 1);

  const regras = useAsync(() => commentsApi.listRules(), [versao]);
  const paginas = useAsync(() => pagesApi.list(), []);
  const fluxos = useAsync(() => flowsApi.list(), []);
  const historico = useAsync(() => commentsApi.list({ perPage: 25 }), [versao]);
  const config = useAsync(() => settingsApi.urls(), []);

  // Responder publicamente no comentário exige pages_manage_engagement. Se ela
  // não está sendo pedida no OAuth, o campo salva normalmente e falha calado na
  // hora do disparo — melhor avisar antes de a pessoa escrever o texto.
  const semRespostaPublica =
    config.data != null && !config.data.permissoes.includes('pages_manage_engagement');

  const opcoesPagina = [...new Map((paginas.data ?? []).map((p) => [p.pageId, p])).values()];

  async function alternar(regra) {
    try {
      await commentsApi.updateRule(regra.id, {
        status: regra.status === 'active' ? 'inactive' : 'active',
      });
      recarregar();
    } catch (err) {
      setAviso({ tipo: 'erro', texto: err.message });
    }
  }

  async function excluir(regra) {
    if (!confirm('Excluir esta regra? Os comentários já capturados continuam no histórico.')) return;
    try {
      await commentsApi.removeRule(regra.id);
      recarregar();
    } catch (err) {
      setAviso({ tipo: 'erro', texto: err.message });
    }
  }

  return (
    <Layout title="Comentários">
      <div className="page-head">
        <div>
          <h1 className="page-title">Auto-resposta de comentários</h1>
          <p className="page-sub">
            Responda automaticamente quem comenta nos posts das suas páginas.
          </p>
        </div>
        <button className="btn btn-dark" onClick={() => setEditando({})}>
          <IconMais /> Nova regra
        </button>
      </div>

      {aviso && <p className="aviso-erro">{aviso.texto}</p>}

      {regras.loading && <div className="card" style={{ padding: 20 }}><CardSkeleton lines={3} /></div>}
      {regras.error && <div className="card" style={{ padding: 20 }}><CardError message={regras.error.message} /></div>}

      {regras.data && !regras.data.length && (
        <div className="card vazio">
          <p className="vazio-titulo">Nenhuma regra ainda</p>
          <p className="empty-state">
            Uma regra define o que acontece quando alguém comenta: responder no comentário, mandar
            DM, colocar a pessoa num fluxo — ou tudo junto.
          </p>
          <button className="btn btn-dark" onClick={() => setEditando({})}>Criar a primeira</button>
        </div>
      )}

      {regras.data?.map((r) => (
        <div className="card regra" key={r.id}>
          <div className="regra-topo">
            <span className="chip">{r.matchType === 'any' ? 'qualquer comentário' : `“${r.keyword}”`}</span>
            <span className="chip">{r.postId ? `post ${r.postId}` : 'todos os posts'}</span>
            {r.flowId && <span className="chip chip-fluxo">fluxo: {r.flowName}</span>}
            <span className="regra-espaco" />
            <span className="regra-contagem">1 página</span>
            <button className="acao acao-texto" onClick={() => excluir(r)}>
              <IconLixeira /> Remover
            </button>
          </div>
          <div className="regra-base">
            <span className="regra-pagina">
              {opcoesPagina.find((p) => p.pageId === r.pageId)?.name ?? r.pageId}
            </span>
            <button className="acao" onClick={() => setEditando(r)} aria-label="Editar regra" title="Editar">
              <IconLapis />
            </button>
            {/* Olho aberto = a regra está respondendo; olho cortado = pausada.
                Um clique alterna. */}
            <button
              className={`acao ${r.status === 'active' ? 'acao-ativa' : ''}`}
              onClick={() => alternar(r)}
              aria-pressed={r.status === 'active'}
              aria-label={r.status === 'active' ? 'Pausar esta regra' : 'Ativar esta regra'}
              title={r.status === 'active' ? 'Ativa — clique para pausar' : 'Pausada — clique para ativar'}
            >
              {r.status === 'active' ? <IconOlho /> : <IconOlhoCortado />}
            </button>
            <button className="acao" onClick={() => excluir(r)} aria-label="Excluir regra" title="Excluir">
              <IconLixeira />
            </button>
          </div>
        </div>
      ))}

      <Historico historico={historico} />

      <RegraModal
        aberto={Boolean(editando)}
        regra={editando}
        paginas={opcoesPagina}
        fluxos={fluxos.data ?? []}
        semRespostaPublica={semRespostaPublica}
        onFechar={() => setEditando(null)}
        onSalvo={() => { setEditando(null); recarregar(); }}
      />

      <style>{`
        .aviso-erro { font-size: 13px; padding: 10px 12px; border-radius: 8px; background: var(--danger-soft); color: var(--danger); }
        .vazio { padding: 36px 28px; display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; }
        .vazio-titulo { font-size: 14px; font-weight: 600; }
        .vazio .empty-state { max-width: 460px; }
        .regra { padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }
        .regra-topo { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
        .regra-espaco { flex: 1; }
        .regra-contagem { font-size: 12.5px; color: var(--muted-2); white-space: nowrap; }
        .chip {
          font-size: 12px; padding: 4px 10px; border-radius: 7px;
          border: 1px solid var(--border); color: var(--muted); white-space: nowrap;
        }
        .chip-fluxo { color: var(--accent-ink); background: var(--accent-soft); border-color: var(--accent-soft); }
        .regra-base { display: flex; align-items: center; gap: 4px; }
        .regra-pagina { font-size: 13.5px; flex: 1; }
        .acao {
          display: inline-flex; align-items: center; gap: 6px;
          border: none; background: transparent; color: var(--muted);
          font-size: 12.5px; padding: 6px; border-radius: 7px;
        }
        .acao:hover { background: var(--surface-2); color: var(--ink); }
        .acao-texto { padding: 6px 8px; }
        .acao-ativa { color: var(--success); }
        .acao-ativa:hover { color: var(--success); }
      `}</style>
    </Layout>
  );
}

function Historico({ historico }) {
  return (
    <div className="card hist">
      <h2 className="section-title">Comentários capturados</h2>

      {historico.loading && <CardSkeleton lines={4} />}
      {historico.error && <CardError message={historico.error.message} />}

      {historico.data && !historico.data.data.length && (
        <p className="empty-state">
          Nenhum comentário capturado ainda. Eles aparecem aqui assim que a Meta começar a enviar os
          eventos da página.
        </p>
      )}

      {historico.data?.data.length > 0 && (
        <div className="tabela-scroll">
          <table className="tabela">
            <thead>
              <tr>
                <th scope="col">Quem comentou</th>
                <th scope="col">Comentário</th>
                <th scope="col">Página</th>
                <th scope="col">Casou</th>
                <th scope="col">Respondido</th>
                <th scope="col">Virou lead</th>
              </tr>
            </thead>
            <tbody>
              {historico.data.data.map((c) => (
                <tr key={c.id}>
                  <td>{c.commenterName ?? '—'}</td>
                  <td className="texto" title={c.text}>{c.text}</td>
                  <td>{c.pageName ?? c.pageId}</td>
                  <td>
                    {c.matchedKeyword
                      ? <span className="badge badge-accent">{c.matchedKeyword}</span>
                      : c.leadId
                        ? <span className="badge">qualquer comentário</span>
                        : <span className="sem">não casou</span>}
                  </td>
                  <td>
                    <span className="respostas">
                      {c.respondeuPublico && <span className="badge badge-ok">no post</span>}
                      {c.respondeuPrivado && <span className="badge badge-ok">DM</span>}
                      {c.erro && <span className="badge badge-danger" title={c.erro}>falhou</span>}
                      {!c.respondeuPublico && !c.respondeuPrivado && !c.erro && <span className="sem">—</span>}
                    </span>
                  </td>
                  <td>{c.leadId ? (c.leadName ?? 'sim') : <span className="sem">não</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <style>{`
        .hist { padding: 18px 20px; display: flex; flex-direction: column; gap: 14px; min-width: 0; }
        .tabela-scroll { overflow-x: auto; }
        .tabela { width: 100%; min-width: 720px; border-collapse: collapse; font-size: 13px; }
        .tabela th {
          text-align: left; font-weight: 500; font-size: 12px; color: var(--muted);
          padding: 0 14px 8px 0; white-space: nowrap; border-bottom: 1px solid var(--border);
        }
        .tabela td { padding: 10px 14px 10px 0; border-bottom: 1px solid var(--border); }
        .tabela tr:last-child td { border-bottom: none; }
        .texto { max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .respostas { display: inline-flex; gap: 4px; flex-wrap: wrap; }
        .sem { color: var(--muted-2); }
      `}</style>
    </div>
  );
}

function RegraModal({ aberto, regra, paginas, fluxos, semRespostaPublica, onFechar, onSalvo }) {
  const [form, setForm] = useState({});
  const campoDm = useRef(null);
  const campoPublico = useRef(null);
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [carregado, setCarregado] = useState(null);

  // Recarrega o formulário ao trocar de regra. Sem isso, abrir a segunda regra
  // mostraria os campos da primeira.
  if (aberto && carregado !== (regra?.id ?? 'nova')) {
    setCarregado(regra?.id ?? 'nova');
    setForm({
      pageId: regra?.pageId ?? '',
      postId: regra?.postId ?? '',
      keyword: regra?.keyword ?? '',
      privateReplyText: regra?.privateReplyText ?? '',
      publicReplyText: regra?.publicReplyText ?? '',
      flowId: regra?.flowId ?? '',
      startNodeId: regra?.startNodeId ?? '',
    });
    setErro(null);
  }

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const fluxoEscolhido = fluxos.find((f) => f.id === form.flowId);

  async function salvar(e) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      const corpo = {
        ...form,
        // Palavra-chave vazia significa "qualquer comentário" — é assim que o
        // campo se explica na tela, e o backend espera o matchType coerente.
        matchType: form.keyword?.trim() ? 'contains' : 'any',
        flowId: form.flowId || null,
        startNodeId: form.startNodeId || null,
        postId: form.postId?.trim() || null,
      };
      if (regra?.id) await commentsApi.updateRule(regra.id, corpo);
      else await commentsApi.createRule(corpo);
      onSalvo();
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      aberto={aberto}
      titulo={regra?.id ? 'Editar regra' : 'Nova regra'}
      onFechar={() => { setCarregado(null); onFechar(); }}
      largura={520}
    >
      <form onSubmit={salvar} className="form-col">
        <p className="modal-sub">
          Quando alguém comentar num post da página, responda automaticamente por DM e/ou no
          comentário.
        </p>

        <div className="field">
          <label htmlFor="r-pagina">Página</label>
          <select id="r-pagina" className="select" value={form.pageId ?? ''} onChange={(e) => set('pageId', e.target.value)}>
            <option value="">Escolha…</option>
            {paginas.map((p) => <option key={p.pageId} value={p.pageId}>{p.name}</option>)}
          </select>
        </div>

        <div className="linha-2">
          <div className="field">
            <label htmlFor="r-post">Post ID <span className="opc">(opcional)</span></label>
            <input id="r-post" className="input" value={form.postId ?? ''} onChange={(e) => set('postId', e.target.value)} placeholder="Vazio = todos os posts" />
          </div>
          <div className="field">
            <label htmlFor="r-kw">Palavra-chave <span className="opc">(opcional)</span></label>
            <input id="r-kw" className="input" value={form.keyword ?? ''} onChange={(e) => set('keyword', e.target.value)} placeholder="Vazio = qualquer comentário" />
          </div>
        </div>

        <div className="field">
          <label htmlFor="r-dm">Resposta privada (DM) — captura o lead</label>
          <textarea ref={campoDm} id="r-dm" className="textarea" value={form.privateReplyText ?? ''} onChange={(e) => set('privateReplyText', e.target.value)} placeholder="Olá {{first_name|amigo}}! Vi seu comentário. Aqui está o link…" />
          <InserirVariavel onInserir={(t) => set('privateReplyText', inserirNoCampo(campoDm.current, form.privateReplyText, t))} />
        </div>

        <div className="field">
          <label htmlFor="r-pub">Resposta pública <span className="opc">(opcional)</span></label>
          <textarea ref={campoPublico} id="r-pub" className="textarea" value={form.publicReplyText ?? ''} onChange={(e) => set('publicReplyText', e.target.value)} placeholder="Te chamamos no privado! 📩" />
          <InserirVariavel onInserir={(t) => set('publicReplyText', inserirNoCampo(campoPublico.current, form.publicReplyText, t))} />
          {semRespostaPublica && (
            <p className="aviso-permissao">
              O app não tem a permissão <code>pages_manage_engagement</code>, então esta resposta
              não vai ser publicada. A DM continua funcionando normalmente. Para liberar, adicione
              o caso de uso <strong>“Gerenciar tudo na sua Página”</strong> no painel da Meta.
            </p>
          )}
        </div>

        <div className="field">
          <label htmlFor="r-fluxo">Responder com um fluxo <span className="opc">(opcional)</span></label>
          <select id="r-fluxo" className="select" value={form.flowId ?? ''} onChange={(e) => { set('flowId', e.target.value); set('startNodeId', ''); }}>
            <option value="">Sem fluxo — usar só o texto acima</option>
            {fluxos.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <span className="field-hint">
            Ao escolher um fluxo, o DM envia o <strong>conteúdo do fluxo</strong> (texto/mídia) no
            lugar do texto privado.
          </span>
        </div>

        {fluxoEscolhido && (
          <div className="field">
            <label htmlFor="r-etapa">Começar na etapa <span className="opc">(opcional)</span></label>
            <select id="r-etapa" className="select" value={form.startNodeId ?? ''} onChange={(e) => set('startNodeId', e.target.value)}>
              <option value="">Início do fluxo (padrão)</option>
              {fluxoEscolhido.nodes.map((n) => (
                <option key={n.id} value={n.id}>{resumoDoBloco(n)}</option>
              ))}
            </select>
            <span className="field-hint">
              O gatilho dispara a partir dessa etapa — útil pra pular a saudação e cair direto na
              oferta. Deixe no padrão para começar do início.
            </span>
          </div>
        )}

        {erro && <p className="form-erro">{erro}</p>}

        <div className="form-acoes">
          <button type="button" className="btn btn-ghost" onClick={() => { setCarregado(null); onFechar(); }}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-dark" disabled={salvando || !form.pageId}>
            <IconCheck /> {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>

        <style>{`
          .form-col { display: flex; flex-direction: column; gap: 14px; }
          .modal-sub { font-size: 12.5px; color: var(--muted); line-height: 1.5; margin-top: -4px; }
          .form-erro { font-size: 12.5px; color: var(--danger); }
          .form-acoes { display: flex; justify-content: flex-end; gap: 8px; align-items: center; }
          .linha-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
          .opc { color: var(--muted-2); font-weight: 400; }
          .field-hint strong { color: var(--muted); font-weight: 600; }
          .aviso-permissao {
            margin: 6px 0 0; font-size: 12px; line-height: 1.5; color: #9a3412;
            background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 8px 10px;
          }
          .aviso-permissao code {
            background: #ffedd5; padding: 1px 5px; border-radius: 4px; font-size: 11.5px;
          }
        `}</style>
      </form>
    </Modal>
  );
}

// Ícones das ações da regra. Inline por consistência com o resto do projeto —
// nenhuma dependência de fonte de ícone.
function Svg({ children, size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

const IconMais = () => <Svg size={14}><path d="M12 5v14M5 12h14" /></Svg>;
const IconCheck = () => <Svg size={14}><path d="M20 6L9 17l-5-5" /></Svg>;
const IconLapis = () => (
  <Svg><path d="M4 20h4l10-10a2.5 2.5 0 0 0-3.5-3.5L4.5 16.5V20z" /></Svg>
);
const IconLixeira = () => (
  <Svg><path d="M4 7h16" /><path d="M9 7V5h6v2" /><path d="M6 7l1 13h10l1-13" /></Svg>
);
const IconOlho = () => (
  <Svg><path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z" /><circle cx="12" cy="12" r="3" /></Svg>
);
const IconOlhoCortado = () => (
  <Svg>
    <path d="M2 12s3.6-6 10-6c1.5 0 2.9.3 4.1.8" />
    <path d="M22 12s-3.6 6-10 6c-1.6 0-3-.3-4.2-.9" />
    <path d="M4 4l16 16" />
  </Svg>
);

function resumoDoBloco(n) {
  const c = n.config ?? {};
  const rotulos = {
    message: `Mensagem: ${(c.text ?? '').slice(0, 34)}`,
    wait: `Espera: ${c.duration_seconds}s`,
    tag: `Tag: ${c.tag_name}`,
    condition: `Condição: ${c.tag_to_check}`,
  };
  return rotulos[n.type] ?? n.id;
}
