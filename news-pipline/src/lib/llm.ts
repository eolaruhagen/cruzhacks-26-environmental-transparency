import pino from "pino";
import { OpenRouter } from "@openrouter/sdk";
import type { Tool, StopWhen, ContextInput } from "@openrouter/sdk";
import type {
    OpenResponsesInputUnion,
    OpenResponsesReasoningConfig,
    OpenResponsesResponseText,
    OpenResponsesMcpTool,
} from "@openrouter/sdk/models"
import type { ArtifactType, ArtifactFormatSpec, StagingArtifact } from "../types";
import type { ToolContextMap } from "@openrouter/sdk/lib/tool-types.js";
import { STORY_NAME_MODEL } from "../config";

const { OPENROUTER_API_KEY } = process.env;

const openrouter = new OpenRouter({
    apiKey: OPENROUTER_API_KEY,
});

export const newsDocumentFormatSpec: ArtifactFormatSpec<"article"> = {
    artifactType: "article",
    formatDescription: "A set of news articles scraped from a news agreggator. Each article provided will have associated people, topics, authors, title, and a short ~150 character snippet from the article",
    serializeArtifacts: (artifacts: StagingArtifact<"article">[]) => {
        return JSON.stringify(artifacts.map(artifact => ({
            title: artifact.metadata.title,
            description: artifact.metadata.description,
            people: artifact.metadata.people,
            topics: artifact.metadata.topics,
            author: artifact.metadata.author,
        })));
    },
};

const formatSpecRegistry: { [K in ArtifactType]?: ArtifactFormatSpec<K> } = {
    article: newsDocumentFormatSpec,
};

export function getDocFormatSpec<K extends ArtifactType>(artifactType: K): ArtifactFormatSpec<K> {
    const spec = formatSpecRegistry[artifactType];
    if (!spec) {
        throw new Error(`Unknown artifact type: "${artifactType}". Available: ${Object.keys(formatSpecRegistry).join(", ")}`);
    }
    return spec as ArtifactFormatSpec<K>;
}

function buildFilterDocumentsSystemPrompt<K extends ArtifactType>(documentFormatSpec: ArtifactFormatSpec<K>): string {
    return `You are a binary relevance classifier for an environmental transparency platform that helps U.S. citizens understand how environmental issues affect them and how their government handles these issues.

THE KEY QUESTION for each document: "Would a person reading this LEARN something meaningful about an environmental issue, environmental policy, or how the environment is being affected?" If the answer is no — if the article is just reporting conditions, forecasts, or events without explaining causes, consequences, or policy context — REJECT it. YOU MUST BE EXTREMELY STRICT IN YOUR JUDGEMENT.

KEEP (true) — documents where a reader learns something about:
- Environmental policy, regulation, or legislation at any level (federal, state, local) from ANY political perspective — pro-regulation, deregulation, industry-friendly, activist. The platform is nonpartisan.
- Climate change: science, impacts, projections, adaptation strategies, or how climate connects to observed events
- Pollution: air quality degradation, water contamination, soil pollution, toxic waste, industrial emissions — the causes, responsible parties, or health consequences
- Energy policy: fossil fuels, renewable energy, energy transition, drilling, pipelines, and the policy debates around them
- Conservation and biodiversity: endangered species, habitat loss, wildlife protection efforts, ecological disruption
- Environmental justice: communities disproportionately affected by pollution, industrial siting, or climate impacts
- Resource extraction: mining, deforestation, water rights disputes, land use conflicts
- Corporate environmental accountability: emissions reporting, ESG regulation, sustainability commitments, greenwashing
- Environmental litigation: lawsuits, EPA enforcement, regulatory rollbacks or advances
- Environmental consequences of disasters, military operations, or industrial accidents — focusing on the environmental dimension, not just the event itself

REJECT (false) — documents that do NOT teach the reader about environmental issues:
- Weather forecasts, daily/weekly weather reports, temperature predictions, storm warnings. These report CONDITIONS, not environmental ISSUES. Reject even if they mention "fire danger," "burn ban," "high winds," or "drought conditions" — unless the article explicitly analyzes WHY these conditions are worsening over time or connects them to climate/policy.
- Local fire weather statements, red flag warnings, burn bans presented as safety advisories
- Cherry blossom blooms, fall foliage, seasonal nature tourism, garden tours
- Pet stories, zoo animals, aquarium exhibits, viral animal videos
- Gardening tips, houseplant care, landscaping advice
- General politics, sports, entertainment, celebrity news without environmental substance
- Stock/commodity market reports unless analyzing environmental regulation impacts
- Local infrastructure (bike lanes, water mains, road closures) unless explicitly framed as environmental policy
- Retirement/lifestyle/travel articles that happen to mention climate or nature
- Routine emergency response coverage (fire crews dispatched, evacuation orders) without environmental analysis
- Articles that are not in english or veer on the side of an advertisement

BORDERLINE — lean KEEP only when the article provides INSIGHT, not just information:
- A heat wave article that explains the climate trend behind it → KEEP. A heat wave article that just says "it will be 95°F tomorrow" → REJECT.
- A wildfire article that discusses land management policy, ecological damage, or climate connection → KEEP. A wildfire article that reports acres burned and evacuation routes → REJECT.
- A flooding article that examines why floods are worsening, infrastructure failures, or policy response → KEEP. A flooding article that reports "roads closed, shelters open" → REJECT.

INPUT FORMAT:
${documentFormatSpec.formatDescription}

OUTPUT FORMAT:
Return ONLY a JSON object. No explanation, no preamble, no markdown fencing.
The object must have a single key "filterValue" containing a boolean array.
Each boolean corresponds to the document at that index: true = keep, false = reject.
The array length MUST equal the number of input documents.

Example:
Input: [doc0, doc1, doc2]
Output: {"filterValue":[true,false,true]}`
}


/**
 * Calls an LLM to classify each artifact as environmentally relevant or not.
 * Returns the text response — caller validates with parseFilterResponse.
 * Throws on SDK errors (401, 402, 429, 503, etc.)
 */
export async function filterDocuments<K extends ArtifactType>(
    model: string,
    artifacts: StagingArtifact<K>[],
    artifactFormatSpec: ArtifactFormatSpec<K>
): Promise<string> {
    const result = openrouter.callModel({
        model,
        instructions: buildFilterDocumentsSystemPrompt(artifactFormatSpec),
        input: artifactFormatSpec.serializeArtifacts(artifacts),
        reasoning: { effort: "medium" },
        text: { format: { type: "json_object" } },
    });

    return await result.getText();
}





export class ModelStream {
    private _model: string | null = null;
    private _instructions: string | null = null;
    private _reasoning: OpenResponsesReasoningConfig | null = null;
    private _text: OpenResponsesResponseText | null = null;
    private _tools: (Tool | OpenResponsesMcpTool)[] = [];
    private _chatState: OpenResponsesInputUnion | null = null;
    private _stopWhen: StopWhen | null = null;
    private _context: ContextInput<ToolContextMap<readonly Tool[]>> | undefined;

    model(model: string): this {
        this._model = model;
        return this;
    }

    instructions(instructions: string): this {
        this._instructions = instructions;
        return this;
    }

    /** Initial input (string) or existing conversation history (message array) for resume */
    input(input: OpenResponsesInputUnion): this {
        this._chatState = input;
        return this;
    }

    reasoning(reasoning: OpenResponsesReasoningConfig): this {
        this._reasoning = reasoning;
        return this;
    }

    /** Structured output format — json_object or json_schema for typed extraction */
    text(text: OpenResponsesResponseText): this {
        this._text = text;
        return this;
    }

    /** SDK tools (local execution) and/or MCP tools (remote via OpenRouter proxy) */
    tools(tools: (Tool | OpenResponsesMcpTool)[]): this {
        this._tools = tools;
        return this;
    }

    stopWhen(stopWhen: StopWhen): this {
        this._stopWhen = stopWhen;
        return this;
    }

    /** Shared + per-tool context (DB connections, API clients, etc.) */
    context(context: ContextInput<ToolContextMap<readonly Tool[]>>): this {
        this._context = context;
        return this;
    }

    /** Execute and return the SDK result object — caller decides how to consume (stream, getText, etc.) */
    execute() {
        if (!this._model) throw new Error("ModelStream: model is required");
        if (!this._chatState) throw new Error("ModelStream: input is required");

        return openrouter.callModel({
            model: this._model,
            instructions: this._instructions ?? undefined,
            input: this._chatState,
            reasoning: this._reasoning ?? undefined,
            text: this._text ?? undefined,
            tools: this._tools.length > 0 ? this._tools as Tool[] : undefined,
            stopWhen: this._stopWhen ?? undefined,
            context: this._context ?? undefined,
        });
    }
}

const storyNamingLogger = pino({ name: "story-naming" });

const STORY_NAME_PROMPT = `You are a headline writer for an environmental news platform.
Given an article's title and enrichment summary, generate a concise 5-8 word story headline
that captures the broader environmental topic or event (not just this single article).

Rules:
- 5 to 8 words only
- No quotes, no punctuation at the end
- Noun-phrase or short declarative style (like a newspaper section header)
- Focus on the environmental TOPIC, not the specific article
- Return ONLY the headline text, nothing else`;

export interface StoryNamingContext {
    title: string;
    summary: string;
}

/**
 * Extract naming context from StagingArtifacts.
 */
export function artifactsToNamingContext<K extends ArtifactType>(
    artifacts: StagingArtifact<K>[],
): StoryNamingContext[] {
    return artifacts.map(a => {
        const meta = typeof a.metadata === "string" ? JSON.parse(a.metadata) : a.metadata;
        return { title: meta?.title ?? "", summary: a.enrichment?.summary ?? "" };
    });
}

/**
 * Generate a short story name from naming context entries (title + summary pairs).
 * Uses up to 5 entries to give the LLM context for a broader topic headline.
 * Falls back to a truncated title of the first entry if the LLM call fails.
 */
export async function generateStoryName(
    contexts: StoryNamingContext[],
): Promise<string> {
    if (contexts.length === 0) throw new Error("No naming contexts provided");

    const entries = contexts.slice(0, 5).map(c =>
        `Title: ${c.title}\nSummary: ${c.summary}`
    );
    const input = entries.join("\n---\n");

    const fallbackTitle = contexts[0]!.title;

    try {
        const result = new ModelStream()
            .model(STORY_NAME_MODEL)
            .instructions(STORY_NAME_PROMPT)
            .input(input)
            .execute();

        const text = await result.getText();
        const cleaned = text.trim().replace(/^["']|["']$/g, "");

        if (cleaned.length > 0 && cleaned.length < 120) {
            return cleaned;
        }

        storyNamingLogger.warn({ raw: text }, "LLM returned unusable story name, falling back");
    } catch (error) {
        storyNamingLogger.warn({ error }, "story name generation failed, falling back to title");
    }

    return buildFallbackName(fallbackTitle);
}

function buildFallbackName(title: string): string {
    const words = title.split(/\s+/).slice(0, 7);
    return words.join(" ") || "Untitled Story";
}