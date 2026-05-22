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

Migrations are managed exclusively through the Supabase CLI against the **local**
Postgres instance. The maintainer never authorizes prod writes from an agent
session — production rollouts happen out-of-band through CI / the Supabase
dashboard.

- **Apply migrations only via `supabase migration up --local`.** Never `psql -f`,
  never `supabase db push`, never `mcp__supabase-local__apply_migration` unless
  the CLI path is genuinely broken and the user explicitly asks for the bypass.
  The CLI is the only path that updates `supabase_migrations.schema_migrations`,
  which is what every other tool (incl. `supabase migration repair`, the
  dashboard's drift detection, `gen types`) reads to know what's applied.
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
  `bill-pipline/` service imports it via the `@cruzhacks/shared` alias.
  Stale types are why `supabase-js` calls start complaining about
  "column does not exist."
- **Verify on apply.** After `supabase migration up --local` succeeds, confirm
  the version was recorded:
  `psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c "SELECT version FROM supabase_migrations.schema_migrations WHERE version = '<ts>';"`
  A successful CLI run that doesn't appear in the table means the DDL was
  rolled back inside the migration (usually a stray `ROLLBACK;` at the end).
- **Never apply to prod from an agent.** If the user asks for a deploy, the
  answer is "push to main, let the GitHub Actions workflow handle it" — not
  `supabase db push --linked`.

## Code comments

Keep comments minimal. The maintainer reads the business logic from the code
itself — explanatory prose about "what this does" or "why we're doing this"
is noise. Comment only when:

- The syntax is quirky or non-obvious (e.g. PG-specific volatility quirks,
  TS type-narrowing tricks, why a function is SECURITY DEFINER).
- There's a real footgun a future reader would step on (e.g. "this must run
  before X" because of an undocumented ordering constraint).
- The reason for a workaround can't be inferred from the diff (citing a
  bug, version, or vendor behavior).

Don't restate Zod schemas in English. Don't narrate "we then call the
backend." Don't write file-banner blurbs explaining the file's purpose —
the filename and exports already do. Section banners (`// --- name ---`)
are fine as visual separators but shouldn't carry paragraphs of prose.

When in doubt: delete the comment.

## Web UI Architecture

### Navigation & Layout
- **Top Nav Bar**: Persistent navigation across the application.
  - **Home**: Navigates back to the Landing Page.
  - **Graph**: Interface to select categories and generate data visualizations.
  - **News**: Feed of news articles correlated with specific legislation.
  - **Search**: Global search feature for finding bills, news, and topics.

### Page Definitions

#### 1. Landing Page
- The main entry point for the user, providing an overview of the platform's purpose.

#### 2. Category Pages
Dedicated views for specific environmental categories.
- **Graph**: Visual analytics specific to the selected category.
- **News (Trending)**: A feed of trending news articles relevant to the category.
- **Search**: Scoped search functionality within the category.

#### 3. POTUS Performance Tracker
A specialized dashboard for tracking executive performance regarding environmental legislation.
- **Bill Status & Quantity (Bar Graph)**: 
  - Visualizes the number of bills and their current status (e.g., signed, vetoed, pending).
- **Performance Metrics (Shaded Base Graph)**: 
  - A visual representation (area chart/heatmap) tracking performance indicators over time.

## Database Schema

### Table: `Bills`
Primary storage for legislative bills. Designed for vector search capabilities.

| Column Name | Type | Constraints | Indexing | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `Id` | `UUID` | `NOT NULL` | **Create Index** | Primary identifier. |
| `Name` | `STRING` | `NOT NULL` | | Official name of the bill. |
| `Short Description` | `STRING` | `NOT NULL` | | Summary text. |
| `Embedding` | `Vector(768)` | `NULLABLE` | | For semantic search. Back-generated via post-insert trigger/process. |
| `Category` | `ENUM` | | **Create Index** | Classification for filtering and analysis. |

### Table: `News_data`
Storage for news articles linked to environmental topics.

| Column Name | Type | Constraints | Indexing | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `Article_id` | `UUID` | `NOT NULL` | | Primary identifier. |
| `Description` | `STRING` | `NOT NULL` | | Article content/summary. |
| `Related_category` | `ENUM` | `NOT NULL` | | Foreign key reference to category logic. |

## Architecture Overview
- **`client/`**: Frontend application (Web UI).
- **`n8n/`**: Workflow automation (likely for data pipelines, news fetching).
- **`serverless/`**: Backend infrastructure (APIs, embedding generation, database interactions).
