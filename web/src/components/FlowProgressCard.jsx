import InfoDot from '../icons/InfoDot.jsx';

// Progresso nos fluxos: uma barra por etapa, na ordem do step_order dos nós de
// tag. A primeira etapa é a régua (100%) — as seguintes mostram a fração que
// chegou até ali, que é como se lê um funil.
export default function FlowProgressCard({ progresso }) {
  const etapas = progresso?.etapas ?? [];

  if (!etapas.length) {
    return (
      <div className="card flow-progress">
        <Cabecalho />
        <p className="empty">
          Nenhuma tag aplicada ainda. Use nós de <strong>Aplicar Tag</strong> nos fluxos para
          marcar as etapas.
        </p>
        <style>{estilo}</style>
      </div>
    );
  }

  return (
    <div className="card flow-progress">
      <Cabecalho />
      <ol className="etapas">
        {etapas.map((etapa, i) => (
          <li className="etapa" key={etapa.tagName}>
            <div className="etapa-topo">
              <span className="etapa-nome" title={etapa.tagName}>
                <span className="etapa-num tabular">{i + 1}</span>
                {etapa.tagName}
              </span>
              <span className="etapa-valores tabular">
                <strong>{etapa.leads.toLocaleString('pt-BR')}</strong>
                <span className="etapa-pct">{etapa.percentual}%</span>
              </span>
            </div>
            <div
              className="barra"
              // A barra é o gráfico: sem role/aria ela é invisível pra leitor
              // de tela, que só ouviria os números soltos acima.
              role="img"
              aria-label={`${etapa.tagName}: ${etapa.leads} leads, ${etapa.percentual}% de quem entrou no fluxo`}
            >
              <div className="barra-fill" style={{ width: `${Math.min(100, etapa.percentual)}%` }} />
            </div>
          </li>
        ))}
      </ol>
      <style>{estilo}</style>
    </div>
  );
}

function Cabecalho() {
  return (
    <div className="fp-head">
      <h2 className="section-title">Progresso nos fluxos (tags)</h2>
      <InfoDot text="Cada barra é um checkpoint do funil: quantos leads chegaram até aquela etapa. A primeira etapa vale 100% — as seguintes mostram a fração que avançou." />
    </div>
  );
}

const estilo = `
  .flow-progress { padding: 20px 22px; display: flex; flex-direction: column; gap: 16px; }
  .fp-head { display: flex; align-items: center; gap: 7px; }
  .section-title { font-size: 14px; font-weight: 600; }
  .empty { font-size: 13px; color: var(--muted); line-height: 1.5; }
  .etapas { display: flex; flex-direction: column; gap: 14px; list-style: none; }
  .etapa { display: flex; flex-direction: column; gap: 6px; }
  .etapa-topo { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
  .etapa-nome {
    display: flex; align-items: center; gap: 8px;
    font-size: 13px; min-width: 0;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .etapa-num {
    flex: none;
    width: 18px; height: 18px; border-radius: 999px;
    background: var(--surface-2); color: var(--muted);
    font-size: 11px; font-weight: 600;
    display: inline-flex; align-items: center; justify-content: center;
  }
  .etapa-valores { display: flex; align-items: baseline; gap: 8px; flex: none; font-size: 13px; }
  .etapa-pct { color: var(--muted); font-size: 12px; }
  .barra { height: 8px; border-radius: 999px; background: var(--surface-2); overflow: hidden; }
  .barra-fill {
    height: 100%; border-radius: 999px; background: var(--accent);
    transition: width 0.3s ease;
  }
  @media (prefers-reduced-motion: reduce) { .barra-fill { transition: none; } }
`;
