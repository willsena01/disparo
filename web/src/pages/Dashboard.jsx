import Layout from '../components/Layout.jsx';
import StatCard from '../components/StatCard.jsx';
import LineAreaChart from '../components/LineAreaChart.jsx';
import GroupedBarChart from '../components/GroupedBarChart.jsx';
import ConnectedAppsCard from '../components/ConnectedAppsCard.jsx';
import PlanCard from '../components/PlanCard.jsx';
import FlowProgressCard from '../components/FlowProgressCard.jsx';
import { CardSkeleton, CardError } from '../components/CardState.jsx';
import { useAsync } from '../hooks/useAsync.js';
import {
  fetchTodayStats,
  fetchUsage,
  fetchLeadsSeries,
  fetchMessagesSeries,
  fetchConnectedApps,
  fetchPlanUsage,
  fetchFlowProgress,
} from '../api/dashboard.js';
import {
  IconBroadcast,
  IconMessage,
  IconLeads,
  IconFlow,
} from '../icons/index.jsx';

export default function Dashboard() {
  const today = useAsync(fetchTodayStats, []);
  const usage = useAsync(fetchUsage, []);
  const leadsSeries = useAsync(fetchLeadsSeries, []);
  const messagesSeries = useAsync(fetchMessagesSeries, []);
  const apps = useAsync(fetchConnectedApps, []);
  const plan = useAsync(fetchPlanUsage, []);
  const flowProgress = useAsync(fetchFlowProgress, []);

  return (
    <Layout title="Conta">
      <div className="stat-grid">
        <StatCard
          label="Entregues hoje"
          value={today.data?.entreguesHoje ?? '—'}
          icon={IconBroadcast}
          loading={today.loading}
        />
        <StatCard
          label="Caíram em spam/bloqueio hoje"
          value={today.data?.spamOuBloqueioHoje ?? '—'}
          icon={IconBroadcast}
          loading={today.loading}
          tooltip="O Facebook não expõe 'spam' diretamente na API — este número é uma aproximação: mensagens cujo status de entrega voltou como falha."
        />
        <StatCard
          label="Abriram a mensagem hoje"
          value={today.data?.abriramHoje ?? '—'}
          icon={IconMessage}
          loading={today.loading}
        />
        <StatCard
          label="Iniciaram o fluxo hoje"
          value={today.data?.iniciaramFluxoHoje ?? '—'}
          icon={IconFlow}
          loading={today.loading}
        />
        <StatCard
          label="Total de leads"
          value={plan.data?.usage?.leads?.used ?? '—'}
          icon={IconLeads}
          loading={plan.loading}
        />
      </div>
      {today.error && <CardError message={today.error.message} />}

      <UsageCard usage={usage} />

      <div className="chart-grid">
        <div className="card chart-card">
          <h2 className="section-title">Leads ao longo do tempo</h2>
          {leadsSeries.loading && <CardSkeleton lines={4} />}
          {leadsSeries.error && <CardError message={leadsSeries.error.message} />}
          {leadsSeries.data && (
            <LineAreaChart
              data={leadsSeries.data.map((d) => ({ label: d.label, value: d.count }))}
            />
          )}
        </div>
        <div className="card chart-card">
          <h2 className="section-title">Mensagens enviadas</h2>
          {messagesSeries.loading && <CardSkeleton lines={4} />}
          {messagesSeries.error && <CardError message={messagesSeries.error.message} />}
          {messagesSeries.data && <GroupedBarChart data={messagesSeries.data} />}
        </div>
      </div>

      <div className="lower-grid">
        {apps.loading && (
          <div className="card">
            <CardSkeleton lines={3} />
          </div>
        )}
        {apps.error && (
          <div className="card">
            <CardError message={apps.error.message} />
          </div>
        )}
        {apps.data && <ConnectedAppsCard apps={apps.data} />}

        {plan.loading && (
          <div className="card">
            <CardSkeleton lines={3} />
          </div>
        )}
        {plan.error && (
          <div className="card">
            <CardError message={plan.error.message} />
          </div>
        )}
        {plan.data && <PlanCard plan={plan.data} />}
      </div>

      {flowProgress.loading && (
        <div className="card">
          <CardSkeleton lines={4} />
        </div>
      )}
      {flowProgress.error && (
        <div className="card">
          <CardError message={flowProgress.error.message} />
        </div>
      )}
      {flowProgress.data && <FlowProgressCard progresso={flowProgress.data} />}

      <style>{`
        .stat-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 14px;
        }
        .chart-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
          gap: 14px;
        }
        .lower-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
          gap: 14px;
        }
        .chart-card {
          padding: 18px 20px 8px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .section-title {
          font-size: 14px;
          font-weight: 600;
        }
      `}</style>
    </Layout>
  );
}

function UsageCard({ usage }) {
  if (usage.loading) {
    return (
      <div className="card usage-card">
        <CardSkeleton lines={3} />
      </div>
    );
  }
  if (usage.error) {
    return (
      <div className="card usage-card">
        <CardError message={usage.error.message} />
      </div>
    );
  }

  const { messagesUsed, messageLimit, hasPlan } = usage.data;

  if (!hasPlan) {
    return (
      <div className="card usage-card">
        <h2 className="section-title">Envios no mês</h2>
        <p className="usage-note">Nenhuma assinatura ativa — não há limite pra calcular.</p>
        <style>{usageStyle}</style>
      </div>
    );
  }

  const pct = Math.min(100, Math.round((messagesUsed / messageLimit) * 100));
  const restante = Math.max(0, messageLimit - messagesUsed);
  const nearLimit = messagesUsed / messageLimit > 0.9;

  return (
    <div className={`card usage-card${nearLimit ? ' near-limit' : ''}`}>
      <div className="usage-head">
        <span className="usage-label">
          <IconBroadcast size={15} />
          Envios no mês
        </span>
        {nearLimit && <span className="badge danger">Quase no limite</span>}
      </div>
      <p className="usage-value tabular">
        {formatNumber(messagesUsed)} <span className="usage-limit">/ {formatNumber(messageLimit)}</span>
      </p>
      <div className="usage-bar">
        <div
          className="usage-bar-fill"
          style={{ width: `${pct}%`, background: nearLimit ? 'var(--danger)' : 'var(--accent)' }}
        />
      </div>
      <p className="usage-note">{formatNumber(restante)} envios restantes até o limite do plano.</p>
      <style>{usageStyle}</style>
    </div>
  );
}

const usageStyle = `
  .usage-card { padding: 20px 22px; display: flex; flex-direction: column; gap: 10px; }
  .usage-card.near-limit { border-color: var(--danger); }
  .usage-head { display: flex; align-items: center; justify-content: space-between; }
  .usage-label { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--muted); }
  .badge { font-size: 11.5px; font-weight: 600; padding: 3px 9px; border-radius: 999px; }
  .badge.danger { background: var(--danger-soft); color: var(--danger); }
  .usage-value { font-size: 30px; font-weight: 700; }
  .usage-limit { font-size: 16px; font-weight: 500; color: var(--muted); }
  .usage-bar { height: 8px; border-radius: 999px; background: var(--surface-2); overflow: hidden; }
  .usage-bar-fill { height: 100%; border-radius: 999px; }
  .usage-note { font-size: 12.5px; color: var(--muted); }
  .section-title { font-size: 14px; font-weight: 600; }
`;

function formatNumber(n) {
  return n.toLocaleString('pt-BR');
}
