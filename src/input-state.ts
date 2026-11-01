export type InputMode = "tui" | "rpc" | "json" | "print";
export type InputSource = "interactive" | "rpc" | "extension";

/** Return true for Esc or Ctrl+C in all key forms (legacy, Kitty, modifyOtherKeys). */
export function isCancelInput(data: string): boolean {
	if (data === "\x1b" || data === "\x03") return true;
	// Kitty CSI u: Ctrl+C is codepoint 99 (c) with ctrl mod 5, e.g. \x1b[99;5u
	// modifyOtherKeys: Ctrl+C variants
	if (/^\x1b\[99;5[;u]/.test(data)) return true;
	if (/^\x1b\[99;5:3u/.test(data)) return true;
	return false;
}

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


