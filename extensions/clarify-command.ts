import type { Api, Model } from "@earendil-works/pi-ai";
import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { SelectItem } from "@earendil-works/pi-tui";
import { clarify, createClarifyDependencies, type RewriteModel } from "../src/clarification.ts";
import { getClarifyEffort, getClarifyModelKey, modelKey, saveClarifyConfig, SESSION_MODEL_VALUE, setClarifySelection } from "../src/clarify-state.ts";
import { showPicker } from "../src/clarify-ui.ts";

const OFF = "__off__";
const CHECK = " ✓";
const EFFORTS = ["minimal", "low", "medium", "high", "xhigh", "max"] as const;

// Simple design — two-step picker, same bordered panel as /advisor

const MODEL_TITLE = "Clarify";
const MODEL_PROSE = [
	"Pick the model for rewriting prompts.",
];

const EFFORT_TITLE = "Reasoning Level";
const EFFORT_PROSE = ["Pick reasoning effort. Higher is more thorough."];

function modelItems(available: Model<Api>[], current: string | undefined): SelectItem[] {
	const items = available.map((m) => {
		const k = modelKey(m);
		return { value: k, label: `${m.name}  (${m.provider})${k === current ? CHECK : ""}` };
	});
	items.unshift({ value: SESSION_MODEL_VALUE, label: `Use session model${current === SESSION_MODEL_VALUE || !current ? CHECK : ""}` });
	return items;
}

function effortItems(picked: Model<Api>): SelectItem[] {
	const levels = getSupportedThinkingLevels(picked).filter((l): l is (typeof EFFORTS)[number] => (EFFORTS as readonly string[]).includes(l));
	return [
		{ value: OFF, label: "off" },
		...levels.map((l) => ({ value: l, label: l === "high" ? `${l} (recommended)` : l })),
	];
}

export default function registerClarifyCommand(pi: ExtensionAPI): void {
	pi.registerCommand("clarify", {
		description: "Configure the clarify model — pick model and reasoning level",
		handler: async (args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("/clarify requires interactive mode", "error");
				return;
			}

			const available = ctx.modelRegistry.getAvailable();
			const currentKey = getClarifyModelKey() ?? SESSION_MODEL_VALUE;

			const choice = await showPicker(ctx, { title: MODEL_TITLE, prose: MODEL_PROSE, items: modelItems(available, currentKey) });
			if (!choice) return;

			if (choice === SESSION_MODEL_VALUE) {
				if (!saveClarifyConfig(undefined, undefined)) {
					ctx.ui.notify("Failed to save clarify selection", "error");
					return;
				}
				setClarifySelection(undefined, undefined);
				ctx.ui.notify("Clarify: using session model", "info");
				return;
			}

			const picked = available.find((m) => modelKey(m) === choice);
			if (!picked) {
				ctx.ui.notify(`Clarify selection not found: ${choice}`, "error");
				return;
			}

			let effort: (typeof EFFORTS)[number] | undefined;
			if (picked.reasoning) {
				const cur = getClarifyEffort() as (typeof EFFORTS)[number] | undefined;
				const res = await showPicker(ctx, {
					title: EFFORT_TITLE,
					prose: EFFORT_PROSE,
					items: effortItems(picked),
					preferredValue: cur ?? "high",
				});
				if (!res) ctx.ui.notify("Effort not set — using model default", "info");
				else effort = res === OFF ? undefined : (res as (typeof EFFORTS)[number]);
			}

			if (!saveClarifyConfig(choice, effort as never)) {
				ctx.ui.notify("Failed to save clarify selection", "error");
				return;
			}
			setClarifySelection(choice, effort as never);
			ctx.ui.notify(`Clarify: ${choice}${effort ? ` @ ${effort}` : ""}`, "info");

			const draft = args?.trim();
			if (draft) {
				try {
					const result = await clarify(draft, picked as RewriteModel, createClarifyDependencies(ctx), undefined, [], effort as never);
					if (result) {
						ctx.ui.setEditorText(result);
						ctx.ui.notify("Clarified draft placed in editor — press Enter to submit", "info");
					}
				} catch (e) {
					ctx.ui.notify(`Clarification failed: ${e instanceof Error ? e.message : String(e)}`, "error");
				}
			}
		},
	});
}
