const LIMIT_LABELS = {
  leads: 'Leads',
  messages: 'Envios/mês',
  pages: 'Páginas',
  flows: 'Fluxos',
  broadcasts: 'Broadcasts',
};

export default function PlanCard({ plan }) {
  if (!plan.hasPlan) {
    return (
      <div className="card plan-card">
        <h2 className="section-title">Seu plano</h2>
        <p className="empty-note">Nenhuma assinatura ativa encontrada para este workspace.</p>
        <style>{cardStyle}</style>
      </div>
    );
  }

  return (
    <div className="card plan-card">
      <div className="plan-head">
        <h2 className="section-title">Seu plano</h2>
        <span className="badge success">ativo</span>
      </div>
      <p className="plan-name">{plan.planName}</p>
      <p className="plan-price">{formatCents(plan.priceCents)}/mês</p>

      <div className="limits-list">
        {Object.entries(plan.usage).map(([key, { used, max }]) => (
          <div className="limit-row" key={key}>
            <div className="limit-row-head">
              <span>{LIMIT_LABELS[key] ?? key}</span>
              <span className="tabular">
                {used.toLocaleString('pt-BR')} / {max == null ? '∞' : max.toLocaleString('pt-BR')}
              </span>
            </div>
            {max != null && (
              <div className="limit-bar">
                <div
                  className="limit-bar-fill"
                  style={{ width: `${Math.min(100, (used / max) * 100)}%` }}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      <style>{cardStyle}</style>
    </div>
  );
}

function formatCents(cents) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const cardStyle = `
  .plan-card {
    padding: 18px 22px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .plan-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .section-title { font-size: 14px; font-weight: 600; }
  .badge {
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 999px;
  }
  .badge.success { background: var(--success-soft); color: var(--success); }
  .plan-name { font-size: 20px; font-weight: 700; margin-top: 6px; }
  .plan-price { font-size: 12.5px; color: var(--muted); margin-bottom: 10px; }
  .empty-note { font-size: 13px; color: var(--muted); padding: 10px 0; }
  .limits-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .limit-row-head {
    display: flex;
    justify-content: space-between;
    font-size: 12.5px;
    color: var(--muted);
    margin-bottom: 4px;
  }
  .limit-bar {
    height: 6px;
    border-radius: 999px;
    background: var(--surface-2);
    overflow: hidden;
  }
  .limit-bar-fill {
    height: 100%;
    background: var(--accent);
    border-radius: 999px;
  }
`;
