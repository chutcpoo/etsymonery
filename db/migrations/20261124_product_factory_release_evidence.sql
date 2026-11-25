-- Migration for Product Factory issue #298.
-- Apply to a verified staging database first; do NOT run automatically on production.
-- Non-destructive: historic workflow rows have NULL evidence and therefore cannot
-- advance from QA to READY until they acquire verified buyer-release evidence.
ALTER TABLE public.local_factory_workflow
  ADD COLUMN IF NOT EXISTS release_evidence jsonb;
COMMENT ON COLUMN public.local_factory_workflow.release_evidence IS
  'Evidence-backed buyer outcome, per-platform QA and owner approval, tied to candidate SHA256.';
-- Rollback if no workflow row has used this column:
-- ALTER TABLE public.local_factory_workflow DROP COLUMN release_evidence;
