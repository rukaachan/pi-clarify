import type {
	Api,
	AssistantMessage,
	Context,
	ImageContent,
	Model,
	ModelThinkingLevel,
	ProviderHeaders,
	ProviderStreamOptions,
	UserMessage,
} from "@earendil-works/pi-ai";

export const MAX_SYSTEM_PROMPT_LENGTH = 200;
export const SYSTEM_PROMPT =
	"Rewrite the draft as a clear goal with context, scope, and limits. Keep intent. Use minimum sufficient detail. Never answer, solve, or explain. Output only the rewrite.";
export const USER_REWRITE_PREFIX =
	"Rewrite this draft. Do not answer, solve, or explain it:\n\n";

if (SYSTEM_PROMPT.length > MAX_SYSTEM_PROMPT_LENGTH) {
	throw new Error(
		`System prompt exceeds ${MAX_SYSTEM_PROMPT_LENGTH} characters`,
	);
}

export type RewriteModel = Model<Api>;

export interface ClarificationAuth {
	apiKey?: string;
	headers?: ProviderHeaders;
	env?: Record<string, string>;
}

export type ClarificationResponse = Pick<
	AssistantMessage,
	"content" | "stopReason" | "errorMessage"
>;

export type Complete = (
	model: RewriteModel,
	context: Context,
	options: ProviderStreamOptions,
) => Promise<ClarificationResponse>;

export interface ClarificationDependencies {
	complete: Complete;
	resolveAuth(model: RewriteModel): Promise<ClarificationAuth>;
}

export function buildClarificationContext(
	text: string,
	images: readonly ImageContent[] = [],
): Context {
	const content: UserMessage["content"] = [
		{ type: "text", text: `${USER_REWRITE_PREFIX}${text}` },
		...images,
	];

	return {
		systemPrompt: SYSTEM_PROMPT,
		messages: [
			{
				role: "user",
				content,
				timestamp: Date.now(),
			},
		],
	};
}

export async function clarify(
	rawText: string,
	model: RewriteModel,
	dependencies: ClarificationDependencies,
	signal?: AbortSignal,
	images: readonly ImageContent[] = [],
	thinkingLevel?: ModelThinkingLevel,
): Promise<string | null> {
	const text = rawText.trim();
	if (!text) {
		throw new Error("Cannot clarify an empty prompt");
	}

	// Identical draft + model + effort hits LRU — skip LLM
	if (images.length === 0) {
		const cached = getCachedClarify(text, model, thinkingLevel);
		if (cached !== undefined) return cached;
	}

	const auth = await dependencies.resolveAuth(model);
	const response = await dependencies.complete(
		model,
		buildClarificationContext(text, images),
		{
			apiKey: auth.apiKey,
			headers: auth.headers,
			env: auth.env,
			signal,
			cacheRetention: "none",
			...(thinkingLevel ? { reasoning: thinkingLevel } : {}),
		},
	);

	if (response.stopReason === "aborted") {
		return null;
	}

	if (response.stopReason === "error") {
		throw new Error(response.errorMessage ?? "Clarification failed");
	}

	const rewritten = response.content
		.filter(
			(
				content,
			): content is Extract<AssistantMessage["content"][number], { type: "text" }> =>
				content.type === "text",
		)
		.map((content) => content.text)
		.join("\n")
		.trim();

	if (!rewritten) {
		throw new Error("Clarification returned empty text");
	}

	if (images.length === 0) setCachedClarify(text, model, thinkingLevel, rewritten);
	return rewritten;
}

export const defaultComplete: Complete = async (model, context, options) => {
	const { complete: piComplete } = await import("@earendil-works/pi-ai/compat");
	return piComplete(model, context, options);
};

export function createClarifyDependencies(ctx: {
	modelRegistry: { getApiKeyAndHeaders: (m: RewriteModel) => Promise<{ ok: boolean; error?: string; apiKey?: string; headers?: ProviderHeaders; env?: Record<string, string> }> };
}): ClarificationDependencies {
	return {
		complete: defaultComplete,
		resolveAuth: async (model) => {
			const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
			if (!auth.ok) throw new Error(auth.error);
			if (!auth.apiKey) throw new Error(`No API key is available for ${model.provider}`);
			return { apiKey: auth.apiKey, headers: auth.headers, env: auth.env };
		},
	};
}

// LRU cache for identical drafts — avoids re-calling LLM on repeated Alt+G
const CLARIFY_CACHE_MAX = 5;
const clarifyCache = new Map<string, string>();

function clarifyCacheKey(text: string, model: RewriteModel, thinkingLevel?: string): string {
	return `${model.provider}/${model.id}:${thinkingLevel ?? ""}:${text}`;
}

export function getClarifyCacheSize(): number {
	return clarifyCache.size;
}

export function clearClarifyCache(): void {
	clarifyCache.clear();
}

function getCachedClarify(text: string, model: RewriteModel, thinkingLevel?: string): string | undefined {
	return clarifyCache.get(clarifyCacheKey(text, model, thinkingLevel));
}

function setCachedClarify(text: string, model: RewriteModel, thinkingLevel: string | undefined, result: string): void {
	const key = clarifyCacheKey(text, model, thinkingLevel);
	// LRU: re-insert to make most-recent
	if (clarifyCache.has(key)) clarifyCache.delete(key);
	clarifyCache.set(key, result);
	if (clarifyCache.size > CLARIFY_CACHE_MAX) {
		const oldest = clarifyCache.keys().next().value;
		if (oldest !== undefined) clarifyCache.delete(oldest);
	}
}
