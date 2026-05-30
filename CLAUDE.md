# Project: Environmental Transparency Platform

## Agent collaboration

This is a long-lived codebase that the maintainer often works on across
multi-day, 24h+ sessions. To preserve the main agent's context window:

- **Prefer subagents (Opus) for code creation work** — drafting new files,
  writing test suites, scaffolding parallel components. Delegate with a tight
  spec (conventions to mirror, files to read, interface to produce) so the
  result lands ready-to-review in the main thread without consuming context on
  exploration or generation.
- Keep the main agent focused on design decisions, integration, review of
  subagent output, and edits that depend on the live conversation state.
- Research-style exploration (grep, locate symbol, "where is X defined") also
  belongs in Explore subagents — return findings, not raw tool output.
- Inline edits and small targeted changes don't need a subagent; the overhead
  isn't worth it under ~50 lines or for trivial modifications.

## Database migrations

Migrations are managed exclusively through the Supabase CLI against the
**local** Postgres instance. The maintainer never authorizes prod writes from an
agent session — production rollouts happen out-of-band through CI / the Supabase
dashboard.

- **Apply migrations only via `supabase migration up --local`.** Never
  `psql -f`, never `supabase db push`, never
  `mcp__supabase-local__apply_migration` unless the CLI path is genuinely broken
  and the user explicitly asks for the bypass. The CLI is the only path that
  updates `supabase_migrations.schema_migrations`, which is what every other
  tool (incl. `supabase migration repair`, the dashboard's drift detection,
  `gen types`) reads to know what's applied.
- **`--local` is non-negotiable.** Every migration command in this repo runs
  against the local dockerized Postgres on port 54322. If a command silently
  defaults to a linked project, that's a bug to surface, not a default to
  follow.
- **One migration per logical change.** Files are timestamped
  `YYYYMMDDHHMMSS_<kebab-name>.sql` and live in `supabase/migrations/`. Don't
  edit a migration after applying it — write a new migration to fix or revert.
- **Re-generate types after schema-touching migrations**:
  `supabase gen types --lang=typescript --local --schema public > packages/shared/src/database.types.ts`.
  This is the single source of truth for the schema; the Bun-side
  `bill-pipline/` service imports it via the `@cruzhacks/shared` alias. Stale
  types are why `supabase-js` calls start complaining about "column does not
  exist."
- **Verify on apply.** After `supabase migration up --local` succeeds, confirm
  the version was recorded:
  `psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c "SELECT version FROM supabase_migrations.schema_migrations WHERE version = '<ts>';"`
  A successful CLI run that doesn't appear in the table means the DDL was rolled
  back inside the migration (usually a stray `ROLLBACK;` at the end).
- **Never apply to prod from an agent.** If the user asks for a deploy, the
  answer is "push to main, let the GitHub Actions workflow handle it" — not
  `supabase db push --linked`.

## Code comments

Keep comments minimal. The maintainer reads the business logic from the code
itself — explanatory prose about "what this does" or "why we're doing this" is
noise. Comment only when:

- The syntax is quirky or non-obvious (e.g. PG-specific volatility quirks, TS
  type-narrowing tricks, why a function is SECURITY DEFINER).
- There's a real footgun a future reader would step on (e.g. "this must run
  before X" because of an undocumented ordering constraint).
- The reason for a workaround can't be inferred from the diff (citing a bug,
  version, or vendor behavior).

Don't restate Zod schemas in English. Don't narrate "we then call the backend."
Don't write file-banner blurbs explaining the file's purpose — the filename and
exports already do. Section banners (`// --- name ---`) are fine as visual
separators but shouldn't carry paragraphs of prose.

When in doubt: delete the comment.

## TypeScript casts

Never write `as unknown as T` in production code. The double-cast disables the
type checker wholesale and almost always hides a fixable modeling problem:

- supabase-js result not matching your shape → align the Zod schema's inferred
  type to the DB `Insert`/`Row` type, or regenerate `database.types.ts`. A cast
  here frequently means the types are just stale.
- a value that is genuinely JSON typed as `Record<string, unknown>` → type it as
  `Json` at the source (the `jsonSchema` Zod validator), don't cast at the
  boundary.
- a loose / `unknown` value → narrow it with a type guard, not a cast.

Single `as T` casts are also suspect — prefer a type guard or a precise type.

Before adding ANY cast, confirm `bunx tsc --noEmit` actually fails without it.
These casts are routinely cargo-culted in when the code already type-checks.

The one acceptable use of `as unknown as T` is a test that deliberately
constructs an invalid value to exercise a runtime validation guard. Keep it
local to the test.

## Zod schemas across packages

`bill-pipline`, `packages/shared`, and the root each resolve their own `zod`
install. Importing a *runtime Zod schema* from another package and composing it
(e.g. as a field inside a local `z.strictObject`) silently corrupts parsing —
sibling fields come back `undefined` because Zod's internal brand checks fail
across instances, and tsc won't catch it. Define schemas in the package that
composes them. Importing inferred **types** across packages is fine.
