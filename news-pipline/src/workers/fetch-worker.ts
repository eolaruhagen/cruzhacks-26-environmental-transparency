import { fetchArtifacts } from "../lib/externalApis";

const MAX_WORKER_REQUESTS = 120;

export async function fetchArchivesWorker() {
    let cursor: string | undefined = undefined;
    for (let i = 0; i < MAX_WORKER_REQUESTS; i++) {
        const fetchedArtifacts = await fetchArtifacts(cursor);
        if (!fetchedArtifacts.next_cursor) {
            break;
        }
        cursor = fetchedArtifacts.next_cursor;

        // dump everything pulled into staging
    }
}
