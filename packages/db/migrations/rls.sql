-- Row Level Security policies as defense-in-depth.
-- Application code ALWAYS includes org_id in WHERE clauses.
-- RLS is an additional layer preventing cross-org data leaks.

-- Enable RLS on tenant-scoped tables
ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_customer_aggregates ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_usage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_margin_snapshots ENABLE ROW LEVEL SECURITY;

-- Policies use a session-level GUC set by the application before each query.
-- The application sets: SET LOCAL app.org_id = 'clxxx...' in each transaction.

CREATE POLICY org_isolation ON usage_events
  USING (org_id = current_setting('app.org_id', true));

CREATE POLICY org_isolation ON customers
  USING (org_id = current_setting('app.org_id', true));

CREATE POLICY org_isolation ON daily_customer_aggregates
  USING (org_id = current_setting('app.org_id', true));

CREATE POLICY org_isolation ON alerts
  USING (org_id = current_setting('app.org_id', true));

CREATE POLICY org_isolation ON provider_connections
  USING (org_id = current_setting('app.org_id', true));

CREATE POLICY org_isolation ON provider_usage_records
  USING (org_id = current_setting('app.org_id', true));

CREATE POLICY org_isolation ON customer_margin_snapshots
  USING (org_id = current_setting('app.org_id', true));
