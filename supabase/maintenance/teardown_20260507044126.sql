-- Teardown for migration 20260507044126_bill-table-normalized-columns.sql.
-- Run with: psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f teardown_20260507044126.sql
--
-- IF EXISTS guards make this safe to run even on a partially-applied state.
-- No CASCADE — if a type can't be dropped because something still references
-- it, that's a signal to investigate, not auto-cascade.
--
-- Includes legacy enum names (`representative_role`, `representative_chamber`,
-- `normalization_state`) in case an earlier draft of the migration was applied.

BEGIN;

-- Triggers (drop before tables; tables would drop them automatically but
-- explicit is fine and works even if the table is already gone).
DROP TRIGGER IF EXISTS trg_house_bills_2_set_updated_at ON public.house_bills_2;
DROP TRIGGER IF EXISTS trg_representatives_set_updated_at ON public.representatives;

-- Tables — order matters: house_bills_2 -> representatives -> states.
DROP TABLE IF EXISTS public.house_bills_2;
DROP TABLE IF EXISTS public.representatives;
DROP TABLE IF EXISTS public.states;

-- Enums introduced (or attempted) by this migration line and its prior drafts.
DROP TYPE IF EXISTS public.chamber;
DROP TYPE IF EXISTS public.representative_chamber;
DROP TYPE IF EXISTS public.representative_role;
DROP TYPE IF EXISTS public.normalization_state;
DROP TYPE IF EXISTS public.party;
DROP TYPE IF EXISTS public.legislation_type;

COMMIT;
