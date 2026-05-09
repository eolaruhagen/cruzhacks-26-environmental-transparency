import { OpenRouter } from "@openrouter/sdk";
import type { Tool, StopWhen, ContextInput } from "@openrouter/sdk";
import type {
    OpenResponsesInputUnion,
    OpenResponsesReasoningConfig,
    OpenResponsesResponseText,
    OpenResponsesMcpTool,
} from "@openrouter/sdk/models";
import type { ToolContextMap } from "@openrouter/sdk/lib/tool-types.js";


export function getOpenRouter(apiKey: string): OpenRouter {
    return new OpenRouter({ apiKey });
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
    private _client: OpenRouter | null = null;

    model(model: string, client: OpenRouter): this {
        this._model = model;
        this._client = client
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
        if (!this._client) throw new Error("ModelStream: client is required");

        return this._client.callModel({
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