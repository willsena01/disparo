import { useState } from 'react';
import Layout from '../components/Layout.jsx';
import Modal from '../components/Modal.jsx';
import { CardSkeleton, CardError } from '../components/CardState.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { templatesApi, pagesApi } from '../api/index.js';
import { IconTemplate } from '../icons/index.jsx';

const STATUS = {
  approved: ['badge-ok', 'Aprovado'],
  pending: ['badge-warn', 'Pendente'],
  rejected: ['badge-danger', 'Rejeitado'],
};

export default function Templates() {
  const [versao, setVersao] = useState(0);
  const [pageId, setPageId] = useState('');
  const [novo, setNovo] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [sincronizando, setSincronizando] = useState(false);
  const recarregar = () => setVersao((v) => v + 1);

  const lista = useAsync(() => templatesApi.list(pageId), [versao, pageId]);
  const paginas = useAsync(() => pagesApi.list(), []);
  const opcoesPagina = [...new Map((paginas.data ?? []).map((p) => [p.pageId, p])).values()];

  async function sincronizar() {
    setSincronizando(true);
    setAviso(null);
    try {
      const r = await templatesApi.sync();
      setAviso({
        tipo: r.rejeitados ? 'alerta' : 'ok',
        texto: `${r.total} template(s) verificados: ${r.aprovados} aprovados, ${r.pendentes} pendentes, ${r.rejeitados} rejeitados.`,
      });
      recarregar();
    } catch (err) {
      setAviso({ tipo: 'erro', texto: err.message });
    } finally {
      setSincronizando(false);
    }
  }

  async function excluir(t) {
    if (!confirm(`Excluir o template "${t.name}"?`)) return;
    try {
      await templatesApi.remove(t.id);
      recarregar();
    } catch (err) {
      setAviso({ tipo: 'erro', texto: err.message });
    }
  }

  return (
    <Layout title="Templates">
      <div className="page-head">
        <div>
          <h1 className="page-title">Templates</h1>
          <p className="page-sub">
            Conteúdo para falar com quem está fora da janela de 24 horas.
          </p>
        </div>
        <div className="page-actions">
          <select
            className="select" value={pageId} onChange={(e) => setPageId(e.target.value)}
            aria-label="Filtrar por página" style={{ width: 'auto' }}
          >
            <option value="">Todas as páginas</option>
            {opcoesPagina.map((p) => <option key={p.pageId} value={p.pageId}>{p.name}</option>)}
          </select>
          <button className="btn" onClick={sincronizar} disabled={sincronizando}>
            {sincronizando ? 'Sincronizando…' : 'Sincronizar todas'}
          </button>
          <button className="btn btn-primary" onClick={() => setNovo(true)}>Novo template</button>
        </div>
      </div>

      {/* Sem esta explicação, "Pendente" parece fila de aprovação da Meta — e
          o operador espera por um retorno que nunca vai chegar. */}
      <p className="nota">
        O Messenger não revisa template por template (isso é do WhatsApp). Aqui o que libera o envio
        fora da janela é a <strong>message tag</strong>, e o que a Meta revisa é o recurso de
        mensagens da <strong>página</strong>. É isso que "Sincronizar todas" consulta.
      </p>

      {aviso && <p className={`aviso aviso-${aviso.tipo}`}>{aviso.texto}</p>}

      {lista.loading && <div className="card" style={{ padding: 20 }}><CardSkeleton lines={4} /></div>}
      {lista.error && <div className="card" style={{ padding: 20 }}><CardError message={lista.error.message} /></div>}

      {lista.data && !lista.data.length && (
        <div className="card vazio">
          <span className="vazio-icone" aria-hidden="true"><IconTemplate size={26} /></span>
          <p className="vazio-titulo">Nenhum template ainda</p>
          <p className="empty-state">
            {pageId
              ? 'Nenhum template para esta página. Troque o filtro ou crie um novo.'
              : 'Sem template, uma campanha não consegue falar com quem interagiu há mais de 24 horas — esses leads são simplesmente pulados.'}
          </p>
          <button className="btn btn-primary" onClick={() => setNovo(true)}>Criar o primeiro</button>
        </div>
      )}

      {lista.data?.length > 0 && (
        <div className="grade">
          {lista.data.map((t) => (
            <div className="card template" key={t.id}>
              <div className="template-head">
                <span className="template-nome">{t.name}</span>
                <span className={`badge ${STATUS[t.metaStatus]?.[0] ?? ''}`} title={t.metaStatusReason ?? undefined}>
                  {STATUS[t.metaStatus]?.[1] ?? t.metaStatus}
                </span>
              </div>
              <p className="template-texto">{t.content?.text}</p>
              {t.content?.buttons?.length > 0 && (
                <div className="template-botoes">
                  {t.content.buttons.map((b, i) => <span className="botao-preview" key={i}>{b.title}</span>)}
                </div>
              )}
              <div className="template-rodape">
                <span className="badge badge-accent" title={t.messageTagLabel ?? undefined}>{t.messageTag}</span>
                <span className="template-meta">
                  {t.pageId ? (opcoesPagina.find((p) => p.pageId === t.pageId)?.name ?? t.pageId) : 'Todas as páginas'}
                  {t.metaSyncedAt && ` · sincronizado ${new Date(t.metaSyncedAt).toLocaleDateString('pt-BR')}`}
                </span>
                <button className="btn btn-sm btn-danger" onClick={() => excluir(t)}>Excluir</button>
              </div>
              {t.metaStatusReason && <p className="template-motivo">{t.metaStatusReason}</p>}
            </div>
          ))}
        </div>
      )}

      <NovoTemplateModal
        aberto={novo}
        paginas={opcoesPagina}
        onFechar={() => setNovo(false)}
        onCriado={() => { setNovo(false); recarregar(); }}
      />

      <style>{`
        .nota { font-size: 12.5px; color: var(--muted); line-height: 1.55; }
        .nota strong { color: var(--ink); font-weight: 600; }
        .aviso { font-size: 13px; padding: 10px 12px; border-radius: 8px; }
        .aviso-ok { background: var(--success-soft); color: var(--success); }
        .aviso-alerta { background: var(--warning-soft); color: var(--warning); }
        .aviso-erro { background: var(--danger-soft); color: var(--danger); }
        .vazio {
          padding: 40px 28px; display: flex; flex-direction: column;
          align-items: center; text-align: center; gap: 10px;
        }
        .vazio-icone {
          width: 52px; height: 52px; border-radius: 14px; display: grid; place-items: center;
          background: var(--surface-2); color: var(--muted);
        }
        .vazio-titulo { font-size: 14px; font-weight: 600; }
        .vazio .empty-state { max-width: 420px; }
        .grade { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 14px; }
        .template { padding: 16px 18px; display: flex; flex-direction: column; gap: 10px; }
        .template-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .template-nome { font-size: 13.5px; font-weight: 600; }
        .template-texto {
          font-size: 13px; color: var(--muted); line-height: 1.5;
          background: var(--surface-2); padding: 10px 12px; border-radius: 8px;
        }
        .template-botoes { display: flex; gap: 6px; flex-wrap: wrap; }
        .botao-preview {
          font-size: 12px; padding: 5px 12px; border-radius: 7px;
          border: 1px solid var(--border); color: var(--accent-ink);
        }
        .template-rodape { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .template-meta { font-size: 11.5px; color: var(--muted-2); flex: 1; }
        .template-motivo { font-size: 11.5px; color: var(--muted); line-height: 1.45; }
      `}</style>
    </Layout>
  );
}

function NovoTemplateModal({ aberto, paginas, onFechar, onCriado }) {
  const [nome, setNome] = useState('');
  const [texto, setTexto] = useState('');
  const [messageTag, setMessageTag] = useState('');
  const [pageId, setPageId] = useState('');
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const tags = useAsync(() => templatesApi.messageTags(), [aberto]);

  async function salvar(e) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      await templatesApi.create({
        name: nome,
        content: { text: texto },
        messageTag,
        pageId: pageId || undefined,
      });
      setNome(''); setTexto(''); setMessageTag(''); setPageId('');
      onCriado();
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  const descricao = (tags.data ?? []).find((t) => t.tag === messageTag)?.descricao;

  return (
    <Modal aberto={aberto} titulo="Novo template" onFechar={onFechar} largura={520}>
      <form onSubmit={salvar} className="form-col">
        <div className="field">
          <label htmlFor="t-nome">Nome</label>
          <input id="t-nome" className="input" value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />
        </div>

        <div className="field">
          <label htmlFor="t-tag">Message tag</label>
          <select id="t-tag" className="select" value={messageTag} onChange={(e) => setMessageTag(e.target.value)}>
            <option value="">Escolha…</option>
            {(tags.data ?? []).map((t) => <option key={t.tag} value={t.tag}>{t.tag}</option>)}
          </select>
          {/* A tag precisa combinar com o conteúdo: usar ACCOUNT_UPDATE pra
              mandar promoção é o caminho conhecido pra restrição do app. */}
          <span className="field-hint">
            {descricao
              ? `${descricao}. O conteúdo precisa combinar com a tag — usar a tag errada é o que leva o app a ser restringido.`
              : 'A Meta só aceita estas quatro tags fora da janela de 24h.'}
          </span>
        </div>

        <div className="field">
          <label htmlFor="t-texto">Conteúdo</label>
          <textarea id="t-texto" className="textarea" value={texto} onChange={(e) => setTexto(e.target.value)} />
        </div>

        <div className="field">
          <label htmlFor="t-pagina">Página (opcional)</label>
          <select id="t-pagina" className="select" value={pageId} onChange={(e) => setPageId(e.target.value)}>
            <option value="">Vale para todas</option>
            {paginas.map((p) => <option key={p.pageId} value={p.pageId}>{p.name}</option>)}
          </select>
        </div>

        {erro && <p className="form-erro">{erro}</p>}

        <div className="form-acoes">
          <button type="button" className="btn" onClick={onFechar}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={salvando || !nome.trim() || !texto.trim() || !messageTag}>
            {salvando ? 'Criando…' : 'Criar template'}
          </button>
        </div>

        <style>{`
          .form-col { display: flex; flex-direction: column; gap: 14px; }
          .form-erro { font-size: 12.5px; color: var(--danger); }
          .form-acoes { display: flex; justify-content: flex-end; gap: 8px; }
        `}</style>
      </form>
    </Modal>
  );
}
