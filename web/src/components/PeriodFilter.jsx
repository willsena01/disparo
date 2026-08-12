const PERIODOS = [
  { dias: 1, label: 'Hoje' },
  { dias: 7, label: '7 dias' },
  { dias: 15, label: '15 dias' },
  { dias: 30, label: '30 dias' },
];

// Filtro de período do topo dos Relatórios.
//
// É um grupo de rádio, não uma fila de botões: só um período vale por vez, e o
// leitor de tela precisa anunciar isso — com <button> soltos ele leria quatro
// ações independentes.
export default function PeriodFilter({ dias, onChange, disabled }) {
  return (
    <div className="periodo" role="radiogroup" aria-label="Período do relatório">
      {PERIODOS.map((p) => (
        <button
          key={p.dias}
          type="button"
          role="radio"
          aria-checked={p.dias === dias}
          className={p.dias === dias ? 'ativo' : ''}
          onClick={() => onChange(p.dias)}
          disabled={disabled}
        >
          {p.label}
        </button>
      ))}

      <style>{`
        .periodo {
          display: inline-flex;
          gap: 2px;
          padding: 3px;
          background: var(--surface-2);
          border-radius: 9px;
        }
        .periodo button {
          border: none;
          background: transparent;
          color: var(--muted);
          font-size: 13px;
          font-weight: 500;
          padding: 6px 14px;
          border-radius: 7px;
          cursor: pointer;
          transition: background 0.12s ease, color 0.12s ease;
        }
        .periodo button:hover:not(:disabled):not(.ativo) { color: var(--ink); }
        .periodo button.ativo {
          background: var(--surface);
          color: var(--ink);
          box-shadow: var(--shadow-card);
        }
        .periodo button:disabled { opacity: 0.5; cursor: default; }
        @media (prefers-reduced-motion: reduce) {
          .periodo button { transition: none; }
        }
      `}</style>
    </div>
  );
}
