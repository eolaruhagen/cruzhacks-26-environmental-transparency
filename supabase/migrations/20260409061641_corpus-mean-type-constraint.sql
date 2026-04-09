ALTER TABLE IF EXISTS pipelines.corpus_mean
ADD CONSTRAINT corpus_mean_type_unique UNIQUE (artifact_type);

