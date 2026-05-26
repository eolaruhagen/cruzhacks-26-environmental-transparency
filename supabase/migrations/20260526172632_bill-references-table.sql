-- References extraction lands two tables.
--
-- public.cited_references is the DIM: one row per unique
-- (kind, normalized_key) pair. The same act, USC section, or treaty cited
-- by 50 different bills is ONE row here. Stage 2's metadata cache
-- ({url, summary, …}) lives in a sibling table that FKs into this one — so
-- a single Wikipedia / Cornell LII / eCFR fetch covers every bill that
-- cites the same thing.
--
-- public.bill_references is the LINK: one row per (bill, mention). Carries
-- the per-mention surface metadata the frontend needs to render an
-- annotation in the right place (raw text, context window, character
-- span, source field). Many rows per bill, many rows per cited_reference.
--
-- Enums (over CHECK constraints) so the generated TS types in
-- packages/shared/src/database.types.ts surface real string unions, not
-- bare `text`. Cheaper at the typing site and refactor-safe.

CREATE TYPE public.reference_kind AS ENUM (
    'named_law',
    'public_law',
    'usc',
    'usc_et_seq',
    'cfr',
    'fed_reg',
    'executive_order',
    'treaty',
    'stat_at_large'
);

CREATE TYPE public.reference_source AS ENUM ('bill_text', 'summary');

-- ---------------------------------------------------------------------------
-- DIM: the thing being cited
-- ---------------------------------------------------------------------------

CREATE TABLE public.cited_references (
    id              uuid                  PRIMARY KEY DEFAULT gen_random_uuid(),
    kind            public.reference_kind NOT NULL,
    normalized_key  text                  NOT NULL,
    normalized      jsonb                 NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz           NOT NULL DEFAULT now(),
    UNIQUE (kind, normalized_key)
);

CREATE INDEX cited_references_normalized_key_idx
    ON public.cited_references (normalized_key);

ALTER TABLE public.cited_references ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cited_references_read_anon"
    ON public.cited_references
    FOR SELECT
    TO anon, authenticated
    USING (true);

-- ---------------------------------------------------------------------------
-- LINK: bill X mentions cited_reference Y at position Z
-- ---------------------------------------------------------------------------
-- ON DELETE CASCADE for the bill side: deleting a bill purges its mentions.
-- ON DELETE RESTRICT for the cited_references side: don't let a stray DELETE
-- on the dim quietly orphan links. Garbage-collecting unused dim rows is a
-- separate, deliberate operation.

CREATE TABLE public.bill_references (
    id            uuid                    PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_id       uuid                    NOT NULL REFERENCES public.house_bills_2(id)    ON DELETE CASCADE,
    reference_id  uuid                    NOT NULL REFERENCES public.cited_references(id) ON DELETE RESTRICT,
    raw           text                    NOT NULL,
    context       text,
    span_start    integer,
    span_end      integer,
    source        public.reference_source NOT NULL,
    is_self_ref   boolean                 NOT NULL DEFAULT false,
    created_at    timestamptz             NOT NULL DEFAULT now()
);

CREATE INDEX bill_references_bill_id_idx
    ON public.bill_references (bill_id);

CREATE INDEX bill_references_reference_id_idx
    ON public.bill_references (reference_id);

ALTER TABLE public.bill_references ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bill_references_read_anon"
    ON public.bill_references
    FOR SELECT
    TO anon, authenticated
    USING (true);
