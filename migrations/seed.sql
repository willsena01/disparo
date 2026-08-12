-- Seed mínimo pra a API ter um workspace/plano pra consultar.
-- Idempotente: pode rodar de novo sem duplicar.

INSERT INTO workspaces (id, name)
SELECT '00000000-0000-0000-0000-000000000001', 'Principal'
WHERE NOT EXISTS (SELECT 1 FROM workspaces WHERE id = '00000000-0000-0000-0000-000000000001');

INSERT INTO plans (id, name, price_cents, max_leads, max_messages, max_pages, max_flows, max_broadcasts)
SELECT '00000000-0000-0000-0000-000000000002', 'Starter', 9900, NULL, 900000, NULL, NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM plans WHERE id = '00000000-0000-0000-0000-000000000002');

INSERT INTO subscriptions (workspace_id, plan_id, status)
SELECT '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'active'
WHERE NOT EXISTS (
  SELECT 1 FROM subscriptions
  WHERE workspace_id = '00000000-0000-0000-0000-000000000001' AND status = 'active'
);
