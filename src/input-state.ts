export type InputMode = "tui" | "rpc" | "json" | "print";
export type InputSource = "interactive" | "rpc" | "extension";

export interface InputSnapshot {
	text: string;
	source: InputSource;
	mode: InputMode;
}

const COMMAND_OR_SHELL_INPUT = /^\s*[\/*!]/;

/** Return true when the editor interaction must remain untouched. */
export function isBypassInput(input: InputSnapshot): boolean {
	return (
		input.mode !== "tui" ||
		input.source === "extension" ||
		input.text.trim().length === 0 ||
		COMMAND_OR_SHELL_INPUT.test(input.text)
	);
}


