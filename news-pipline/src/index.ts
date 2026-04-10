import pino from "pino";
import { parseArgs } from "util";
import { fetchArtifactsWorker, getFetchStrategy } from "./workers/fetch-worker";
import { close } from "./lib/database";
import { filterWorker } from "./workers/filter-worker";
import { enrichWorker } from "./workers/enrich-worker";
import { clusterPublishWorker } from "./workers/cluster-publish-worker";
import type { ArtifactType } from "./types";
import { getDocFormatSpec } from "./lib/llm";

const logger = pino({ name: "pipeline-cli" });

const VALID_ARTIFACT_TYPES: ArtifactType[] = ["article"];

const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
        fetch: { type: "boolean", default: false },
        filter: { type: "boolean", default: false },
        enrich: { type: "boolean", default: false },
        cluster: { type: "boolean", default: false },
        artifact_type: { type: "string", default: "article" },
    },
    strict: true,
});

function validateArtifactType(input: string): ArtifactType {
    if (!VALID_ARTIFACT_TYPES.includes(input as ArtifactType)) {
        throw new Error(`Unknown artifact type: "${input}". Available: ${VALID_ARTIFACT_TYPES.join(", ")}`);
    }
    return input as ArtifactType;
}

async function main() {
    const artifactType = validateArtifactType(values.artifact_type!);

    if (values.fetch) {
        const strategy = getFetchStrategy(artifactType);
        logger.info({ artifactType }, "starting fetch worker");
        await fetchArtifactsWorker(strategy);
    }

    if (values.filter) {
        logger.info({ artifactType }, "starting filter worker");
        const spec = getDocFormatSpec(artifactType);
        await filterWorker(spec);
    }

    if (values.enrich) {
        logger.info({ artifactType }, "starting enrich worker");
        await enrichWorker(artifactType);
    }

    if (values.cluster) {
        logger.info({ artifactType }, "starting cluster-publish worker");
        await clusterPublishWorker(artifactType);
    }
}

main()
    .then(async () => {
        await close();
        process.exit(0);
    })
    .catch(async (error) => {
        logger.fatal(error, "pipeline crashed");
        await close();
        process.exit(1);
    });