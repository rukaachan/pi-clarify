import { DynamicBorder, type ExtensionContext, type Theme } from "@earendil-works/pi-coding-agent";
import { Container, type SelectItem, SelectList, Spacer, Text } from "@earendil-works/pi-tui";

const MAX_VISIBLE_ROWS = 10;
const NAV_HINT = "type to filter • ↑↓ navigate • enter select • esc cancel";

// Fuzzy — retained reference from /advisor (rpiv-advisor/fuzzy.ts)
function fuzzyScore(query: string, text: string): number | null {
	const q = query.toLowerCase();
	const t = text.toLowerCase();
	if (q.length === 0) return 0;
	let qi = 0;
	let score = 0;
	let streak = 0;
	let prevMatch = -2;
	for (let ti = 0; ti < t.length && qi < q.length; ti++) {
		if (t[ti] !== q[qi]) continue;
		if (prevMatch === ti - 1) {
			streak += 1;
			score += 5 + streak;
		} else {
			streak = 0;
			score += 1;
		}
		const prev = t[ti - 1];
		if (ti === 0 || prev === " " || prev === ":" || prev === "-" || prev === "/" || prev === "@") score += 3;
		prevMatch = ti;
		qi += 1;
	}
	return qi === q.length ? score : null;
}

function filterItems(items: SelectItem[], query: string): SelectItem[] {
	if (query.length === 0) return items;
	return items
		.map((item, idx) => ({ item, idx, score: fuzzyScore(query, `${item.label} ${item.value}`) }))
		.filter((s): s is { item: SelectItem; idx: number; score: number } => s.score !== null)
		.sort((a, b) => b.score - a.score || a.idx - b.idx)
		.map((s) => s.item);
}

function isBackspace(data: string): boolean {
	return data === "\u007f" || data === "\b";
}

function isPrintable(data: string): boolean {
	if (data.length !== 1) return false;
	const code = data.charCodeAt(0);
	return code >= 0x20 && code !== 0x7f;
}

function themeForSelect(theme: Theme) {
	return {
		selectedPrefix: (t: string) => theme.bg("selectedBg", theme.fg("accent", t)),
		selectedText: (t: string) => theme.bg("selectedBg", theme.bold(t)),
		description: (t: string) => theme.fg("muted", t),
		scrollInfo: (t: string) => theme.fg("dim", t),
		noMatch: (t: string) => theme.fg("warning", t),
	};
}

function panel(theme: Theme, title: string, prose: string[], query: string, list: SelectList): Container {
	const c = new Container();
	const border = () => new DynamicBorder((s: string) => theme.fg("accent", s));
	c.addChild(border());
	c.addChild(new Spacer(1));
	c.addChild(new Text(theme.fg("accent", theme.bold(title)), 1, 0));
	c.addChild(new Spacer(1));
	for (const line of prose) {
		c.addChild(new Text(line, 1, 0));
		c.addChild(new Spacer(1));
	}
	c.addChild(new Text(theme.fg(query ? "accent" : "dim", query ? `Filter: ${query}` : "Type to filter…"), 1, 0));
	c.addChild(new Spacer(1));
	c.addChild(list);
	c.addChild(new Spacer(1));
	c.addChild(new Text(theme.fg("dim", NAV_HINT), 1, 0));
	c.addChild(new Spacer(1));
	c.addChild(border());
	return c;
}



export function showPicker(
	ctx: ExtensionContext,
	opts: { title: string; prose: string[]; items: SelectItem[]; preferredValue?: string },
): Promise<string | null> {
	return ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
		let query = "";
		let list!: SelectList;
		let container!: Container;
		const rebuild = () => {
			const filtered = filterItems(opts.items, query);
			list = new SelectList(filtered, Math.min(Math.max(filtered.length, 1), MAX_VISIBLE_ROWS), themeForSelect(theme));
			list.onSelect = (it) => done(it.value);
			list.onCancel = () => done(null);
			if (!query && opts.preferredValue) {
				const idx = filtered.findIndex((it) => it.value === opts.preferredValue);
				if (idx >= 0) list.setSelectedIndex(idx);
			}
			container = panel(theme, opts.title, opts.prose, query, list);
		};
		rebuild();
		return {
			render: (w) => container.render(w),
			invalidate: () => container.invalidate(),
			handleInput: (data) => {
				if (isBackspace(data)) {
					if (query) {
						query = query.slice(0, -1);
						rebuild();
					}
				} else if (isPrintable(data)) {
					query += data;
					rebuild();
				} else {
					list.handleInput(data);
				}
				tui.requestRender();
			},
		};
	});
}
