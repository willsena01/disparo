import { useEffect, useState } from 'react';
import Modal from '../Modal.jsx';
import MessageBlockEditor from './MessageBlockEditor.jsx';
import { TIPOS, formatarDuracao } from './nodeTypes.js';

// Painel de configuração do bloco. Abre ao clicar no bloco no canvas.
export default function NodeConfigModal({
  node, nodes, aberto, onFechar, onSalvar, onExcluir, onDuplicar, onDefinirInicio, ehInicial,
}) {
  const [config, setConfig] = useState({});
  const [next, setNext] = useState(null);

  // Recarrega ao trocar de bloco: sem isso o formulário mostraria o config do
  // bloco anterior ao abrir o seguinte.
  useEffect(() => {
    if (!node) return;
    setConfig({ ...(node.config ?? {}) });
    setNext(node.next_node_id ?? null);
  }, [node?.id, aberto]);

  if (!node) return null;
  const t = TIPOS[node.type];
  const outros = nodes.filter((n) => n.id !== node.id);
  const set = (k, v) => setConfig((c) => ({ ...c, [k]: v }));
  // "Bloco 1", "Bloco 2"… pela posição na lista — é como o operador se refere
  // a eles, e o id gerado não diz nada pra ninguém.
  const indiceDoBloco = nodes.findIndex((n) => n.id === node.id) + 1;

  function salvar(e) {
    e.preventDefault();
    onSalvar({ config, next });
  }

  return (
    <Modal aberto={aberto} titulo={`Bloco: ${t.rotulo}`} onFechar={onFechar} largura={480}>
      <form onSubmit={salvar} className="form-col">
        {node.type === 'message' && (
          <MessageBlockEditor
            titulo={`Bloco ${indiceDoBloco}`}
            config={config}
            onChange={setConfig}
            onDuplicar={onDuplicar}
            onExcluir={onExcluir}
          />
        )}

        {node.type === 'wait' && (
          <div className="field">
            <label htmlFor="cfg-espera">Esperar</label>
            <div className="linha-espera">
              <input
                id="cfg-espera" type="number" min="1" className="input"
                value={config.duration_seconds ?? 0}
                onChange={(e) => set('duration_seconds', Number(e.target.value))}
              />
              <span className="field-hint">segundos · {formatarDuracao(config.duration_seconds)}</span>
            </div>
            <div className="atalhos">
              {[[300, '5 min'], [3600, '1 hora'], [86400, '1 dia'], [259200, '3 dias']].map(([s, r]) => (
                <button type="button" key={s} className="btn btn-sm" onClick={() => set('duration_seconds', s)}>{r}</button>
              ))}
            </div>
          </div>
        )}

        {node.type === 'tag' && (
          <>
            <div className="field">
              <label htmlFor="cfg-tag">Nome da tag</label>
              <input id="cfg-tag" className="input" value={config.tag_name ?? ''} onChange={(e) => set('tag_name', e.target.value)} autoFocus />
            </div>
            <div className="field">
              <label htmlFor="cfg-ordem">Posição no funil (opcional)</label>
              <input
                id="cfg-ordem" type="number" min="1" className="input"
                value={config.step_order ?? ''}
                onChange={(e) => set('step_order', e.target.value === '' ? null : Number(e.target.value))}
              />
              {/* É esse número que ordena as barras do card "Progresso nos
                  fluxos" no Dashboard. Sem ele a tag ainda aparece, no fim. */}
              <span className="field-hint">
                Define a ordem desta etapa no card "Progresso nos fluxos" do Dashboard.
              </span>
            </div>
          </>
        )}

        {node.type === 'condition' && (
          <>
            <div className="field">
              <label htmlFor="cfg-cond">O lead tem a tag…</label>
              <input id="cfg-cond" className="input" value={config.tag_to_check ?? ''} onChange={(e) => set('tag_to_check', e.target.value)} autoFocus />
            </div>
            <SelecionarBloco
              id="cfg-sim" rotulo="Se tem a tag, vai para" opcoes={outros}
              valor={config.true_branch_node_id} onChange={(v) => set('true_branch_node_id', v)}
            />
            <SelecionarBloco
              id="cfg-nao" rotulo="Se não tem, vai para" opcoes={outros}
              valor={config.false_branch_node_id} onChange={(v) => set('false_branch_node_id', v)}
            />
          </>
        )}

        {t.saidas.includes('next') && (
          <SelecionarBloco
            id="cfg-next" rotulo="Próximo bloco" opcoes={outros}
            valor={next} onChange={setNext}
            dica="Sem próximo bloco, o fluxo termina aqui."
          />
        )}

        <div className="form-acoes espalha">
          <div className="acoes-esq">
            <button type="button" className="btn btn-sm btn-danger" onClick={onExcluir}>Excluir bloco</button>
            {!ehInicial && (
              <button type="button" className="btn btn-sm" onClick={onDefinirInicio}>Definir como início</button>
            )}
          </div>
          <button type="submit" className="btn btn-primary">Aplicar</button>
        </div>

        <style>{`
          .form-col { display: flex; flex-direction: column; gap: 14px; }
          .form-acoes { display: flex; justify-content: flex-end; gap: 8px; }
          .form-acoes.espalha { justify-content: space-between; align-items: center; flex-wrap: wrap; }
          .acoes-esq { display: flex; gap: 8px; flex-wrap: wrap; }
          .linha-espera { display: flex; align-items: center; gap: 10px; }
          .linha-espera .input { width: 120px; }
          .atalhos { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
        `}</style>
      </form>
    </Modal>
  );
}

function SelecionarBloco({ id, rotulo, opcoes, valor, onChange, dica }) {
  return (
    <div className="field">
      <label htmlFor={id}>{rotulo}</label>
      <select id={id} className="select" value={valor ?? ''} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">— nenhum —</option>
        {opcoes.map((n) => (
          <option key={n.id} value={n.id}>
            {TIPOS[n.type].rotulo}: {TIPOS[n.type].resumo(n.config ?? {}).slice(0, 40)}
          </option>
        ))}
      </select>
      {dica && <span className="field-hint">{dica}</span>}
    </div>
  );
}

