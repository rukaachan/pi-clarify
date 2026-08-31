const DEFAULT_DURATION_MS = 150;
const DEFAULT_FRAME_MS = 30;
const MAX_DURATION_MS = 600;
const DEFAULT_GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const LETTER_OR_NUMBER = /[\p{L}\p{N}]/u;

export interface ScrambleOptions {
	durationMs?: number;
	frameMs?: number;
	rng?: () => number;
	glyphs?: string;
	signal?: AbortSignal;
}

export interface ScramblePreviewOptions {
	frameMs?: number;
	rng?: () => number;
	glyphs?: string;
	signal: AbortSignal;
}

function splitGraphemes(text: string): string[] {
	if (typeof Intl.Segmenter === "function") {
		const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
		return Array.from(segmenter.segment(text), (part) => part.segment);
	}

	return Array.from(text);
}

function isStableGrapheme(grapheme: string): boolean {
	return !LETTER_OR_NUMBER.test(grapheme);
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(Math.max(value, minimum), maximum);
}

function randomGlyph(glyphs: readonly string[], rng: () => number): string {
	const value = clamp(rng(), 0, 0.999999999);
	return glyphs[Math.floor(value * glyphs.length)] ?? glyphs[0];
}

function createRandomGlyphs(glyphs: string | undefined): string[] {
	const randomGlyphs = Array.from(glyphs ?? DEFAULT_GLYPHS);
	if (randomGlyphs.length === 0) {
		throw new Error("Scramble glyphs cannot be empty");
	}
	return randomGlyphs;
}

function renderFrame(
	target: readonly string[],
	unresolved: readonly number[],
	lockedCount: number,
	randomGlyphs: readonly string[],
	rng: () => number,
): string {
	const locked = new Set(unresolved.slice(0, lockedCount));
	return target
		.map((grapheme, index) => {
			if (isStableGrapheme(grapheme) || locked.has(index)) return grapheme;
			return randomGlyph(randomGlyphs, rng);
		})
		.join("");
}

function wait(milliseconds: number, signal?: AbortSignal): Promise<void> {
	if (signal?.aborted) return Promise.resolve();

	return new Promise((resolve) => {
		let timer: ReturnType<typeof setTimeout> | undefined;
		const finish = (): void => {
			if (timer !== undefined) clearTimeout(timer);
			signal?.removeEventListener("abort", finish);
			resolve();
		};

		timer = setTimeout(finish, milliseconds);
		signal?.addEventListener("abort", finish, { once: true });
	});
}

/** Animate a source string into a target string with a short scramble reveal. */
export async function animateScramble(
	from: string,
	to: string,
	onFrame: (text: string) => void,
	options: ScrambleOptions = {},
): Promise<void> {
	const durationMs = clamp(
		options.durationMs ?? DEFAULT_DURATION_MS,
		0,
		MAX_DURATION_MS,
	);
	const frameMs = Math.max(1, options.frameMs ?? DEFAULT_FRAME_MS);
	const rng = options.rng ?? Math.random;
	const randomGlyphs = createRandomGlyphs(options.glyphs);

	const target = splitGraphemes(to);
	const unresolved = target.flatMap((grapheme, index) =>
		isStableGrapheme(grapheme) ? [] : [index],
	);

	onFrame(from);
	if (from === to) return;
	if (durationMs === 0 || unresolved.length === 0) {
		onFrame(to);
		return;
	}

	const frameCount = Math.max(1, Math.ceil(durationMs / frameMs));
	for (let frame = 1; frame < frameCount; frame += 1) {
		await wait(frameMs, options.signal);
		if (options.signal?.aborted) {
			onFrame(to);
			return;
		}

		const progress = frame / frameCount;
		const lockedCount = Math.floor(progress * unresolved.length);
		onFrame(renderFrame(target, unresolved, lockedCount, randomGlyphs, rng));
	}

	onFrame(to);
}

/** Continuously scramble a text value until the clarification result is ready. */
export async function animateScramblePreview(
	text: string,
	onFrame: (text: string) => void,
	options: ScramblePreviewOptions,
): Promise<void> {
	const frameMs = Math.max(1, options.frameMs ?? DEFAULT_FRAME_MS);
	const rng = options.rng ?? Math.random;
	const randomGlyphs = createRandomGlyphs(options.glyphs);
	const target = splitGraphemes(text);
	const unresolved = target.flatMap((grapheme, index) =>
		isStableGrapheme(grapheme) ? [] : [index],
	);

	if (options.signal.aborted || unresolved.length === 0) return;

	while (!options.signal.aborted) {
		onFrame(renderFrame(target, unresolved, 0, randomGlyphs, rng));
		await wait(frameMs, options.signal);
	}
}
