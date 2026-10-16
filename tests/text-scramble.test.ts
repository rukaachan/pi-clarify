import assert from "node:assert/strict";
import test from "node:test";
import {
	animateScramble,
	animateScramblePreview,
} from "../src/text-scramble.ts";

function collectFrames(
	from: string,
	to: string,
	options: Parameters<typeof animateScramble>[3] = {},
): Promise<string[]> {
	const frames: string[] = [];
	return animateScramble(from, to, (text) => frames.push(text), options).then(
		() => frames,
	);
}

test("scramble preview starts with randomized input frames", async () => {
	const controller = new AbortController();
	const frames: string[] = [];

	const preview = animateScramblePreview(
		"here, text!",
		(text) => frames.push(text),
		{
			frameMs: 10,
			rng: () => 0,
			glyphs: "Z",
			signal: controller.signal,
		},
	);

	assert.equal(frames[0], "ZZZZ, ZZZZ!");
	controller.abort();
	await preview;
	assert.ok(frames.length >= 1);
});

test("scramble animation emits randomized frames and an exact final frame", async () => {
	const frames = await collectFrames("here text", "better text", {
		durationMs: 80,
		frameMs: 10,
		rng: () => 0,
		glyphs: "XYZ",
	});

	assert.ok(frames.length > 2);
	assert.equal(frames[0], "here text");
	assert.equal(frames.at(-1), "better text");
	assert.ok(frames.slice(1, -1).some((frame) => frame.includes("X")));
});

test("different source and target lengths are supported", async () => {
	const frames = await collectFrames("old", "a much longer prompt", {
		durationMs: 50,
		frameMs: 10,
		rng: () => 0.5,
	});

	assert.equal(frames.at(-1), "a much longer prompt");
	assert.ok(frames.slice(1, -1).every((frame) => frame.includes(" ")));
});

test("layout graphemes remain stable during the scramble", async () => {
	const frames = await collectFrames(
		"a,b 😀",
		"x;y 😀",
		{
			durationMs: 60,
			frameMs: 10,
			rng: () => 0,
			glyphs: "Z",
		},
	);

	for (const frame of frames.slice(1, -1)) {
		assert.equal(frame[1], ";");
		assert.equal(frame[3], " ");
		assert.equal(frame.slice(-2), "😀");
	}
	assert.equal(frames.at(-1), "x;y 😀");
});

test("grapheme clusters are not split into malformed intermediate text", async () => {
	const frames = await collectFrames("old", "e\u0301 ✅", {
		durationMs: 40,
		frameMs: 10,
		rng: () => 0,
		glyphs: "Z",
	});

	assert.equal(frames.at(-1), "e\u0301 ✅");
	assert.ok(frames.slice(1, -1).every((frame) => frame.endsWith(" ✅")));
});

test("identical text skips intermediate frames", async () => {
	assert.deepEqual(
		await collectFrames("same text", "same text", {
			durationMs: 100,
			frameMs: 10,
		}),
		["same text"],
	);
});

test("aborting still emits the exact target as the final frame", async () => {
	const controller = new AbortController();
	const frames: string[] = [];

	await animateScramble(
		"before",
		"after",
		(text) => {
			frames.push(text);
			if (frames.length === 2) controller.abort();
		},
		{
			durationMs: 100,
			frameMs: 10,
			rng: () => 0,
			glyphs: "Z",
			signal: controller.signal,
		},
	);

	assert.equal(frames.at(-1), "after");
});

test("preview throttles frames for long drafts", async () => {
	const controller = new AbortController();
	const frames: string[] = [];
	setTimeout(() => controller.abort(), 200);
	await animateScramblePreview(
		"x".repeat(2000),
		(text) => frames.push(text),
		{ signal: controller.signal },
	);
	// default 30ms would give ~6 frames in 200ms; throttled must give <=3
	assert.ok(frames.length <= 3, `got ${frames.length} frames, must throttle`);
});
