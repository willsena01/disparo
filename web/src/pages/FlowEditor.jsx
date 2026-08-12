import { useCallback, useEffect, useRef, useState } from 'react';
import Layout from '../components/Layout.jsx';
import FlowCanvas from '../components/flow/FlowCanvas.jsx';
import NodeConfigModal from '../components/flow/NodeConfigModal.jsx';
import TriggersModal from '../components/flow/TriggersModal.jsx';
import TestPanel from '../components/flow/TestPanel.jsx';
import { TIPOS, ORDEM_DA_PALETA, comDestino, novoId } from '../components/flow/nodeTypes.js';
import { flowsApi } from '../api/index.js';

export default function FlowEditor() {
  const [fluxos, setFluxos] = useState([]);
  const [flow, setFlow] = useState(null);          // fluxo aberto (do servidor)
  const [nome, setNome] = useState('');
  const [nodes, setNodes] = useState([]);
  const [firstNodeId, setFirstNodeId] = useState(null);
  const [sujo, setSujo] = useState(false);

  const [selecionado, setSelecionado] = useState(null);
  const [ligando, setLigando] = useState(null);     // { nodeId, saida }
  const [configDe, setConfigDe] = useState(null);
  const [gatilhos, setGatilhos] = useState(false);
  const [passoAceso, setPassoAceso] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const inputImportar = useRef(null);

  const carregarLista = useCallback(async () => {
    const l = await flowsApi.list();
    setFluxos(l);
    return l;
  }, []);

  useEffect(() => {
    carregarLista().then((l) => {
      if (l.length) abrir(l[0].id);
    }).catch((e) => setAviso({ tipo: 'erro', texto: e.message }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Esc cancela a ligação em curso — sem saída, o clique seguinte no canvas
  // ligaria num bloco qualquer sem querer.
  useEffect(() => {
    function aoTeclar(e) {
      if (e.key === 'Escape' && ligando) setLigando(null);
    }
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [ligando]);

  async function abrir(id) {
    try {
      const f = await flowsApi.get(id);
      setFlow(f);
      setNome(f.name);
      setNodes(f.nodes);
      setFirstNodeId(f.firstNodeId || f.nodes[0]?.id || null);
      setSelecionado(null);
      setSujo(false);
      setAviso(null);
    } catch (err) {
      setAviso({ tipo: 'erro', texto: err.message });
    }
  }

  async function novo() {
    try {
      const f = await flowsApi.create({ name: 'Fluxo sem título' });
      await carregarLista();
      await abrir(f.id);
    } catch (err) {
      setAviso({ tipo: 'erro', texto: err.message });
    }
  }

  async function salvar() {
    if (!flow) return;
    setSalvando(true);
    setAviso(null);
    try {
      const f = await flowsApi.update(flow.id, { name: nome, nodes, firstNodeId });
      setFlow(f);
      setSujo(false);
      await carregarLista();
      setAviso({ tipo: 'ok', texto: 'Fluxo salvo.' });
    } catch (err) {
      setAviso({ tipo: 'erro', texto: err.message });
    } finally {
      setSalvando(false);
    }
  }

  async function alternarStatus(f) {
    const novoStatus = f.status === 'active' ? 'inactive' : 'active';
    await flowsApi.update(f.id, { status: novoStatus });
    const l = await carregarLista();
    if (flow?.id === f.id) setFlow(l.find((x) => x.id === f.id) ?? flow);
  }

  async function excluir(f) {
    if (!confirm(`Excluir o fluxo "${f.name}"?`)) return;
    try {
      await flowsApi.remove(f.id);
      const l = await carregarLista();
      if (flow?.id === f.id) {
        if (l.length) abrir(l[0].id);
        else { setFlow(null); setNodes([]); setNome(''); }
      }
    } catch (err) {
      setAviso({ tipo: 'erro', texto: err.message });
    }
  }

  // ------------------------------------------------------------ canvas ---

  function mudarNodes(fn) {
    setNodes(fn);
    setSujo(true);
  }

  function soltarNovo(tipo, x, y) {
    const id = novoId();
    const node = {
      id, type: tipo, config: TIPOS[tipo].configPadrao(),
      position_x: x, position_y: y, next_node_id: null,
    };

    mudarNodes((atuais) => {
      // Conecta automaticamente a partir do bloco selecionado quando a saída
      // dele está livre: encadear é o caso comum, e obrigar a ligar na mão a
      // cada bloco novo transforma o caminho feliz em trabalho manual.
      const sel = atuais.find((n) => n.id === selecionado);
      if (sel && TIPOS[sel.type].saidas.includes('next') && !sel.next_node_id) {
        return [...atuais.map((n) => (n.id === sel.id ? { ...n, next_node_id: id } : n)), node];
      }
      return [...atuais, node];
    });

    if (!nodes.length) setFirstNodeId(id);
    setSelecionado(id);
  }

  function mover(id, x, y) {
    mudarNodes((atuais) => atuais.map((n) => (n.id === id ? { ...n, position_x: x, position_y: y } : n)));
  }

  function concluirLigacao(alvoId) {
    if (!ligando) return;
    if (ligando.nodeId === alvoId) { setLigando(null); return; }
    mudarNodes((atuais) =>
      atuais.map((n) => (n.id === ligando.nodeId ? comDestino(n, ligando.saida, alvoId) : n))
    );
    setLigando(null);
  }

  function salvarConfig({ config, next }) {
    mudarNodes((atuais) =>
      atuais.map((n) => (n.id === configDe ? { ...n, config, next_node_id: next } : n))
    );
    setConfigDe(null);
  }

  // Duplicar cria uma cópia deslocada e desconectada: herdar o next_node_id
  // faria os dois blocos apontarem pro mesmo lugar, o que quase nunca é a
  // intenção de quem duplica.
  function duplicarNode(id) {
    const original = nodes.find((n) => n.id === id);
    if (!original) return;
    const novo = {
      ...original,
      id: novoId(),
      config: JSON.parse(JSON.stringify(original.config ?? {})),
      position_x: (original.position_x ?? 0) + 40,
      position_y: (original.position_y ?? 0) + 40,
      next_node_id: null,
    };
    mudarNodes((atuais) => [...atuais, novo]);
    setConfigDe(null);
    setSelecionado(novo.id);
  }

  function excluirNode(id) {
    mudarNodes((atuais) =>
      atuais
        .filter((n) => n.id !== id)
        // Limpa os ponteiros que sobraram: um next_node_id apontando pra bloco
        // apagado é recusado no salvamento, e o erro apareceria longe da causa.
        .map((n) => ({
          ...n,
          next_node_id: n.next_node_id === id ? null : n.next_node_id,
          config: {
            ...n.config,
            true_branch_node_id: n.config?.true_branch_node_id === id ? null : n.config?.true_branch_node_id,
            false_branch_node_id: n.config?.false_branch_node_id === id ? null : n.config?.false_branch_node_id,
          },
        }))
    );
    if (firstNodeId === id) setFirstNodeId(nodes.find((n) => n.id !== id)?.id ?? null);
    setConfigDe(null);
    setSelecionado(null);
  }

  // ---------------------------------------------------- importar/exportar ---

  function exportar() {
    const dados = JSON.stringify({ name: nome, firstNodeId, nodes }, null, 2);
    const url = URL.createObjectURL(new Blob([dados], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${nome.replace(/[^\w-]+/g, '-').toLowerCase() || 'fluxo'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importar(arquivo) {
    try {
      const dados = JSON.parse(await arquivo.text());
      if (!Array.isArray(dados.nodes)) throw new Error('Arquivo sem a lista de blocos');
      setNome(dados.name ?? nome);
      setNodes(dados.nodes);
      setFirstNodeId(dados.firstNodeId ?? dados.nodes[0]?.id ?? null);
      setSujo(true);
      setAviso({ tipo: 'ok', texto: 'Fluxo importado — revise e salve.' });
    } catch (err) {
      setAviso({ tipo: 'erro', texto: `Não deu pra importar: ${err.message}` });
    }
  }

  const nodeEmConfig = nodes.find((n) => n.id === configDe) ?? null;

  return (
    <Layout title="Fluxos">
      <div className="editor">
        <aside className="col-fluxos">
          <div className="col-head">
            <h2 className="section-title">Meus fluxos</h2>
            <button className="btn btn-sm btn-primary" onClick={novo}>Novo</button>
          </div>
          {!fluxos.length && <p className="empty-state">Nenhum fluxo ainda.</p>}
          <ul className="lista-fluxos">
            {fluxos.map((f) => (
              <li key={f.id} className={f.id === flow?.id ? 'atual' : ''}>
                <button className="fluxo-nome" onClick={() => abrir(f.id)}>
                  <span>{f.name}</span>
                  <span className="fluxo-meta">
                    {f.nodes.length} bloco(s) · {f.triggers?.length ?? 0} gatilho(s)
                  </span>
                </button>
                <label className="switch" title={f.status === 'active' ? 'Ligado' : 'Desligado'}>
                  <input
                    type="checkbox"
                    checked={f.status === 'active'}
                    onChange={() => alternarStatus(f)}
                    aria-label={`${f.status === 'active' ? 'Desligar' : 'Ligar'} o fluxo ${f.name}`}
                  />
                  <span className="switch-trilho" />
                </label>
                <button className="btn btn-sm btn-danger" onClick={() => excluir(f)} aria-label={`Excluir ${f.name}`}>×</button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="col-centro">
          <div className="barra-topo">
            <input
              className="input nome-fluxo"
              value={nome}
              onChange={(e) => { setNome(e.target.value); setSujo(true); }}
              placeholder="Nome do fluxo"
              disabled={!flow}
              aria-label="Nome do fluxo"
            />
            <div className="barra-acoes">
              <button className="btn btn-sm" onClick={() => inputImportar.current?.click()} disabled={!flow}>Importar</button>
              <button className="btn btn-sm" onClick={exportar} disabled={!flow}>Exportar</button>
              <button className="btn btn-sm" onClick={() => setGatilhos(true)} disabled={!flow}>
                Páginas e gatilhos
                {flow?.triggers?.length ? <span className="badge">{flow.triggers.length}</span> : null}
              </button>
              <button className="btn btn-sm btn-primary" onClick={salvar} disabled={!flow || salvando}>
                {salvando ? 'Salvando…' : sujo ? 'Salvar •' : 'Salvar'}
              </button>
            </div>
            <input
              ref={inputImportar} type="file" accept="application/json" hidden
              onChange={(e) => { const f = e.target.files?.[0]; if (f) importar(f); e.target.value = ''; }}
            />
          </div>

          {aviso && <p className={`aviso aviso-${aviso.tipo}`}>{aviso.texto}</p>}

          <div className="area">
            <div className="paleta">
              <h3 className="paleta-titulo">Componentes</h3>
              {ORDEM_DA_PALETA.map((tipo) => (
                <div
                  key={tipo}
                  className="paleta-item"
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('tipo-de-bloco', tipo)}
                  style={{ borderLeftColor: TIPOS[tipo].cor }}
                >
                  <span className="paleta-nome">{TIPOS[tipo].rotulo}</span>
                  <span className="paleta-desc">{TIPOS[tipo].descricao}</span>
                </div>
              ))}
              <p className="paleta-dica">
                Arraste para o canvas. Clique na bolinha embaixo de um bloco e depois no bloco de
                destino para ligá-los.
              </p>
            </div>

            <FlowCanvas
              nodes={nodes}
              firstNodeId={firstNodeId}
              selecionado={selecionado}
              ligando={ligando}
              passoAceso={passoAceso}
              onSelecionar={setSelecionado}
              onMover={mover}
              onSoltarNovo={soltarNovo}
              onIniciarLigacao={(nodeId, saida) => setLigando({ nodeId, saida })}
              onConcluirLigacao={concluirLigacao}
              onAbrirConfig={setConfigDe}
            />
          </div>
        </section>

        <TestPanel
          flowId={flow?.id}
          salvoRecentemente={!sujo}
          onPassoAtual={setPassoAceso}
        />
      </div>

      <NodeConfigModal
        node={nodeEmConfig}
        nodes={nodes}
        aberto={Boolean(nodeEmConfig)}
        ehInicial={nodeEmConfig?.id === firstNodeId}
        onFechar={() => setConfigDe(null)}
        onSalvar={salvarConfig}
        onExcluir={() => excluirNode(configDe)}
        onDuplicar={() => duplicarNode(configDe)}
        onDefinirInicio={() => { setFirstNodeId(configDe); setSujo(true); setConfigDe(null); }}
      />

      <TriggersModal
        aberto={gatilhos}
        flow={flow}
        onFechar={() => setGatilhos(false)}
        onMudou={async () => { const f = await flowsApi.get(flow.id); setFlow(f); await carregarLista(); }}
      />

      <style>{`
        .editor {
          display: grid;
          grid-template-columns: 230px minmax(0, 1fr) 300px;
          gap: 0;
          border: 1px solid var(--border);
          border-radius: var(--radius);
          background: var(--surface);
          overflow: hidden;
          min-height: 620px;
        }
        .col-fluxos {
          padding: 16px; border-right: 1px solid var(--border);
          display: flex; flex-direction: column; gap: 12px; min-width: 0;
        }
        .col-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .lista-fluxos { list-style: none; display: flex; flex-direction: column; gap: 2px; }
        .lista-fluxos li {
          display: flex; align-items: center; gap: 6px;
          padding: 7px 6px; border-radius: 7px;
        }
        .lista-fluxos li.atual { background: var(--accent-soft); }
        .fluxo-nome {
          flex: 1; min-width: 0; text-align: left; border: none; background: transparent;
          display: flex; flex-direction: column; gap: 1px; padding: 0; color: inherit;
        }
        .fluxo-nome > span:first-child {
          font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .fluxo-meta { font-size: 11px; color: var(--muted); }
        .switch { position: relative; display: inline-flex; flex: none; }
        .switch input { position: absolute; opacity: 0; width: 100%; height: 100%; margin: 0; cursor: pointer; }
        .switch-trilho {
          width: 30px; height: 17px; border-radius: 999px; background: var(--surface-2);
          border: 1px solid var(--border); position: relative; transition: background 0.15s ease;
        }
        .switch-trilho::after {
          content: ''; position: absolute; top: 2px; left: 2px;
          width: 11px; height: 11px; border-radius: 50%; background: var(--muted);
          transition: transform 0.15s ease, background 0.15s ease;
        }
        .switch input:checked + .switch-trilho { background: var(--accent); border-color: var(--accent); }
        .switch input:checked + .switch-trilho::after { transform: translateX(13px); background: #fff; }
        .switch input:focus-visible + .switch-trilho { outline: 2px solid var(--accent); outline-offset: 2px; }

        .col-centro { display: flex; flex-direction: column; min-width: 0; }
        .barra-topo {
          display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
          padding: 12px 14px; border-bottom: 1px solid var(--border);
        }
        .nome-fluxo { flex: 1; min-width: 160px; font-weight: 600; }
        .barra-acoes { display: flex; gap: 6px; flex-wrap: wrap; }
        .aviso { font-size: 12.5px; padding: 8px 14px; }
        .aviso-ok { background: var(--success-soft); color: var(--success); }
        .aviso-erro { background: var(--danger-soft); color: var(--danger); }

        .area { display: grid; grid-template-columns: 168px minmax(0, 1fr); flex: 1; min-height: 0; }
        .paleta {
          padding: 12px; border-right: 1px solid var(--border);
          display: flex; flex-direction: column; gap: 8px;
        }
        .paleta-titulo { font-size: 12px; color: var(--muted); font-weight: 600; }
        .paleta-item {
          border: 1px solid var(--border); border-left-width: 3px; border-radius: 8px;
          padding: 8px 10px; cursor: grab; background: var(--surface);
          display: flex; flex-direction: column; gap: 2px;
        }
        .paleta-item:active { cursor: grabbing; }
        .paleta-nome { font-size: 12.5px; font-weight: 500; }
        .paleta-desc { font-size: 11px; color: var(--muted); line-height: 1.35; }
        .paleta-dica { font-size: 11px; color: var(--muted-2); line-height: 1.4; margin-top: 4px; }

        @media (max-width: 1100px) {
          .editor { grid-template-columns: 1fr; }
          .col-fluxos, .teste { border: none; border-bottom: 1px solid var(--border); }
        }
      `}</style>
    </Layout>
  );
}
