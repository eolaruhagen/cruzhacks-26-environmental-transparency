import type { Node } from "networkanalysis-ts/run"
const baseArticleMap: Map<string, { storyId: string | null, embedding: number[] }> = new Map([
    ["1", { storyId: "a", embedding: [0, 0, 0] }],
    ["2", { storyId: "a", embedding: [0, 0, 0] }],
    ["3", { storyId: "a", embedding: [0, 0, 0] }],
    ["4", { storyId: "b", embedding: [0, 0, 0] }],
    ["5", { storyId: "b", embedding: [0, 0, 0] }],
    ["6", { storyId: "b", embedding: [0, 0, 0] }],
    ["7", { storyId: "b", embedding: [0, 0, 0] }],
    ["8", { storyId: "b", embedding: [0, 0, 0] }],
    ["9", { storyId: "c", embedding: [0, 0, 0] }],
    ["10", { storyId: "c", embedding: [0, 0, 0] }],
    ["11", { storyId: "c", embedding: [0, 0, 0] }],
    ["12", { storyId: "c", embedding: [0, 0, 0] }],
    ["13", { storyId: "d", embedding: [0, 0, 0] }],
    ["14", { storyId: "d", embedding: [0, 0, 0] }],
    ["15", { storyId: "d", embedding: [0, 0, 0] }],
    ["16", { storyId: "d", embedding: [0, 0, 0] }],
    ["17", { storyId: "f", embedding: [0, 0, 0] }],
    ["18", { storyId: "f", embedding: [0, 0, 0] }],
    ["19", { storyId: "g", embedding: [0, 0, 0] }],
    ["20", { storyId: null, embedding: [0, 0, 0] }],
    ["21", { storyId: null, embedding: [0, 0, 0] }],
    ["22", { storyId: null, embedding: [0, 0, 0] }],
    ["23", { storyId: null, embedding: [0, 0, 0] }],
    ["24", { storyId: null, embedding: [0, 0, 0] }],
    ["25", { storyId: null, embedding: [0, 0, 0] }],
]);

const fullyUnassignedArticleMap: Map<string, { storyId: string | null, embedding: number[] }> = new Map([
    ["1", { storyId: null, embedding: [0, 0, 0] }],
    ["2", { storyId: null, embedding: [0, 0, 0] }],
    ["3", { storyId: null, embedding: [0, 0, 0] }],
    ["4", { storyId: null, embedding: [0, 0, 0] }],
    ["5", { storyId: null, embedding: [0, 0, 0] }],
    ["6", { storyId: null, embedding: [0, 0, 0] }],
    ["7", { storyId: null, embedding: [0, 0, 0] }],
]);

const expectedNodesTest1: Node[] = [
    // 3-3 split with story A and B -> new story -> 3 stories leaving B and all leaving A (to be deleted)
    { id: "1", cluster: 0 },
    { id: "2", cluster: 0 },
    { id: "3", cluster: 0 },
    { id: "4", cluster: 0 },
    { id: "5", cluster: 0 },
    { id: "6", cluster: 0 },
    // 2 from b, 3 from c -> cluster 1, rest leave B (to be deleted) and 2 more stories added to C
    { id: "7", cluster: 1 },
    { id: "8", cluster: 1 },
    { id: "9", cluster: 1 },
    { id: "10", cluster: 1 },
    { id: "11", cluster: 1 },
    // last artifact in C stays in its cluster, C remains as a story with one artifact
    { id: "12", cluster: 2 },
    // all artifacts in D untouched, story unchanged
    { id: "13", cluster: 3 },
    { id: "14", cluster: 3 },
    { id: "15", cluster: 3 },
    { id: "16", cluster: 3 },
    // artifacts 17, 18 (f) and 20, 21, 22 (null) merge into cluster 4 -> new story + 2 artifacts removed from f -> f gets deleted
    { id: "17", cluster: 4 },
    { id: "18", cluster: 4 },
    // story g stays untouched, still its own story with one artifact
    { id: "19", cluster: 5 },
    { id: "20", cluster: 4 },
    { id: "21", cluster: 4 },
    { id: "22", cluster: 4 },
    // these three form a new story
    { id: "23", cluster: 7 },
    { id: "24", cluster: 7 },
    { id: "25", cluster: 7 },
];

// Null assignments should throw an error after running leidens (DONT CHANGE THIS ONE)
const invalidNodesTest1: Node[] = [
    { id: "1", cluster: 0 },
    { id: "2", cluster: 0 },
    { id: "3", cluster: 0 },
    { id: "4", cluster: 0 },
    { id: "5", cluster: 0 },
    { id: "6", cluster: 0 },
    { id: "7", cluster: 1 },
    { id: "8", cluster: 1 },
    { id: "9", cluster: 1 },
    { id: "10", cluster: 1 },
    { id: "11", cluster: 1 },
    { id: "12", cluster: 2 },
    { id: "13" },
    { id: "14" },
    { id: "15" },
    { id: "16" },
    { id: "17" },
    { id: "18" },
    { id: "19", cluster: 4 },
    { id: "20" },
    { id: "21" },
    { id: "22" },
    // these three form a new story
    { id: "23", cluster: 5 },
    { id: "24", cluster: 5 },
    { id: "25", cluster: 5 },
];

// all unassigned -> every cluster becomes a new story, no updates, no deletes
const expectedNodesTest2: Node[] = [
    { id: "1", cluster: 0 },
    { id: "2", cluster: 0 },
    { id: "3", cluster: 0 },
    { id: "4", cluster: 1 },
    { id: "5", cluster: 1 },
    { id: "6", cluster: 1 },
    { id: "7", cluster: 1 },
];

// single giant cluster absorbs everything
// all stories should be deleted
const expectedNodesTest3: Node[] = [
    { id: "1", cluster: 0 },
    { id: "2", cluster: 0 },
    { id: "3", cluster: 0 },
    { id: "4", cluster: 0 },
    { id: "5", cluster: 0 },
    { id: "6", cluster: 0 },
    { id: "7", cluster: 0 },
    { id: "8", cluster: 0 },
    { id: "9", cluster: 0 },
    { id: "10", cluster: 0 },
    { id: "11", cluster: 0 },
    { id: "12", cluster: 0 },
    { id: "13", cluster: 0 },
    { id: "14", cluster: 0 },
    { id: "15", cluster: 0 },
    { id: "16", cluster: 0 },
    { id: "17", cluster: 0 },
    { id: "18", cluster: 0 },
    { id: "19", cluster: 0 },
    { id: "20", cluster: 0 },
    { id: "21", cluster: 0 },
    { id: "22", cluster: 0 },
    { id: "23", cluster: 0 },
    { id: "24", cluster: 0 },
    { id: "25", cluster: 0 },
];

// every node is its own cluster (singletons)
const expectedNodesTest4: Node[] = baseArticleMap.size > 0
    ? Array.from(baseArticleMap.keys()).map((id, i) => ({ id, cluster: i }))
    : [];

import { describe, test, expect } from "bun:test";
import { consolidateClusters, type ClusteringConsolidation } from "../leidensalg";

describe("consolidateClusters", () => {
    // test 1: mixed reassignment with splits, merges, new stories, and deletions
    test("mixed cluster reassignment produces correct updates, new stories, and deletions", () => {
        const result = consolidateClusters(expectedNodesTest1, baseArticleMap);

        // cluster 0: 3 from a + 3 from b -> no majority -> new story
        // cluster 1: 2 from b + 3 from c -> c wins 60% -> update c, pull 7,8 from b
        // cluster 2: 1 from c -> c wins -> no update to c (nothing new added)
        // cluster 3: 4 from d -> d wins -> no update to d (nothing new added)
        // cluster 4: 2 from f + 3 null -> majority for null artifacts -> new story
        // cluster 5: 1 from g -> g wins -> no update to g (nothing new added)
        // cluster 7: 3 null -> new story

        // only c gets updated (receives 7,8 from b), d and g stay fully intact
        expect(result.updateStories.size).toBe(1);
        expect(result.updateStories.has("c")).toBe(true);
        expect(result.updateStories.has("d")).toBe(false);
        expect(result.updateStories.has("g")).toBe(false);

        // c gets 7,8 pulled from b
        const cUpdate = result.updateStories.get("c")!;
        expect(cUpdate.newPublicTableArtifactIds.sort()).toEqual(["7", "8"]);
        expect(cUpdate.newPipelineArtifactIds).toEqual([]);

        // 3 new stories created
        expect(result.newStories.length).toBe(3);

        // new story from cluster 0: all public (1-6), no pipeline
        const newStory0 = result.newStories.find(s =>
            s.publicTableArtifactIds.includes("1")
        )!;
        expect(newStory0.publicTableArtifactIds.sort()).toEqual(["1", "2", "3", "4", "5", "6"]);
        expect(newStory0.pipelineArtifactIds).toEqual([]);

        // new story from cluster 4: 17,18 public + 20,21,22 pipeline
        const newStory4 = result.newStories.find(s =>
            s.publicTableArtifactIds.includes("17")
        )!;
        expect(newStory4.publicTableArtifactIds.sort()).toEqual(["17", "18"]);
        expect(newStory4.pipelineArtifactIds.sort()).toEqual(["20", "21", "22"]);

        // new story from cluster 7: all pipeline (23-25)
        const newStory7 = result.newStories.find(s =>
            s.pipelineArtifactIds.includes("23")
        )!;
        expect(newStory7.publicTableArtifactIds).toEqual([]);
        expect(newStory7.pipelineArtifactIds.sort()).toEqual(["23", "24", "25"]);

        // a lost all 3, b lost all 5, f lost both -> all deleted
        expect(result.deleteStories.sort()).toEqual(["a", "b", "f"]);
    });

    // test 2: fully unassigned article map -> everything is new, nothing to update or delete
    test("all unassigned artifacts produce only new stories", () => {
        const result = consolidateClusters(expectedNodesTest2, fullyUnassignedArticleMap);

        expect(result.updateStories.size).toBe(0);
        expect(result.deleteStories).toEqual([]);
        expect(result.newStories.length).toBe(2);

        const story0 = result.newStories.find(s => s.pipelineArtifactIds.includes("1"))!;
        expect(story0.pipelineArtifactIds.sort()).toEqual(["1", "2", "3"]);
        expect(story0.publicTableArtifactIds).toEqual([]);

        const story1 = result.newStories.find(s => s.pipelineArtifactIds.includes("4"))!;
        expect(story1.pipelineArtifactIds.sort()).toEqual(["4", "5", "6", "7"]);
        expect(story1.publicTableArtifactIds).toEqual([]);
    });

    // test 3: one mega-cluster absorbs everything -> b wins majority (5/25), rest are new/removed
    // b has 5 members, next biggest is d with 4 -> b has 5/25 = 20%, no majority -> entire thing is a new story
    test("single mega-cluster with no majority creates one new story and deletes all existing", () => {
        const result = consolidateClusters(expectedNodesTest3, baseArticleMap);

        expect(result.updateStories.size).toBe(0);
        expect(result.newStories.length).toBe(1);

        const megaStory = result.newStories[0]!;
        // 19 public artifacts (ids 1-19), 6 pipeline (20-25)
        expect(megaStory.publicTableArtifactIds.length).toBe(19);
        expect(megaStory.pipelineArtifactIds.length).toBe(6);

        // every story gets deleted since all public articles moved to new story
        expect(result.deleteStories.sort()).toEqual(["a", "b", "c", "d", "f", "g"]);
    });

    // test 4: every node is its own singleton cluster -> each public artifact stays in its story (majority 1/1)
    // pipeline artifacts each become a new single-article story
    test("singleton clusters keep all stories alive and create per-pipeline new stories", () => {
        const result = consolidateClusters(expectedNodesTest4, baseArticleMap);

        // each story's members are each in their own cluster with 1/1 majority -> story survives
        // because of this there should be NO updated stories, as all stay in their own places
        expect(result.updateStories.size).toBe(0);
        expect(result.deleteStories).toEqual([]);

        // no artifacts moved between stories
        for (const [, update] of result.updateStories) {
            expect(update.newPublicTableArtifactIds).toEqual([]);
            expect(update.newPipelineArtifactIds).toEqual([]);
        }

        // since nothing is moved and there are 6 pipeline artifacts -> 6 new singleton stories
        expect(result.newStories.length).toBe(6);
        for (const story of result.newStories) {
            expect(story.pipelineArtifactIds.length).toBe(1);
            expect(story.publicTableArtifactIds).toEqual([]);
        }
    });

    // test 5: unclustered nodes should throw
    test("nodes without cluster assignment throws", () => {
        expect(() => consolidateClusters(invalidNodesTest1, baseArticleMap)).toThrow(
            /unclustered node found/
        );
    });

    // test 6: nodes array length != articleMap size should throw
    test("mismatched nodes length and articleMap size throws", () => {
        const tooFewNodes: Node[] = [{ id: "1", cluster: 0 }];
        expect(() => consolidateClusters(tooFewNodes, baseArticleMap)).toThrow(
            /does not match articleMap size/
        );
    });
});