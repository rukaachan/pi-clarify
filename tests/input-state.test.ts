import assert from "node:assert/strict";
import test from "node:test";
import { isBypassInput, type InputSnapshot } from "../src/input-state.ts";

const normalInput: InputSnapshot = {
	text: "make the parser faster",
	source: "interactive",
	mode: "tui",
};

function withText(text: string): InputSnapshot {
	return { ...normalInput, text };
}

test("empty and whitespace-only input bypasses clarification", () => {
	for (const text of ["", "   ", "\n\t"]) {
		assert.equal(isBypassInput(withText(text)), true);
	}
});

test("slash commands bypass clarification", () => {
	for (const text of ["/model", "  /reload now"]) {
		assert.equal(isBypassInput(withText(text)), true);
	}
});

test("shell commands bypass clarification", () => {
	for (const text of ["!ls", "!!git status", "  ! echo hello"]) {
		assert.equal(isBypassInput(withText(text)), true);
	}
});

test("extension-generated input bypasses clarification", () => {
	assert.equal(isBypassInput({ ...normalInput, source: "extension" }), true);
});

test("non-TUI modes bypass clarification", () => {
	for (const mode of ["rpc", "json", "print"] as const) {
		assert.equal(isBypassInput({ ...normalInput, mode }), true);
	}
});

test("normal tui input does not bypass", () => {
	assert.equal(isBypassInput(normalInput), false);
});
