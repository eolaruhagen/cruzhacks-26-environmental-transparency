-- Table used to store the mean embedding of the corpus of a certain artifact type: used during enrichment step when generating embedding
-- Must use the embedding mean and mean reduce the artifacts embeddings to get the nuanced embedding for that artifact
CREATE TABLE IF NOT EXISTS pipelines.corpus_mean (
    id SERIAL PRIMARY KEY,
    embedding extensions.halfvec(1536) NOT NULL,
    artifact_type public.artifact_type NOT NULL
);


-- enable row level security for all tables in publich schema (artifacts, artifact_enrichment, article_details, stories) (read only for anon)

ALTER TABLE "public"."artifacts" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon can read artifacts"
  ON "public"."artifacts"
  FOR SELECT
  TO anon
  USING (true);

ALTER TABLE "public"."artifact_enrichments" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon can read artifact_enrichments"
  ON "public"."artifact_enrichments"
  FOR SELECT
  TO anon
  USING (true);

ALTER TABLE "public"."article_details" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon can read article_details"
  ON "public"."article_details"
  FOR SELECT
  TO anon
  USING (true);

ALTER TABLE "public"."stories" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon can read stories"
  ON "public"."stories"
  FOR SELECT
  TO anon
  USING (true);