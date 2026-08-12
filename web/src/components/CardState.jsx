// Estado de carregamento/erro/vazio compartilhado pelos cards do dashboard —
// pra nenhuma query com falha derrubar a tela.
export function CardSkeleton({ lines = 2 }) {
  return (
    <div className="card-skeleton" aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <div className="skeleton-line" key={i} style={{ width: i === 0 ? '40%' : '70%' }} />
      ))}
      <style>{`
        .card-skeleton { display: flex; flex-direction: column; gap: 8px; }
        .skeleton-line {
          height: 14px;
          border-radius: 4px;
          background: linear-gradient(90deg, var(--surface-2) 25%, var(--border) 37%, var(--surface-2) 63%);
          background-size: 400% 100%;
          animation: shimmer 1.4s ease infinite;
        }
        @keyframes shimmer {
          0% { background-position: 100% 0; }
          100% { background-position: 0 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .skeleton-line { animation: none; }
        }
      `}</style>
    </div>
  );
}

export function CardError({ message }) {
  return (
    <div className="card-error">
      <p>Não deu pra carregar esse dado agora.</p>
      {message && <p className="card-error-detail">{message}</p>}
      <style>{`
        .card-error {
          display: flex;
          flex-direction: column;
          gap: 4px;
          color: var(--danger);
          font-size: 13px;
        }
        .card-error-detail {
          color: var(--muted);
          font-size: 12px;
        }
      `}</style>
    </div>
  );
}
