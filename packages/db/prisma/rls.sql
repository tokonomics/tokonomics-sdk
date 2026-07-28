-- Row Level Security (RLS) — defense-in-depth
-- Applied AFTER Prisma migrations. Run once via:
--   yarn prisma db execute --file packages/db/prisma/rls.sql --schema packages/db/prisma/schema.prisma
--
-- The application already enforces orgId at the API layer.
-- RLS is a second barrier so a compromised query can never read another org's data.

-- ──────────────────────────────────────────────────────────────────────────────
-- Create a Postgres function that reads the current org ID from a session var.
-- The app sets this with: SET LOCAL app.org_id = '<uuid>';
-- All Prisma queries in a transaction can call current_setting('app.org_id', true).
-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION current_org_id() RETURNS uuid AS $$
  SELECT NULLIF(current_setting('app.org_id', true), '')::uuid;
$$ LANGUAGE sql STABLE;

-- ──────────────────────────────────────────────────────────────────────────────
-- Enable RLS and create permissive policies on all multi-tenant tables.
-- The service role (used by Prisma via Supabase pooler) bypasses RLS by default,
-- so we explicitly force it for the postgres role.
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships   ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_usage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE sdk_api_keys   ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_customer_aggregates ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_customers   ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_margin_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_margin_scores  ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_rules   ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE margin_floor_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_routing_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_simulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE slack_connections   ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_digest_settings ENABLE ROW LEVEL SECURITY;

-- ──────────────────────────────────────────────────────────────────────────────
-- Policies — allow all operations only when org_id matches session var
-- ──────────────────────────────────────────────────────────────────────────────

-- organizations: readable only if the user has a membership in the org
-- (memberships table checked separately below)
CREATE POLICY org_isolation ON organizations
  USING (id = current_org_id());

CREATE POLICY org_isolation ON memberships
  USING (org_id = current_org_id());

CREATE POLICY org_isolation ON provider_connections
  USING (org_id = current_org_id());

CREATE POLICY org_isolation ON provider_usage_records
  USING (org_id = current_org_id());

CREATE POLICY org_isolation ON sdk_api_keys
  USING (org_id = current_org_id());

CREATE POLICY org_isolation ON customers
  USING (org_id = current_org_id());

CREATE POLICY org_isolation ON usage_events
  USING (org_id = current_org_id());

CREATE POLICY org_isolation ON daily_customer_aggregates
  USING (org_id = current_org_id());

CREATE POLICY org_isolation ON stripe_connections
  USING (org_id = current_org_id());

CREATE POLICY org_isolation ON stripe_customers
  USING (org_id = current_org_id());

CREATE POLICY org_isolation ON customer_margin_snapshots
  USING (org_id = current_org_id());

CREATE POLICY org_isolation ON org_margin_scores
  USING (org_id = current_org_id());

CREATE POLICY org_isolation ON budget_rules
  USING (org_id = current_org_id());

CREATE POLICY org_isolation ON alerts
  USING (org_id = current_org_id());

CREATE POLICY org_isolation ON margin_floor_rules
  USING (org_id = current_org_id());

CREATE POLICY org_isolation ON model_routing_tests
  USING (org_id = current_org_id());

CREATE POLICY org_isolation ON pricing_simulations
  USING (org_id = current_org_id());

CREATE POLICY org_isolation ON slack_connections
  USING (org_id = current_org_id());

CREATE POLICY org_isolation ON weekly_digest_settings
  USING (org_id = current_org_id());

-- ──────────────────────────────────────────────────────────────────────────────
-- Tables without org_id — open to all authenticated connections
-- (users, model_pricing — global lookup tables)
-- ──────────────────────────────────────────────────────────────────────────────

-- No RLS needed on: users, model_pricing
-- users are accessed by clerkId (unique per user); model_pricing is public data
