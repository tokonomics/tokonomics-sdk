-- Run AFTER Prisma creates the base usage_events table.
-- This converts usage_events to a partitioned table by month.

-- Step 1: Rename original table
ALTER TABLE usage_events RENAME TO usage_events_unpartitioned;

-- Step 2: Create partitioned parent table
CREATE TABLE usage_events (
  id                   TEXT         NOT NULL,
  org_id               TEXT         NOT NULL,
  customer_id          TEXT,
  external_customer_id TEXT         NOT NULL,
  feature              TEXT,
  workflow             TEXT,
  model                TEXT         NOT NULL,
  provider             TEXT         NOT NULL,
  input_tokens         INTEGER      NOT NULL,
  output_tokens        INTEGER      NOT NULL,
  cost_usd             NUMERIC(12, 6) NOT NULL,
  latency_ms           INTEGER,
  sdk_version          TEXT,
  idempotency_key      TEXT UNIQUE,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);

-- Step 3: Migrate existing data
INSERT INTO usage_events SELECT * FROM usage_events_unpartitioned;
DROP TABLE usage_events_unpartitioned;

-- Step 4: Create initial monthly partitions
-- Add more partitions via worker job (apps/worker/src/jobs/create-partitions.ts)
CREATE TABLE usage_events_2026_06
  PARTITION OF usage_events
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

CREATE TABLE usage_events_2026_07
  PARTITION OF usage_events
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

CREATE TABLE usage_events_2026_08
  PARTITION OF usage_events
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');

CREATE TABLE usage_events_2026_09
  PARTITION OF usage_events
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');

CREATE TABLE usage_events_2026_10
  PARTITION OF usage_events
  FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');

CREATE TABLE usage_events_2026_11
  PARTITION OF usage_events
  FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');

CREATE TABLE usage_events_2026_12
  PARTITION OF usage_events
  FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

-- Step 5: Re-create indexes on parent (propagate to partitions)
CREATE INDEX idx_usage_events_org_created
  ON usage_events (org_id, created_at DESC);

CREATE INDEX idx_usage_events_org_customer
  ON usage_events (org_id, external_customer_id, created_at DESC);

CREATE INDEX idx_usage_events_org_feature
  ON usage_events (org_id, feature, created_at DESC);
