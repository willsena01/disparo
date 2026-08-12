import { pool } from './db/pool.js';

// Todas as queries abaixo são escopadas por workspace_id. Nenhum valor é
// inventado em JS — o que não tem dado ainda vem 0/null do banco mesmo.

export async function getActiveSubscription(workspaceId) {
  const { rows } = await pool.query(
    `SELECT p.*
     FROM subscriptions s
     JOIN plans p ON p.id = s.plan_id
     WHERE s.workspace_id = $1 AND s.status = 'active'
     LIMIT 1`,
    [workspaceId]
  );
  return rows[0] ?? null;
}

export async function getMessagesUsed(workspaceId) {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(messages_used), 0)::int AS total
     FROM facebook_apps
     WHERE workspace_id = $1`,
    [workspaceId]
  );
  return rows[0].total;
}

export async function getTodayStats(workspaceId) {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'delivered') AS entregues,
       COUNT(*) FILTER (WHERE status = 'failed')    AS spam_ou_bloqueio,
       COUNT(*) FILTER (WHERE status = 'read')       AS abriram
     FROM messages
     WHERE workspace_id = $1 AND sent_at::date = CURRENT_DATE`,
    [workspaceId]
  );

  const { rows: flowRows } = await pool.query(
    `SELECT COUNT(*)::int AS iniciaram
     FROM flow_executions
     WHERE workspace_id = $1 AND created_at::date = CURRENT_DATE`,
    [workspaceId]
  );

  return {
    entreguesHoje: Number(rows[0].entregues),
    spamOuBloqueioHoje: Number(rows[0].spam_ou_bloqueio),
    abriramHoje: Number(rows[0].abriram),
    iniciaramFluxoHoje: flowRows[0].iniciaram,
  };
}

export async function getUsage(workspaceId) {
  const [plan, messagesUsed] = await Promise.all([
    getActiveSubscription(workspaceId),
    getMessagesUsed(workspaceId),
  ]);

  if (!plan) {
    return { hasPlan: false, messagesUsed, messageLimit: null, planName: null };
  }

  return {
    hasPlan: true,
    planName: plan.name,
    messagesUsed,
    messageLimit: plan.max_messages,
  };
}

// Preenche os dias sem registro com 0 — sem isso o gráfico teria buracos em
// vez de vale zero, o que engana visualmente ("sem dado" != "zero").
function fillDailySeries(rows, days, dayKey, valueKeys) {
  const byDay = new Map(rows.map((r) => [r[dayKey].toISOString().slice(0, 10), r]));
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const row = byDay.get(iso);
    const label = iso.slice(5).replace('-', '/'); // "08/10" -> "8/10"-ish, mm/dd
    const entry = { day: iso, label };
    for (const key of valueKeys) {
      entry[key] = row ? Number(row[key]) : 0;
    }
    out.push(entry);
  }
  return out;
}

export async function getLeadsSeries(workspaceId, days = 30) {
  const { rows } = await pool.query(
    `SELECT DATE(created_at) AS day, COUNT(*) AS count
     FROM leads
     WHERE workspace_id = $1 AND created_at >= CURRENT_DATE - ($2::text || ' days')::interval
     GROUP BY day
     ORDER BY day`,
    [workspaceId, days]
  );
  return fillDailySeries(rows, days, 'day', ['count']);
}

export async function getMessagesSeries(workspaceId, days = 7) {
  const [messagesRows, executionsRows] = await Promise.all([
    pool.query(
      `SELECT DATE(sent_at) AS day,
              COUNT(*) AS total,
              COUNT(*) FILTER (WHERE status = 'failed') AS failed
       FROM messages
       WHERE workspace_id = $1 AND sent_at >= CURRENT_DATE - ($2::text || ' days')::interval
       GROUP BY day
       ORDER BY day`,
      [workspaceId, days]
    ),
    pool.query(
      `SELECT DATE(created_at) AS day, COUNT(*) AS started
       FROM flow_executions
       WHERE workspace_id = $1 AND created_at >= CURRENT_DATE - ($2::text || ' days')::interval
       GROUP BY day
       ORDER BY day`,
      [workspaceId, days]
    ),
  ]);

  const byDay = new Map();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const iso = d.toISOString().slice(0, 10);
    byDay.set(iso, { day: iso, label: iso.slice(5).replace('-', '/'), total: 0, failed: 0, started: 0 });
  }
  for (const r of messagesRows.rows) {
    const iso = r.day.toISOString().slice(0, 10);
    const entry = byDay.get(iso);
    if (entry) {
      entry.total = Number(r.total);
      entry.failed = Number(r.failed);
    }
  }
  for (const r of executionsRows.rows) {
    const iso = r.day.toISOString().slice(0, 10);
    const entry = byDay.get(iso);
    if (entry) entry.started = Number(r.started);
  }
  return Array.from(byDay.values());
}

export async function getConnectedApps(workspaceId) {
  const [appsResult, plan] = await Promise.all([
    pool.query(
      `SELECT fa.id, fa.name, fa.app_id, fa.status, fa.messages_used,
              COUNT(fp.id)::int AS pages_count
       FROM facebook_apps fa
       LEFT JOIN facebook_pages fp ON fp.facebook_app_id = fa.id
       WHERE fa.workspace_id = $1
       GROUP BY fa.id
       ORDER BY fa.created_at ASC`,
      [workspaceId]
    ),
    getActiveSubscription(workspaceId),
  ]);

  const messageLimit = plan?.max_messages ?? null;

  return appsResult.rows.map((app) => ({
    id: app.id,
    name: app.name,
    appId: app.app_id,
    status: app.status,
    pagesCount: app.pages_count,
    messagesUsed: app.messages_used,
    messageLimit,
    pctUsed: messageLimit ? Math.min(1, app.messages_used / messageLimit) : null,
  }));
}

export async function getPlanUsage(workspaceId) {
  const plan = await getActiveSubscription(workspaceId);
  if (!plan) return { hasPlan: false };

  const [leadsUsed, messagesUsed, pagesUsed, flowsUsed, broadcastsUsed] = await Promise.all([
    countRows('leads', workspaceId),
    getMessagesUsed(workspaceId),
    countRows('facebook_pages', workspaceId),
    countRows('flows', workspaceId),
    countRows('broadcasts', workspaceId),
  ]);

  return {
    hasPlan: true,
    planName: plan.name,
    priceCents: plan.price_cents,
    usage: {
      leads: { used: leadsUsed, max: plan.max_leads },
      messages: { used: messagesUsed, max: plan.max_messages },
      pages: { used: pagesUsed, max: plan.max_pages },
      flows: { used: flowsUsed, max: plan.max_flows },
      broadcasts: { used: broadcastsUsed, max: plan.max_broadcasts },
    },
  };
}

async function countRows(table, workspaceId) {
  // nomes de tabela vêm só de chamadas internas fixas acima, nunca de input
  // externo — seguro concatenar aqui.
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS total FROM ${table} WHERE workspace_id = $1`,
    [workspaceId]
  );
  return rows[0].total;
}
