-- Phase 6 Product Impact Agent: normalized security entities, Story links, and row-per-product
-- impact records with an append-oriented history. Story lifecycle, grouping and digests are never
-- mutated by these tables.

CREATE TABLE security_entities (
  id             bigserial PRIMARY KEY,
  kind           text NOT NULL CHECK (kind IN ('vendor', 'product_family')),
  canonical_name text NOT NULL CHECK (length(canonical_name) BETWEEN 1 AND 200),
  aliases        text[] NOT NULL DEFAULT '{}',
  provenance     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, canonical_name)
);

CREATE INDEX security_entities_kind_name_idx ON security_entities (kind, lower(canonical_name));

CREATE TABLE story_entities (
  id          bigserial PRIMARY KEY,
  story_id    bigint NOT NULL REFERENCES stories (id),
  entity_id   bigint NOT NULL REFERENCES security_entities (id),
  role        text NOT NULL CHECK (role IN ('vendor', 'affected_product', 'mentioned_product')),
  evidence_id uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (story_id, entity_id, role)
);

CREATE INDEX story_entities_story_idx ON story_entities (story_id);

-- One row per product/model impact conclusion. The current state of a Story is the set of rows with
-- status 'current'; superseded rows move through impact_version to keep a traceable history. Low
-- confidence rows are persisted as persisted_kind 'unknown_only' with no claims (contract §7).
CREATE TABLE product_impacts (
  id                 bigserial PRIMARY KEY,
  public_id          uuid NOT NULL UNIQUE,
  story_id           bigint NOT NULL REFERENCES stories (id),
  impact_version     integer NOT NULL CHECK (impact_version > 0),
  run_id             uuid NOT NULL,
  status             text NOT NULL DEFAULT 'current' CHECK (status IN ('current', 'superseded')),
  persisted_kind     text NOT NULL DEFAULT 'claims' CHECK (persisted_kind IN ('claims', 'unknown_only')),
  vendor_entity_id   bigint NOT NULL REFERENCES security_entities (id),
  product_entity_id  bigint NOT NULL REFERENCES security_entities (id),
  cve_id             text CHECK (cve_id IS NULL OR cve_id ~ '^CVE-\d{4}-\d{4,}$'),
  models             text[] NOT NULL DEFAULT '{}',
  affected_range     jsonb,
  fixed_range        jsonb,
  mitigations        text[] NOT NULL DEFAULT '{}',
  confidence         text NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
  routing            text NOT NULL CHECK (routing IN ('auto', 'human_review', 'unknown')),
  exploit_status     jsonb NOT NULL,
  unknowns           text[] NOT NULL DEFAULT '{}',
  evidence_ids       uuid[] NOT NULL CHECK (cardinality(evidence_ids) BETWEEN 1 AND 20),
  created_at         timestamptz NOT NULL DEFAULT now(),
  superseded_at      timestamptz,
  CHECK (jsonb_typeof(affected_range) = 'object'),
  CHECK (jsonb_typeof(fixed_range) = 'object'),
  CHECK (jsonb_typeof(exploit_status) = 'object'),
  CHECK ((persisted_kind = 'claims' AND cardinality(models) >= 0) OR persisted_kind = 'unknown_only'),
  UNIQUE (story_id, product_entity_id, impact_version, run_id)
);

CREATE INDEX product_impacts_current_idx ON product_impacts (story_id, id) WHERE status = 'current';
CREATE INDEX product_impacts_history_idx ON product_impacts (story_id, impact_version DESC);

-- Medium-confidence rows and matcher failures route here instead of becoming auto-persisted claims.
CREATE TABLE impact_human_reviews (
  id           bigserial PRIMARY KEY,
  public_id    uuid NOT NULL UNIQUE,
  story_id     bigint NOT NULL REFERENCES stories (id),
  run_id       uuid NOT NULL,
  reason       text NOT NULL CHECK (length(reason) BETWEEN 1 AND 2000),
  payload      jsonb NOT NULL,
  status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  resolved_at  timestamptz,
  CHECK (jsonb_typeof(payload) = 'object')
);

CREATE INDEX impact_human_reviews_open_idx ON impact_human_reviews (story_id, created_at DESC) WHERE status = 'open';
