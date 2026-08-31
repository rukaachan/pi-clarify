import assert from "node:assert/strict";
import test from "node:test";
import {
	buildClarificationContext,
	clarify,
	MAX_SYSTEM_PROMPT_LENGTH,
	SYSTEM_PROMPT,
	type ClarificationResponse,
	type RewriteModel,
} from "../src/clarification.ts";

const model = {} as RewriteModel;

function response(text: string): ClarificationResponse {
	return {
		stopReason: "stop",
		content: [{ type: "text", text }],
	};
}

test("clarification sends only the draft and fixed instructions", async () => {
	let receivedContext: ReturnType<typeof buildClarificationContext> | undefined;
	let receivedOptions: Record<string, unknown> | undefined;
	const signal = new AbortController().signal;

	const result = await clarify(
		"speed up src/parser.ts without changing the public API",
		model,
		{
			resolveAuth: async () => ({ apiKey: "test-key" }),
			complete: async (_model, context, options) => {
				receivedContext = context;
				receivedOptions = options;
				return response("Optimize src/parser.ts while preserving the public API.");
			},
		},
		signal,
	);

	assert.equal(result, "Optimize src/parser.ts while preserving the public API.");
	assert.equal(
		SYSTEM_PROMPT,
		"Use minimum sufficient specificity as a principle; preserve intent; output a rewrite, not an answer.",
	);
	assert.ok(SYSTEM_PROMPT.length <= MAX_SYSTEM_PROMPT_LENGTH);
	assert.equal(receivedContext?.systemPrompt, SYSTEM_PROMPT);
	assert.equal(receivedContext?.messages.length, 1);
	assert.deepEqual(receivedContext?.messages[0], {
		role: "user",
		content: [
			{
				type: "text",
				text: "speed up src/parser.ts without changing the public API",
			},
		],
		timestamp: receivedContext?.messages[0].timestamp,
	});
	assert.equal(receivedOptions?.apiKey, "test-key");
	assert.equal(receivedOptions?.cacheRetention, "none");
	assert.equal(receivedOptions?.signal, signal);
});

test("clarification preserves image inputs for the isolated request", async () => {
	const image = { type: "image" as const, data: "encoded", mimeType: "image/png" };
	let receivedContent: unknown;

	await clarify(
		"describe this screenshot",
		model,
		{
			resolveAuth: async () => ({}),
			complete: async (_model, context) => {
				receivedContent = context.messages[0].content;
				return response("Describe the screenshot precisely.");
			},
		},
		undefined,
		[image],
	);

	assert.deepEqual(receivedContent, [
		{ type: "text", text: "describe this screenshot" },
		image,
	]);
});

test("an aborted provider request never produces a submission draft", async () => {
	const result = await clarify(
		"clarify this request",
		model,
		{
			resolveAuth: async () => ({}),
			complete: async () => ({
				stopReason: "aborted",
				content: [],
			}),
		},
	);

	assert.equal(result, null);
});

test("empty model output fails closed", async () => {
	await assert.rejects(
		clarify(
			"clarify this request",
			model,
			{
				resolveAuth: async () => ({}),
				complete: async () => response("  "),
			},
		),
		/returned empty text/,
	);
});

test("provider errors are surfaced without rewriting the draft", async () => {
	await assert.rejects(
		clarify(
			"keep this draft",
			model,
			{
				resolveAuth: async () => ({}),
				complete: async () => ({
					stopReason: "error",
					content: [],
					errorMessage: "provider unavailable",
				}),
			},
		),
		/provider unavailable/,
	);
});
