-- Phase 5 Event Tracking Agent: durable plans and append-only material changes.
-- Story lifecycle, grouping and digests remain independent and are never mutated by these tables.

CREATE TABLE tracking_plans (
  id                           bigserial PRIMARY KEY,
  public_id                    uuid NOT NULL UNIQUE,
  story_id                     bigint NOT NULL UNIQUE REFERENCES stories (id),
  status                       text NOT NULL CHECK (status IN ('active', 'paused', 'stopped')),
  why_track                    text NOT NULL CHECK (length(why_track) BETWEEN 1 AND 4000),
  questions                    jsonb NOT NULL,
  source_targets               text[] NOT NULL,
  next_check_at                timestamptz,
  last_checked_at              timestamptz,
  current_interval_hours       integer NOT NULL CHECK (current_interval_hours BETWEEN 1 AND 8760),
  consecutive_no_change_checks integer NOT NULL DEFAULT 0 CHECK (consecutive_no_change_checks BETWEEN 0 AND 100),
  interval_policy              jsonb NOT NULL,
  stop_condition               jsonb NOT NULL,
  last_snapshot                jsonb,
  last_run_id                  uuid,
  version                      integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at                   timestamptz NOT NULL DEFAULT now(),
  updated_at                   timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(questions) = 'array'),
  CHECK (cardinality(source_targets) BETWEEN 1 AND 20),
  CHECK (jsonb_typeof(interval_policy) = 'object'),
  CHECK (jsonb_typeof(stop_condition) = 'object'),
  CHECK (last_snapshot IS NULL OR jsonb_typeof(last_snapshot) = 'object'),
  CHECK ((status = 'active' AND next_check_at IS NOT NULL) OR status <> 'active'),
  CHECK ((status = 'stopped' AND next_check_at IS NULL) OR status <> 'stopped')
);

CREATE INDEX tracking_plans_due_idx
  ON tracking_plans (next_check_at, id)
  WHERE status = 'active';

CREATE TABLE tracking_changes (
  id              bigserial PRIMARY KEY,
  public_id       uuid NOT NULL UNIQUE,
  plan_id         bigint NOT NULL REFERENCES tracking_plans (id) ON DELETE CASCADE,
  story_id        bigint NOT NULL REFERENCES stories (id),
  run_id          uuid NOT NULL,
  plan_version    integer NOT NULL CHECK (plan_version > 0),
  change_key      text NOT NULL CHECK (length(change_key) BETWEEN 1 AND 160),
  change_type     text NOT NULL CHECK (change_type IN ('vendor_confirmation', 'patch', 'procurement_award', 'material_update')),
  summary         text NOT NULL CHECK (length(summary) BETWEEN 1 AND 4000),
  before_snapshot jsonb NOT NULL,
  after_snapshot  jsonb NOT NULL,
  evidence_ids    uuid[] NOT NULL CHECK (cardinality(evidence_ids) BETWEEN 1 AND 20),
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(before_snapshot) = 'object'),
  CHECK (jsonb_typeof(after_snapshot) = 'object'),
  UNIQUE (plan_id, run_id, change_key)
);

CREATE INDEX tracking_changes_story_time_idx ON tracking_changes (story_id, created_at DESC);
CREATE INDEX tracking_changes_plan_time_idx ON tracking_changes (plan_id, created_at DESC);
