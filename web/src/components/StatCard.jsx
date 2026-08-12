import InfoDot from '../icons/InfoDot.jsx';

export default function StatCard({ label, value, hint, icon: Icon, tooltip, loading }) {
  return (
    <div className="card stat-card">
      <div className="stat-head">
        <span className="stat-label">
          {label}
          {tooltip && <InfoDot text={tooltip} />}
        </span>
        {Icon && (
          <span className="stat-icon">
            <Icon size={16} />
          </span>
        )}
      </div>
      {loading ? (
        <div className="stat-skeleton" aria-hidden="true" />
      ) : (
        <p className="stat-value tabular">{value}</p>
      )}
      {hint && <p className="stat-hint">{hint}</p>}

      <style>{`
        .stat-card {
          padding: 16px 18px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          min-width: 0;
        }
        .stat-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .stat-label {
          font-size: 12.5px;
          color: var(--muted);
          display: inline-flex;
          align-items: center;
          gap: 5px;
        }
        .stat-icon {
          color: var(--muted-2);
          display: grid;
          place-items: center;
        }
        .stat-value {
          font-size: 26px;
          font-weight: 700;
          letter-spacing: -0.01em;
        }
        .stat-skeleton {
          height: 26px;
          width: 52%;
          border-radius: 5px;
          background: linear-gradient(90deg, var(--surface-2) 25%, var(--border) 37%, var(--surface-2) 63%);
          background-size: 400% 100%;
          animation: stat-shimmer 1.4s ease infinite;
        }
        @keyframes stat-shimmer {
          0% { background-position: 100% 0; }
          100% { background-position: 0 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .stat-skeleton { animation: none; }
        }
        .stat-hint {
          font-size: 12px;
          color: var(--muted-2);
        }
      `}</style>
    </div>
  );
}
