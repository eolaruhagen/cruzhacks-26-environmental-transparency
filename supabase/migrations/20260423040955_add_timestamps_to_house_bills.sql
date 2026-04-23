-- Add created_at and updated_at to house_bills.
-- created_at is set once on INSERT.
-- updated_at is auto-bumped on every UPDATE via the trigger below
-- (DEFAULT alone would NOT update on row changes — Postgres has no MySQL-style
--  ON UPDATE CURRENT_TIMESTAMP; you need a trigger).

ALTER TABLE public.house_bills
    ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
    ADD COLUMN bill_text text, NOT NULL DEFAULT "";
    ADD COLUMN congress_number int NOT NULL DEFAULT 0;
    ADD COLUMN congress_years int[] NOT NULL DEFAULT '{}';

-- Reusable trigger function. CREATE OR REPLACE makes it safe to re-run and
-- lets future tables share the same function.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;
SECURITY INVOKER;

CREATE TRIGGER trg_house_bills_set_updated_at
    BEFORE UPDATE ON public.house_bills
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_artifacts_set_updated_at
    BEFORE UPDATE ON public.artifacts
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();