CREATE TABLE IF NOT EXISTS services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  archived_at timestamptz
);

CREATE TABLE IF NOT EXISTS monitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES services(id),
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('http', 'ws')),
  state text NOT NULL DEFAULT 'waiting' CHECK (state IN ('waiting', 'healthy', 'down')),
  target_url text,
  expected_status text NOT NULL DEFAULT '2xx',
  token_hash text UNIQUE,
  last_signal_at timestamptz,
  explicit_failure boolean NOT NULL DEFAULT false,
  failures integer NOT NULL DEFAULT 0,
  next_probe_at timestamptz NOT NULL DEFAULT now(),
  probe_claim uuid,
  probe_lease_until timestamptz,
  archived_at timestamptz
);

CREATE INDEX IF NOT EXISTS monitor_due_idx ON monitors (next_probe_at)
  WHERE kind = 'http' AND archived_at IS NULL;

CREATE TABLE IF NOT EXISTS channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('bark', 'webhook', 'email')),
  secret text NOT NULL,
  archived_at timestamptz
);

CREATE TABLE IF NOT EXISTS monitor_channels (
  monitor_id uuid REFERENCES monitors(id),
  channel_id uuid REFERENCES channels(id),
  PRIMARY KEY (monitor_id, channel_id)
);

CREATE TABLE IF NOT EXISTS probes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  monitor_id uuid NOT NULL REFERENCES monitors(id),
  observed_at timestamptz NOT NULL DEFAULT now(),
  ok boolean NOT NULL,
  status_code integer,
  latency_ms integer NOT NULL,
  reason text NOT NULL
);

CREATE INDEX IF NOT EXISTS probes_monitor_time_idx ON probes (monitor_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS probes_retention_idx ON probes (observed_at);

CREATE TABLE IF NOT EXISTS incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monitor_id uuid NOT NULL REFERENCES monitors(id),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  archived boolean NOT NULL DEFAULT false,
  reason text NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS incident_open_idx ON incidents (monitor_id) WHERE closed_at IS NULL;
CREATE INDEX IF NOT EXISTS incident_time_idx ON incidents (opened_at DESC);

CREATE TABLE IF NOT EXISTS deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents(id),
  channel_id uuid NOT NULL REFERENCES channels(id),
  event text NOT NULL CHECK (event IN ('down', 'recovery')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  claim uuid,
  UNIQUE (incident_id, channel_id, event)
);

CREATE INDEX IF NOT EXISTS delivery_due_idx ON deliveries (next_attempt_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS delivery_retention_idx ON deliveries (created_at);
