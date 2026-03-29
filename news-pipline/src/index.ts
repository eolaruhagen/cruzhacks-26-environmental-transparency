import pino from "pino";
import { parseArgs } from "util";
import { fetchArtifactsWorker, getFetchStrategy } from "./workers/fetch-worker";
import { close } from "./lib/database";

const logger = pino({ name: "pipeline-cli" });

const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
        fetch: { type: "boolean", default: false },
        filter: { type: "boolean", default: false },
        enrich: { type: "boolean", default: false },
        categorize: { type: "boolean", default: false },
        artifact_type: { type: "string", default: "article" },
    },
    strict: true,
});

async function main() {
    if (values.fetch) {
        const strategy = getFetchStrategy(values.artifact_type!);
        logger.info({ artifactType: values.artifact_type }, "starting fetch worker");
        await fetchArtifactsWorker(strategy);
    }

    if (values.filter) {
        logger.info("starting filter worker");
    }

    if (values.enrich) {
        logger.info("starting enrich worker");
    }

    if (values.categorize) {
        logger.info("starting categorize worker");
    }
}

main().catch((error) => {
    logger.fatal(error, "pipeline crashed");
    process.exit(1);
}).finally(() => {
    close();
    process.exit(0);
});