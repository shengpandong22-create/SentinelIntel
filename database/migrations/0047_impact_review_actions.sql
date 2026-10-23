-- Post-Phase 8 hardening: audited, optimistic human resolution for Phase 6 impact reviews.
ALTER TABLE impact_human_reviews
  ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  ADD COLUMN resolved_by text,
  ADD COLUMN resolution_reason text;

CREATE TABLE impact_human_review_actions (
  id              bigserial PRIMARY KEY,
  review_id       bigint NOT NULL REFERENCES impact_human_reviews (id),
  action          text NOT NULL CHECK (action IN ('accept', 'dismiss')),
  actor           text NOT NULL CHECK (length(actor) BETWEEN 1 AND 300),
  reason          text NOT NULL CHECK (length(reason) BETWEEN 1 AND 2000),
  previous_status text NOT NULL CHECK (previous_status IN ('open', 'resolved', 'dismissed')),
  resulting_status text NOT NULL CHECK (resulting_status IN ('resolved', 'dismissed')),
  impact_public_id uuid REFERENCES product_impacts (public_id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX impact_human_review_actions_review_idx
  ON impact_human_review_actions (review_id, created_at, id);
