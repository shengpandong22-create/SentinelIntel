-- Phase 4 Security Research Agent: immutable run snapshots and external evidence proposals.
-- The Agent never writes core Story/Fact state; deterministic backend code owns these tables.

CREATE TABLE agent_research_runs (
  id              bigserial PRIMARY KEY,
  public_id       uuid NOT NULL UNIQUE,
  story_id        bigint NOT NULL REFERENCES stories (id),
  trace_id        uuid NOT NULL UNIQUE,
  capability_hash text NOT NULL UNIQUE CHECK (capability_hash ~ '^[0-9a-f]{64}$'),
  capability_expires_at timestamptz NOT NULL,
  deadline_at     timestamptz NOT NULL,
  objective       text NOT NULL CHECK (length(objective) BETWEEN 1 AND 2000),
  status          text NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  model           text,
  provider        text,
  prompt_version  text,
  graph_version   text NOT NULL,
  input_snapshot  jsonb NOT NULL,
  output_proposal jsonb,
  tool_trace      jsonb NOT NULL DEFAULT '[]'::jsonb,
  receipt_ids     bigint[] NOT NULL DEFAULT '{}',
  usage           jsonb,
  limits          jsonb NOT NULL,
  tool_calls_used integer NOT NULL DEFAULT 0 CHECK (tool_calls_used >= 0),
  generic_searches_used integer NOT NULL DEFAULT 0 CHECK (generic_searches_used >= 0),
  evidence_documents_used integer NOT NULL DEFAULT 0 CHECK (evidence_documents_used >= 0),
  response_bytes_used bigint NOT NULL DEFAULT 0 CHECK (response_bytes_used >= 0),
  error_code      text,
  error_detail    text,
  started_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(input_snapshot) = 'object'),
  CHECK (jsonb_typeof(tool_trace) = 'array'),
  CHECK (jsonb_typeof(limits) = 'object'),
  CHECK (
    (status = 'running' AND completed_at IS NULL AND output_proposal IS NULL AND error_code IS NULL)
    OR (status = 'completed' AND completed_at IS NOT NULL AND output_proposal IS NOT NULL AND error_code IS NULL)
    OR (status = 'failed' AND completed_at IS NOT NULL AND output_proposal IS NULL AND error_code IS NOT NULL)
  )
);

CREATE INDEX agent_research_runs_story_time_idx ON agent_research_runs (story_id, created_at DESC);
CREATE INDEX agent_research_runs_status_idx ON agent_research_runs (status, created_at DESC);

CREATE TABLE external_evidence (
  id              bigserial PRIMARY KEY,
  public_id       uuid NOT NULL UNIQUE,
  story_id        bigint NOT NULL REFERENCES stories (id),
  research_run_id bigint NOT NULL REFERENCES agent_research_runs (id),
  source_type     text NOT NULL CHECK (length(source_type) BETWEEN 1 AND 64),
  source_name     text NOT NULL CHECK (length(source_name) BETWEEN 1 AND 200),
  canonical_url   text NOT NULL CHECK (canonical_url ~ '^https?://'),
  title           text NOT NULL CHECK (length(title) BETWEEN 1 AND 1000),
  excerpt         text,
  normalized      jsonb NOT NULL DEFAULT '{}'::jsonb,
  content_hash    text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  authority_level text NOT NULL CHECK (authority_level IN ('authoritative', 'primary', 'secondary')),
  published_at    timestamptz,
  source_updated_at timestamptz,
  retrieved_at    timestamptz NOT NULL,
  provenance      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(normalized) = 'object'),
  CHECK (jsonb_typeof(provenance) = 'object'),
  UNIQUE (research_run_id, canonical_url, content_hash)
);

CREATE INDEX external_evidence_story_time_idx ON external_evidence (story_id, retrieved_at DESC);
CREATE INDEX external_evidence_run_idx ON external_evidence (research_run_id);
