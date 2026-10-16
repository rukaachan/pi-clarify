import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ImageContent, ModelThinkingLevel } from "@earendil-works/pi-ai";
import { Key } from "@earendil-works/pi-tui";
import { clarify, createClarifyDependencies, type RewriteModel } from "../src/clarification.ts";
import { resolveClarifyModel } from "../src/clarify-state.ts";
import { isBypassInput, isCancelInput } from "../src/input-state.ts";
import { animateScramble, animateScramblePreview } from "../src/text-scramble.ts";

const CLARIFICATION_ERROR = "Clarification failed";

let busy = false;

function toError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}

function setEditorText(ctx: ExtensionContext, text: string): void {
	ctx.ui.setEditorText(text);
	ctx.ui.setWorkingVisible(false);
}

async function clarifyAndReveal(
	rawText: string,
	model: RewriteModel,
	ctx: ExtensionContext,
	images: readonly ImageContent[],
	thinkingLevel?: ModelThinkingLevel,
): Promise<{ kind: "success"; text: string } | { kind: "cancelled" } | { kind: "error"; error: Error }> {
	const controller = new AbortController();
	const previewController = new AbortController();
	let previewText = rawText;
	const unsubscribe = ctx.ui.onTerminalInput((data) => {
		if (isCancelInput(data)) {
			controller.abort();
			previewController.abort();
			return { consume: true };
		}
	});
	let previewError: Error | undefined;
	const previewPromise = animateScramblePreview(
		rawText,
		(text) => {
			previewText = text;
			setEditorText(ctx, text);
		},
		{ signal: previewController.signal },
	).catch((error) => {
		previewError = toError(error);
	});

	try {
		const result = await clarify(rawText, model, createClarifyDependencies(ctx), controller.signal, images, thinkingLevel);
		previewController.abort();
		await previewPromise;
		if (previewError) return { kind: "error", error: previewError };
		if (result === null) return { kind: "cancelled" };
		await animateScramble(previewText, result, (text) => setEditorText(ctx, text), { signal: controller.signal });
		return controller.signal.aborted ? { kind: "cancelled" } : { kind: "success", text: result };
	} catch (error) {
		return { kind: "error", error: toError(error) };
	} finally {
		previewController.abort();
		await previewPromise;
		unsubscribe();
		ctx.ui.setWorkingVisible(true);
	}
}

function resolveModel(ctx: ExtensionContext): { model: RewriteModel; thinkingLevel?: ModelThinkingLevel } | null {
	const resolved = resolveClarifyModel(ctx);
	if (resolved) return resolved as { model: RewriteModel; thinkingLevel?: ModelThinkingLevel };
	if (ctx.model) return { model: ctx.model as RewriteModel, thinkingLevel: ctx.thinkingLevel as ModelThinkingLevel | undefined };
	ctx.ui.notify("No session model is available for clarification.", "error");
	return null;
}

export default function registerClarifyShortcut(pi: ExtensionAPI): void {
	pi.registerShortcut(Key.alt("g"), {
		description: "Clarify editor draft (pi-clarify)",
		handler: async (ctx) => {
			if (!ctx.hasUI || ctx.mode !== "tui") return;
			if (busy) {
				ctx.ui.notify("Clarification is still running.", "info");
				return;
			}
			const rawText = ctx.ui.getEditorText();
			if (isBypassInput({ text: rawText, source: "interactive", mode: "tui" })) {
				// Empty, /command, !shell or extension input — do not clarify
				if (rawText.trim().length === 0) ctx.ui.notify("Nothing to clarify — editor is empty", "info");
				return;
			}
			const resolved = resolveModel(ctx);
			if (!resolved) return;

			// Keep original to restore on cancel/error
			const original = rawText;
			ctx.ui.setWorkingVisible(false);
			busy = true;
			try {
				const result = await clarifyAndReveal(rawText, resolved.model, ctx, [], resolved.thinkingLevel);
				if (result.kind === "success") {
					ctx.ui.notify("Clarified — press Enter to submit", "info");
					return;
				}
				ctx.ui.setEditorText(original);
				if (result.kind === "cancelled") {
					ctx.ui.notify("Clarification cancelled; original draft restored.", "info");
				} else {
					ctx.ui.notify(`${CLARIFICATION_ERROR}: ${result.error.message}`, "error");
				}
			} catch (error) {
				ctx.ui.setEditorText(original);
				ctx.ui.notify(`${CLARIFICATION_ERROR}: ${toError(error).message}`, "error");
			} finally {
				busy = false;
			}
		},
	});
}
