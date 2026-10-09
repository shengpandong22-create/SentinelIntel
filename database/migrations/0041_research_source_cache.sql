CREATE TABLE research_source_cache (
  source_type text NOT NULL CHECK (source_type IN ('nvd')),
  source_key text NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  source_updated_at timestamptz,
  fetched_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_type, source_key)
);

CREATE INDEX research_source_cache_fetched_idx ON research_source_cache (source_type, fetched_at DESC);
