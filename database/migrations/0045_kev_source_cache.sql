-- Phase 6: the KEV catalog join (research-source-cache) needs its own source_type in the cache.
-- Additive: only widens the CHECK; existing 'nvd' rows are untouched.

ALTER TABLE research_source_cache DROP CONSTRAINT research_source_cache_source_type_check;
ALTER TABLE research_source_cache ADD CONSTRAINT research_source_cache_source_type_check
  CHECK (source_type IN ('nvd', 'kev'));
