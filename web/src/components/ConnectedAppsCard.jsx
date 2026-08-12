const statusLabel = { active: 'ativo', inactive: 'inativo' };

export default function ConnectedAppsCard({ apps }) {
  return (
    <div className="card apps-card">
      <h2 className="section-title">APIs conectadas</h2>
      <p className="section-note">Apps do Facebook usados no envio</p>

      {apps.length === 0 ? (
        <p className="empty-note">Nenhum app conectado ainda.</p>
      ) : (
        <div className="apps-list">
          {apps.map((app) => (
            <div className="app-row" key={app.id}>
              <div className="app-row-head">
                <span className="app-name">{app.name}</span>
                <span className={`badge ${app.status === 'active' ? 'success' : 'muted'}`}>
                  {statusLabel[app.status] ?? app.status}
                </span>
                <span className="app-meta">
                  App ID {app.appId} · {app.pagesCount} página{app.pagesCount === 1 ? '' : 's'}
                </span>
              </div>
              <div className="app-usage">
                <div className="app-usage-head">
                  <span>Limite de mensagens</span>
                  <span className="tabular">
                    {app.pctUsed === null
                      ? 'plano sem limite'
                      : `${Math.round(app.pctUsed * 100)}% usado`}
                  </span>
                </div>
                {app.pctUsed !== null && (
                  <div className="app-usage-bar">
                    <div
                      className="app-usage-bar-fill"
                      style={{ width: `${Math.min(100, app.pctUsed * 100)}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`
        .apps-card {
          padding: 18px 22px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .section-title { font-size: 14px; font-weight: 600; }
        .section-note { font-size: 13px; color: var(--muted); margin-bottom: 6px; }
        .empty-note { font-size: 13px; color: var(--muted); padding: 10px 0; }
        .apps-list {
          display: flex;
          flex-direction: column;
          gap: 14px;
          margin-top: 6px;
        }
        .app-row {
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 12px 14px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .app-row-head {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .app-name { font-size: 13.5px; font-weight: 600; }
        .app-meta { font-size: 12px; color: var(--muted); margin-left: auto; }
        .badge {
          font-size: 11px;
          font-weight: 600;
          padding: 2px 8px;
          border-radius: 999px;
        }
        .badge.success { background: var(--success-soft); color: var(--success); }
        .badge.muted { background: var(--surface-2); color: var(--muted); }
        .app-usage { display: flex; flex-direction: column; gap: 6px; }
        .app-usage-head {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          color: var(--muted);
        }
        .app-usage-bar {
          height: 6px;
          border-radius: 999px;
          background: var(--surface-2);
          overflow: hidden;
        }
        .app-usage-bar-fill {
          height: 100%;
          background: var(--accent);
          border-radius: 999px;
        }
      `}</style>
    </div>
  );
}
