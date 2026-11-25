-- Owner-only workflow data. No Etsy API writes. Run once in verified production Neon database.
CREATE TABLE IF NOT EXISTS public.local_factory_workflow (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 title varchar(180) NOT NULL CHECK (length(trim(title)) > 0),
 buyer varchar(120) NOT NULL CHECK (length(trim(buyer)) > 0),
 stage text NOT NULL DEFAULT 'RESEARCH' CHECK (stage IN ('RESEARCH','BLUEPRINT','BUILD','QA','READY','PUBLISHED')),
 notes text NOT NULL DEFAULT '',
 evidence_url text,
 qa_passed boolean NOT NULL DEFAULT false,
 release_evidence jsonb,
 listing_id bigint,
 revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT listing_id_positive CHECK (listing_id IS NULL OR listing_id > 0)
);
CREATE INDEX IF NOT EXISTS local_factory_workflow_updated_idx ON public.local_factory_workflow(updated_at DESC);
