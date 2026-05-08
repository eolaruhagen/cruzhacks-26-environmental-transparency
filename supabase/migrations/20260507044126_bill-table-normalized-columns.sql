-- Target schema for the bills pipeline rewrite.
--
-- Strategy: build new tables (`states`, `representatives`, `house_bills_2`)
-- side-by-side with the existing `house_bills`. The new worker writes here.
-- Cutover later by dropping the old `house_bills` and renaming
-- `house_bills_2` -> `house_bills`.
--
-- Purely additive — no existing object is altered. Safe to ship to prod
-- whenever; new tables sit unused until the worker writes to them.

BEGIN;

-- ===========================================================================
-- Enums
-- ===========================================================================

-- Bill type as it appears in Congress API response data fields (uppercase, no
-- dots). See packages/shared/src/api/congress.types.ts BillTypeSchema. The
-- lowercase URL-param form lives in code only and is never persisted.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type
    WHERE typname = 'legislation_type'
      AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  ) THEN
    CREATE TYPE public.legislation_type AS ENUM (
      'HR', 'S', 'HJRES', 'SJRES', 'HCONRES', 'SCONRES', 'HRES', 'SRES'
    );
  END IF;
END $$;

-- Party affiliation. Three values cover ~99.9% of post-1990 sponsors.
-- Add values (e.g. 'Libertarian') with `ALTER TYPE ... ADD VALUE` when needed.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type
    WHERE typname = 'party'
      AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  ) THEN
    CREATE TYPE public.party AS ENUM ('Democrat', 'Republican', 'Independent');
  END IF;
END $$;

-- Chamber. Used both for `house_bills_2.origin_chamber` (which chamber a bill
-- originates in) and `representatives.role` (a Senator's role IS "Senate").
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type
    WHERE typname = 'chamber'
      AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  ) THEN
    CREATE TYPE public.chamber AS ENUM ('House', 'Senate', 'Joint');
  END IF;
END $$;



CREATE TABLE IF NOT EXISTS public.states (
  code      text PRIMARY KEY,                     -- "CA", "DC", "PR", "GU", etc.
  name      text NOT NULL,                        -- "California"
  kind      text NOT NULL CHECK (kind IN ('state', 'district', 'territory'))
);

INSERT INTO public.states (code, name, kind) VALUES
  ('AL', 'Alabama',        'state'),    ('AK', 'Alaska',         'state'),
  ('AZ', 'Arizona',        'state'),    ('AR', 'Arkansas',       'state'),
  ('CA', 'California',     'state'),    ('CO', 'Colorado',       'state'),
  ('CT', 'Connecticut',    'state'),    ('DE', 'Delaware',       'state'),
  ('FL', 'Florida',        'state'),    ('GA', 'Georgia',        'state'),
  ('HI', 'Hawaii',         'state'),    ('ID', 'Idaho',          'state'),
  ('IL', 'Illinois',       'state'),    ('IN', 'Indiana',        'state'),
  ('IA', 'Iowa',           'state'),    ('KS', 'Kansas',         'state'),
  ('KY', 'Kentucky',       'state'),    ('LA', 'Louisiana',      'state'),
  ('ME', 'Maine',          'state'),    ('MD', 'Maryland',       'state'),
  ('MA', 'Massachusetts',  'state'),    ('MI', 'Michigan',       'state'),
  ('MN', 'Minnesota',      'state'),    ('MS', 'Mississippi',    'state'),
  ('MO', 'Missouri',       'state'),    ('MT', 'Montana',        'state'),
  ('NE', 'Nebraska',       'state'),    ('NV', 'Nevada',         'state'),
  ('NH', 'New Hampshire',  'state'),    ('NJ', 'New Jersey',     'state'),
  ('NM', 'New Mexico',     'state'),    ('NY', 'New York',       'state'),
  ('NC', 'North Carolina', 'state'),    ('ND', 'North Dakota',   'state'),
  ('OH', 'Ohio',           'state'),    ('OK', 'Oklahoma',       'state'),
  ('OR', 'Oregon',         'state'),    ('PA', 'Pennsylvania',   'state'),
  ('RI', 'Rhode Island',   'state'),    ('SC', 'South Carolina', 'state'),
  ('SD', 'South Dakota',   'state'),    ('TN', 'Tennessee',      'state'),
  ('TX', 'Texas',          'state'),    ('UT', 'Utah',           'state'),
  ('VT', 'Vermont',        'state'),    ('VA', 'Virginia',       'state'),
  ('WA', 'Washington',     'state'),    ('WV', 'West Virginia',  'state'),
  ('WI', 'Wisconsin',      'state'),    ('WY', 'Wyoming',        'state'),
  ('DC', 'District of Columbia',          'district'),
  ('PR', 'Puerto Rico',                   'territory'),
  ('GU', 'Guam',                          'territory'),
  ('VI', 'U.S. Virgin Islands',           'territory'),
  ('AS', 'American Samoa',                'territory'),
  ('MP', 'Northern Mariana Islands',      'territory')
ON CONFLICT (code) DO NOTHING;

-- ===========================================================================
-- representatives
-- ===========================================================================
-- Bioguide-keyed record of every sponsor / cosponsor we encounter. The worker
-- upserts here as a side-effect of processing each bill. `is_active` is
-- maintained by a separate sweep job (not in this migration).

CREATE TABLE IF NOT EXISTS public.representatives (
  bioguide_id   text PRIMARY KEY,                 -- e.g. "K000388"
  first_name    text,
  middle_name   text,
  last_name     text,
  party         public.party,
  state         text REFERENCES public.states(code),
  district      integer,                          -- NULL for senators / at-large
  role          public.chamber NOT NULL,
  url           text,                             -- bioguide.congress.gov URL

  is_active                  boolean NOT NULL DEFAULT true,
  last_seen_in_congress      integer,             -- e.g. 119

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS representatives_state_idx
  ON public.representatives (state);
CREATE INDEX IF NOT EXISTS representatives_active_idx
  ON public.representatives (is_active)
  WHERE is_active = true;

CREATE TRIGGER trg_representatives_set_updated_at
  BEFORE UPDATE ON public.representatives
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ===========================================================================
-- house_bills_2
-- ===========================================================================
-- Target shape for the rewrite. Same row count as `house_bills` long-term,
-- but normalized: separate type/number columns, sponsor + cosponsors as FKs
-- to representatives, structured action codes.
--
-- Note on enum naming collision: column `category` uses the existing
-- `public.bill_type` enum (the ML category enum), while column `bill_type`
-- uses `public.legislation_type` (the API bill type). Names are crossed but
-- both predate this migration; renaming `bill_type` enum -> `bill_category`
-- is a separate cleanup not in scope here.

CREATE TABLE IF NOT EXISTS public.house_bills_2 (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Composite natural key
  congress           integer NOT NULL,
  bill_type          public.legislation_type NOT NULL,
  bill_number        integer NOT NULL,

  -- Display / canonical
  title              text NOT NULL,
  url                text,                        -- legislationUrl from API
  bill_text          text,
  origin_chamber     public.chamber NOT NULL,

  -- Dates (mix of date + timestamptz mirrors API wire formats)
  date_of_introduction                date,
  congress_start_year                 integer NOT NULL,
  congress_end_year                   integer NOT NULL,
  congress_update_date                timestamptz,
  congress_update_date_including_text timestamptz,

  -- Sponsorship
  sponsor_bioguide_id      text REFERENCES public.representatives(bioguide_id),
  cosponsor_bioguide_ids   text[] NOT NULL DEFAULT '{}',
  num_cosponsors           integer NOT NULL DEFAULT 0,

  -- Latest action
  latest_action            text,
  latest_action_date       date,
  latest_action_code       text,
  latest_action_type       text,

  -- Law (when bill became law)
  is_law                   boolean NOT NULL DEFAULT false,
  law_type                 text,
  law_number               text,

  -- Subjects / committees / summary
  subject_terms            text[] NOT NULL DEFAULT '{}',
  bill_policy_area         text,
  latest_summary           text,
  committees               text[] NOT NULL DEFAULT '{}',

  -- ML enrichment
  category                 public.bill_type,
  embedding                extensions.halfvec(1536),
  subcategory_scores       jsonb,

  -- Audit
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),

  UNIQUE (congress, bill_type, bill_number)
);

CREATE INDEX IF NOT EXISTS house_bills_2_sponsor_idx
  ON public.house_bills_2 (sponsor_bioguide_id);
CREATE INDEX IF NOT EXISTS house_bills_2_category_idx
  ON public.house_bills_2 (category)
  WHERE category IS NOT NULL;
CREATE INDEX IF NOT EXISTS house_bills_2_introduced_idx
  ON public.house_bills_2 (date_of_introduction);
CREATE INDEX IF NOT EXISTS house_bills_2_congress_idx
  ON public.house_bills_2 (congress);

CREATE TRIGGER trg_house_bills_2_set_updated_at
  BEFORE UPDATE ON public.house_bills_2
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();


-- All three tables are public-readable (the UI surfaces them) but only the
-- worker (service_role) writes. service_role bypasses RLS entirely, so we
-- only need to declare what anon + authenticated can do — and that's read,
-- nothing else.

ALTER TABLE public.states          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.representatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.house_bills_2   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "states: anon+auth read"
  ON public.states
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "representatives: anon+auth read"
  ON public.representatives
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "house_bills_2: anon+auth read"
  ON public.house_bills_2
  FOR SELECT
  TO anon, authenticated
  USING (true);

COMMIT;
