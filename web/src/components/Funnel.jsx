// Funil de etapas: barras proporcionais com valor absoluto e percentual.
// etapas: [{ etapa, valor, percentual }]
export default function Funnel({ titulo, etapas, vazio }) {
  const temDado = etapas?.some((e) => e.valor > 0);

  return (
    <div className="card funil">
      <h2 className="section-title">{titulo}</h2>

      {!temDado ? (
        <p className="funil-vazio">{vazio}</p>
      ) : (
        <ol className="funil-etapas">
          {etapas.map((e, i) => (
            <li key={e.etapa}>
              <div className="funil-topo">
                <span className="funil-nome">{e.etapa}</span>
                <span className="funil-valores tabular">
                  <strong>{e.valor.toLocaleString('pt-BR')}</strong>
                  <span className="funil-pct">{e.percentual}%</span>
                </span>
              </div>
              <div
                className="funil-barra"
                role="img"
                aria-label={`${e.etapa}: ${e.valor} (${e.percentual}% da primeira etapa)`}
              >
                <div
                  className="funil-fill"
                  style={{
                    width: `${Math.min(100, e.percentual)}%`,
                    // A opacidade decrescente reforça a leitura de funil: cada
                    // etapa é um subconjunto da anterior, não uma série nova.
                    opacity: 1 - i * 0.16,
                  }}
                />
              </div>
            </li>
          ))}
        </ol>
      )}

      <style>{`
        .funil { padding: 20px 22px; display: flex; flex-direction: column; gap: 16px; }
        .section-title { font-size: 14px; font-weight: 600; }
        .funil-vazio { font-size: 13px; color: var(--muted); line-height: 1.5; }
        .funil-etapas { display: flex; flex-direction: column; gap: 13px; list-style: none; }
        .funil-topo {
          display: flex; align-items: baseline; justify-content: space-between;
          gap: 12px; margin-bottom: 6px;
        }
        .funil-nome { font-size: 13px; }
        .funil-valores { display: flex; align-items: baseline; gap: 8px; font-size: 13px; }
        .funil-pct { color: var(--muted); font-size: 12px; }
        .funil-barra { height: 9px; border-radius: 999px; background: var(--surface-2); overflow: hidden; }
        .funil-fill {
          height: 100%; border-radius: 999px; background: var(--accent);
          transition: width 0.3s ease;
        }
        @media (prefers-reduced-motion: reduce) { .funil-fill { transition: none; } }
      `}</style>
    </div>
  );
}
