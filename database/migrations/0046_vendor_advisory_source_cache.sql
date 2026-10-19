-- Phase 6: verified official vendor advisories need the same transient-failure fallback as NVD/KEV.
-- The cache key is the registry-validated canonical advisory URL; cached content remains provenance
-- marked and is used only after a live fetch fails.

ALTER TABLE research_source_cache DROP CONSTRAINT research_source_cache_source_type_check;
ALTER TABLE research_source_cache ADD CONSTRAINT research_source_cache_source_type_check
  CHECK (source_type IN ('nvd', 'kev', 'vendor_advisory'));
