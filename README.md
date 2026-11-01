# pi-clarify

Rewrite your Pi editor draft into a clear request before sending it.

Press **Alt+G** to rewrite the current editor text. The clarified draft replaces the editor. Press **Enter** to submit it.

This package is not published to npm. It is meant to be used from a local checkout.

## Requirements

- Pi 1.4.0 or newer
- Node.js 22.19 or newer

## Install from a local copy

Clone or copy this directory somewhere permanent, then install it by path:

```bash
pi install /path/to/pi-clarify
```

Restart Pi or run `/reload`. Check that Pi sees the package:

```bash
pi list
```

Pi records the package path in `~/.pi/agent/settings.json` and loads the extension from that directory. Moving or deleting the directory breaks the install. Run `pi install` again with the new path.

Pi reads the files in place, so after `git pull` you only need `/reload`. There is no reinstall step.

Project scope is also available. Pi loads it only after you trust the project:

```bash
pi install --local /path/to/pi-clarify
```

Try it without installing:

```bash
pi -e /path/to/pi-clarify
```

Remove it with:

```bash
pi remove /path/to/pi-clarify
```

This is a local package, so Pi does not install its dependencies. It has none at runtime: everything it imports is provided by Pi. You only need `npm install` to run the typecheck and tests.

## Usage

- **Alt+G** rewrites the editor draft. The result replaces the draft in the editor. Press **Enter** to send it.
- **Esc** or **Ctrl+C** cancels the rewrite and restores the original draft.
- **/clarify** opens a picker for the clarify model and reasoning level.
- **/clarify some draft text** saves the picker choice and clarifies that text immediately, placing the result in the editor.

While the rewrite runs, the editor shows a short scramble animation.

Alt+G leaves the draft untouched in these cases:

- the editor is empty or whitespace only
- the draft starts with `/`, `*`, or `!`
- Pi is not running in the interactive TUI

If the request fails, Pi shows the error and restores the original draft. An empty model response also counts as a failure, so the editor never receives a blank rewrite.

## Configure

`/clarify` asks for two things:

1. **Model**: the session model (default) or any model available in Pi.
2. **Reasoning level**: shown only for models that support reasoning. Pick `off` to use the model default.

The choice is saved to `~/.config/pi-clarify/config.json`, or `$XDG_CONFIG_HOME/pi-clarify/config.json` when `XDG_CONFIG_HOME` is an absolute path:

```json
{
  "modelKey": "anthropic/claude-sonnet-4-5",
  "effort": "high"
}
```

If the saved model is no longer available, clarify falls back to the session model. Selecting "Use session model" removes the override.

## How it works

Each clarification is one isolated request. Pi sends the draft and a fixed rewrite instruction, with no conversation history and no tools. The instruction tells the model to keep your intent, use the minimum detail needed, and never answer or explain the draft.

The request uses the credentials Pi already has for the selected model. Cached responses are disabled for the request.

Identical drafts are cached in memory (up to 5 entries) for the same model and reasoning level, so pressing Alt+G twice does not call the model twice.

## Develop

```bash
npm install
npm test        # node --experimental-strip-types --test tests/*.test.ts
npm run typecheck
```

Pi loads TypeScript extensions with jiti, so there is no build step. Tests cover the clarification request and failure paths, input bypass rules, and the scramble animation.

## License

MIT
