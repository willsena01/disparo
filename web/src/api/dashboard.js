async function getJSON(path) {
  const res = await fetch(path);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Erro ${res.status} em ${path}`);
  }
  return res.json();
}

export const fetchTodayStats = () => getJSON('/api/dashboard/today-stats');
export const fetchUsage = () => getJSON('/api/dashboard/usage');
export const fetchLeadsSeries = () => getJSON('/api/dashboard/leads-series');
export const fetchMessagesSeries = () => getJSON('/api/dashboard/messages-series');
export const fetchConnectedApps = () => getJSON('/api/dashboard/connected-apps');
export const fetchPlanUsage = () => getJSON('/api/dashboard/plan-usage');
export const fetchFlowProgress = () => getJSON('/api/reports/progresso-fluxos');
