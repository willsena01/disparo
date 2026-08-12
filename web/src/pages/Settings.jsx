import { useState } from 'react';
import Layout from '../components/Layout.jsx';
import Modal from '../components/Modal.jsx';
import { CardSkeleton, CardError } from '../components/CardState.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { appsApi, settingsApi } from '../api/index.js';

export default function Settings() {
  const [versao, setVersao] = useState(0);
  const [novo, setNovo] = useState(false);
  const [aviso, setAviso] = useState(null);
  const recarregar = () => setVersao((v) => v + 1);

  const apps = useAsync(() => appsApi.list(), [versao]);
  const urls = useAsync(() => settingsApi.urls(), []);

  async function excluir(app) {
    if (!confirm(`Excluir o app "${app.name}"?`)) return;
    try {
      await appsApi.remove(app.id);
      recarregar();
    } catch (err) {
      setAviso({ tipo: 'erro', texto: err.message });
    }
  }

  // Um app é bloqueado sozinho quando bate o limite de mensagens ou a Meta o
  // restringe. Sem esta ação não havia como trazê-lo de volta pela interface —
  // o operador ficava travado justamente depois de resolver a causa.
  async function reativar(app) {
    setAviso(null);
    try {
      await appsApi.update(app.id, { status: 'active' });
      setAviso({
        tipo: 'ok',
        texto: `"${app.name}" voltou para o rodízio de envio.`,
      });
      recarregar();
    } catch (err) {
      setAviso({ tipo: 'erro', texto: err.message });
    }
  }

  return (
    <Layout title="Configurações">
      <div className="page-head">
        <div>
          <h1 className="page-title">Configurações</h1>
          <p className="page-sub">Conexão com o Facebook e URLs para o painel do Meta.</p>
        </div>
        <button className="btn btn-dark" onClick={() => setNovo(true)}>+ Adicionar app</button>
      </div>

      {aviso && <p className="aviso-erro">{aviso.texto}</p>}

      <Passos />

      {urls.data && !urls.data.prontoParaProducao && (
        <p className="aviso-alerta">{urls.data.avisoUrl}</p>
      )}

      {/* Os apps vêm antes das URLs porque o token de verificação é POR APP:
          sem um app cadastrado não há o que colar no painel. */}
      <div className="card secao">
        <div className="secao-head">
          <h2 className="section-title">Apps do Facebook</h2>
          <span className="secao-sub">{apps.data?.length ?? 0} cadastrado(s)</span>
        </div>

        {apps.loading && <CardSkeleton lines={3} />}
        {apps.error && <CardError message={apps.error.message} />}

        {apps.data && !apps.data.length && (
          <p className="empty-state">
            Nenhum app ainda. Crie um app em <strong>developers.facebook.com</strong>, adicione o
            produto <strong>Messenger</strong> e cadastre aqui o App ID e o App Secret — é o que
            libera conectar páginas e receber comentários.
          </p>
        )}

        {apps.data?.map((a) => (
          <AppCard key={a.id} app={a} onExcluir={excluir} onReativar={reativar} />
        ))}

        {/* A rotação é o motivo de existir mais de um app; sem explicar isso,
            "adicionar app" parece redundante. */}
        <p className="nota">
          Conectar a <strong>mesma página por mais de um app</strong> é o que permite continuar
          enviando quando um deles é bloqueado pelo Facebook: o sistema pula para o próximo
          sozinho, sem interromper o disparo.
        </p>
      </div>

      <UrlsCard urls={urls} />

      <NovoAppModal
        aberto={novo}
        onFechar={() => setNovo(false)}
        onCriado={() => { setNovo(false); recarregar(); }}
      />

      <style>{`
        .aviso-erro { font-size: 13px; padding: 10px 12px; border-radius: 8px; background: var(--danger-soft); color: var(--danger); }
        .aviso-alerta { font-size: 12.5px; line-height: 1.5; padding: 10px 12px; border-radius: 8px; background: var(--warning-soft); color: var(--warning); }
        .secao { padding: 18px 20px; display: flex; flex-direction: column; gap: 14px; }
        .secao-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
        .secao-sub { font-size: 12px; color: var(--muted-2); }
        .nota { font-size: 12px; color: var(--muted); line-height: 1.55; }
        .nota strong { color: var(--ink); font-weight: 600; }
      `}</style>
    </Layout>
  );
}

// Checklist do que fazer no painel do Meta. A ordem importa: cadastrar o app
// aqui vem antes de colar a Callback URL lá, porque o token de verificação só
// existe depois do cadastro.
function Passos() {
  return (
    <div className="card passos">
      <h2 className="section-title">Como conectar</h2>
      <ol>
        <li>
          Em <strong>developers.facebook.com</strong>, crie um app do tipo <em>Empresa</em> e
          adicione o produto <strong>Messenger</strong>.
        </li>
        <li>
          Copie o <strong>App ID</strong> e o <strong>App Secret</strong> (Configurações → Básico) e
          cadastre no botão “Adicionar app” aqui em cima.
        </li>
        <li>
          Volte ao painel do Meta, vá em <strong>Webhooks → Page</strong> e cole a{' '}
          <strong>Callback URL</strong> e o <strong>Token de verificação</strong> que aparecem
          abaixo. Assine os campos listados.
        </li>
        <li>
          Cole também o <strong>OAuth Redirect URI</strong> em Login do Facebook → Configurações.
        </li>
        <li>
          Volte em <strong>Páginas</strong> e use “Conectar com Facebook”. A partir daí todo post
          da página — inclusive os futuros — já dispara os gatilhos.
        </li>
      </ol>
      <style>{`
        .passos { padding: 18px 20px; display: flex; flex-direction: column; gap: 12px; }
        .passos ol { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 8px; }
        .passos li { font-size: 12.5px; color: var(--muted); line-height: 1.55; }
        .passos strong { color: var(--ink); font-weight: 600; }
        .passos em { font-style: normal; color: var(--ink); }
      `}</style>
    </div>
  );
}

function AppCard({ app, onExcluir, onReativar }) {
  const pct = app.pctUsed == null ? null : Math.round(app.pctUsed * 100);
  const status = {
    active: ['badge-ok', 'Ativo'],
    blocked: ['badge-danger', 'Bloqueado'],
    disabled: ['badge', 'Desativado'],
  }[app.status] ?? ['badge', app.status];

  return (
    <div className="app-card">
      <div className="app-head">
        <span className="app-nome">{app.name}</span>
        <span className={`badge ${status[0]}`} title={app.blockedReason ?? undefined}>{status[1]}</span>
        <span className="app-espaco" />
        {app.status === 'blocked' && (
          <button className="btn btn-sm" onClick={() => onReativar(app)}>Reativar</button>
        )}
        <button className="btn btn-sm btn-danger" onClick={() => onExcluir(app)}>Excluir</button>
      </div>

      {/* Dizer POR QUE bloqueou é o que separa "reativar e resolver" de
          "reativar e bloquear de novo em cinco minutos". */}
      {app.status === 'blocked' && (
        <p className="app-motivo">
          <strong>Bloqueado:</strong> {app.blockedReason ?? 'motivo não registrado'}
          {app.blockedAt && ` · ${new Date(app.blockedAt).toLocaleString('pt-BR')}`}
          <br />
          Enquanto estiver assim, este app não envia mensagem. Resolva a causa no painel do Meta
          antes de reativar — senão ele volta a bloquear no primeiro envio.
        </p>
      )}

      <div className="app-campos">
        <Copiavel rotulo="App ID" valor={app.appId} />
        <Copiavel rotulo="Token de verificação do Webhook" valor={app.webhookVerifyToken} segredo />
      </div>

      <div className="app-meta">
        <span>{app.pagesCount} página(s)</span>
        <span>·</span>
        <span>App Secret {app.appSecretMasked}</span>
      </div>

      {pct != null ? (
        <>
          <div className="limite-barra">
            <div className="limite-fill" style={{ width: `${Math.min(100, pct)}%`, background: pct >= 90 ? 'var(--danger)' : 'var(--accent)' }} />
          </div>
          <span className="limite-texto tabular">
            {app.messagesUsed.toLocaleString('pt-BR')} / {app.messageLimit.toLocaleString('pt-BR')} mensagens ({pct}%)
          </span>
        </>
      ) : (
        <span className="limite-texto">
          {app.messagesUsed.toLocaleString('pt-BR')} mensagens enviadas · sem teto configurado
        </span>
      )}

      <style>{`
        .app-card { border: 1px solid var(--border); border-radius: 10px; padding: 14px; display: flex; flex-direction: column; gap: 10px; }
        .app-head { display: flex; align-items: center; gap: 8px; }
        .app-nome { font-size: 13.5px; font-weight: 600; }
        .app-espaco { flex: 1; }
        .app-campos { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 10px; }
        .app-meta { display: flex; gap: 7px; font-size: 11.5px; color: var(--muted-2); flex-wrap: wrap; }
        .limite-barra { height: 6px; border-radius: 999px; background: var(--surface-2); overflow: hidden; }
        .limite-fill { height: 100%; border-radius: 999px; }
        .limite-texto { font-size: 11.5px; color: var(--muted); }
        .app-motivo {
          font-size: 11.5px; line-height: 1.5; color: var(--warning);
          background: var(--warning-soft); padding: 9px 11px; border-radius: 8px;
        }
      `}</style>
    </div>
  );
}

function UrlsCard({ urls }) {
  return (
    <div className="card secao">
      <div className="secao-head">
        <h2 className="section-title">URLs para o painel do Facebook</h2>
      </div>

      {urls.loading && <CardSkeleton lines={4} />}
      {urls.error && <CardError message={urls.error.message} />}

      {urls.data && (
        <>
          {urls.data.empresa?.aviso && (
            <p className="aviso-alerta">{urls.data.empresa.aviso}</p>
          )}

          {urls.data.campos.map((c) => (
            <Copiavel
              key={c.chave} rotulo={c.rotulo} valor={c.valor} onde={c.onde}
              alerta={c.precisaDeIdentificacao} rotuloAlerta="falta identificar a empresa"
              abrir={['privacidade', 'termos'].includes(c.chave)}
            />
          ))}

          <div className="listas">
            <div>
              <span className="lista-titulo">Campos a assinar no Webhook</span>
              <div className="lista-itens">
                {urls.data.camposDoWebhook.map((c) => <code key={c}>{c}</code>)}
              </div>
            </div>
            <div>
              <span className="lista-titulo">Permissões pedidas no OAuth</span>
              <div className="lista-itens">
                {urls.data.permissoes.map((p) => <code key={p}>{p}</code>)}
              </div>
            </div>
          </div>

          <p className="nota">
            <strong>Política de Privacidade e Termos já estão publicados</strong> nesses endereços e
            descrevem exatamente o que a ferramenta coleta e faz. Abra e revise antes de enviar o
            app para revisão — e considere passar por um advogado, porque quem responde pelo texto
            é você, não a ferramenta.
          </p>
        </>
      )}

      <style>{`
        .listas { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; }
        .lista-titulo { font-size: 12px; color: var(--muted); display: block; margin-bottom: 6px; }
        .lista-itens { display: flex; flex-wrap: wrap; gap: 5px; }
        .lista-itens code {
          font-size: 11.5px; background: var(--surface-2); color: var(--muted);
          padding: 3px 8px; border-radius: 6px;
        }
      `}</style>
    </div>
  );
}

// Campo somente-leitura com botão de copiar. O valor fica selecionável mesmo
// assim: copiar pelo teclado é o reflexo de muita gente.
function Copiavel({ rotulo, valor, onde, segredo, alerta, rotuloAlerta, abrir }) {
  const [copiado, setCopiado] = useState(false);
  const [revelado, setRevelado] = useState(!segredo);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(valor ?? '');
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1600);
    } catch {
      // Sem permissão de clipboard (http, por exemplo): selecionar deixa o
      // Ctrl+C funcionar, em vez de simplesmente não acontecer nada.
      const el = document.getElementById(`copiavel-${rotulo}`);
      el?.select();
    }
  }

  return (
    <div className="copiavel">
      <span className="copiavel-rotulo">
        {rotulo}
        {alerta && <span className="badge badge-warn">{rotuloAlerta ?? 'precisa existir'}</span>}
      </span>
      <div className="copiavel-linha">
        <input
          id={`copiavel-${rotulo}`} className="input" readOnly
          value={revelado ? (valor ?? '') : '•'.repeat(Math.min(28, (valor ?? '').length))}
          onFocus={(e) => e.target.select()}
        />
        {segredo && (
          <button type="button" className="btn btn-sm" onClick={() => setRevelado((v) => !v)}>
            {revelado ? 'Ocultar' : 'Ver'}
          </button>
        )}
        <button type="button" className="btn btn-sm" onClick={copiar}>
          {copiado ? '✓ Copiado' : 'Copiar'}
        </button>
        {/* Para as páginas públicas, poder abrir e conferir o que está no ar
            vale mais que copiar a URL. */}
        {abrir && (
          <a className="btn btn-sm" href={valor} target="_blank" rel="noreferrer">Abrir</a>
        )}
      </div>
      {onde && <span className="copiavel-onde">{onde}</span>}

      <style>{`
        .copiavel { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
        .copiavel-rotulo { font-size: 12.5px; color: var(--muted); display: flex; align-items: center; gap: 7px; }
        .copiavel-linha { display: flex; gap: 6px; }
        .copiavel-linha .input { font-family: ui-monospace, 'Cascadia Code', Consolas, monospace; font-size: 12px; }
        .copiavel-onde { font-size: 11px; color: var(--muted-2); line-height: 1.4; }
      `}</style>
    </div>
  );
}

function NovoAppModal({ aberto, onFechar, onCriado }) {
  const [form, setForm] = useState({ name: '', appId: '', appSecret: '', messageLimit: '' });
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function salvar(e) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      await appsApi.create({
        name: form.name,
        appId: form.appId,
        appSecret: form.appSecret,
        messageLimit: form.messageLimit ? Number(form.messageLimit) : null,
      });
      setForm({ name: '', appId: '', appSecret: '', messageLimit: '' });
      onCriado();
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal aberto={aberto} titulo="Adicionar app do Facebook" onFechar={onFechar} largura={480}>
      <form onSubmit={salvar} className="form-col">
        <p className="modal-sub">
          Pegue esses valores em developers.facebook.com → seu app → Configurações → Básico.
        </p>

        <div className="field">
          <label htmlFor="a-nome">Apelido</label>
          <input id="a-nome" className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="App principal" autoFocus />
          <span className="field-hint">Só para você identificar aqui dentro.</span>
        </div>

        <div className="field">
          <label htmlFor="a-id">App ID</label>
          <input id="a-id" className="input" value={form.appId} onChange={(e) => set('appId', e.target.value)} />
        </div>

        <div className="field">
          <label htmlFor="a-secret">App Secret</label>
          <input id="a-secret" type="password" className="input" value={form.appSecret} onChange={(e) => set('appSecret', e.target.value)} />
          {/* Vale dizer por quê: o App Secret assina o webhook, então é ele que
              impede alguém de forjar comentário. */}
          <span className="field-hint">
            É com ele que validamos a assinatura do webhook — sem isso qualquer um poderia forjar
            um comentário. Não é exibido de volta depois de salvo.
          </span>
        </div>

        <div className="field">
          <label htmlFor="a-limite">Limite de mensagens (opcional)</label>
          <input id="a-limite" type="number" min="1" className="input" value={form.messageLimit} onChange={(e) => set('messageLimit', e.target.value)} placeholder="sem teto" />
          <span className="field-hint">
            Ao atingir esse número o app sai do rodízio sozinho e o próximo assume.
          </span>
        </div>

        {erro && <p className="form-erro">{erro}</p>}

        <div className="form-acoes">
          <button type="button" className="btn btn-ghost" onClick={onFechar}>Cancelar</button>
          <button type="submit" className="btn btn-dark" disabled={salvando || !form.name.trim() || !form.appId.trim() || !form.appSecret.trim()}>
            {salvando ? 'Salvando…' : 'Adicionar app'}
          </button>
        </div>

        <style>{`
          .form-col { display: flex; flex-direction: column; gap: 14px; }
          .modal-sub { font-size: 12.5px; color: var(--muted); line-height: 1.5; margin-top: -4px; }
          .form-erro { font-size: 12.5px; color: var(--danger); }
          .form-acoes { display: flex; justify-content: flex-end; gap: 8px; }
        `}</style>
      </form>
    </Modal>
  );
}
