# Claude Code session routing

A Claude Code session that loads pstack runs the `SessionStart` hook, which prints the routing instruction, and the model sees it. Claude Code ignores the plugin's `rules/` directory.

## Sub-features

- `cc-hook` runs `hooks/session-start.mjs claude` on startup and exits 0.
- `cc-context` puts the routing instruction in the model's context.
- `cc-no-rule` leaves `rules/pstack-routing.md` out of the context.
- `cc-skills` registers the `pstack:` skills.

## How to get to it (user POV)

- Start `claude` with pstack installed, or with `--plugin-dir` pointing at a checkout.

## Driving it with node scripts

Preconditions:

- `claude --version` prints a version, and the account is signed in.

- **Probe.** Run `node $V/probe-plugin.mjs <scratch>/cc-<n> --mark hooks/session-start-context.md=<A> --mark rules/pstack-routing.md=<B>`. The output lists the three wrapped hook files and both marks.
- **Session.** Run `node $V/run-claude.mjs <scratch>/cc-<n> "Verification probe. Call no tools. Quote any line in your context that starts with 'Verification marker:'. If none, say NONE."`. Exit code 0.
- **Host record.** Run `node $V/read-log.mjs claude <scratch>/cc-<n>/claude.jsonl --find <A> --find <B>`. `plugins` lists `pstack pstack@inline <scratch>/cc-<n>/plugin` and no other pstack, `hooks` has `SessionStart:startup` with exit 0, `markersDelivered` and `markersInHookOutput` each have `<A>: true` and `<B>: false`, and `result` quotes `<A>` only.
- **Hook run.** Run `node $V/read-log.mjs hooks <scratch>/cc-<n>/hooks.jsonl`. One run of `node "${CLAUDE_PLUGIN_ROOT}/hooks/session-start.mjs" claude`, exit 0, with `CLAUDE_PLUGIN_ROOT` set to the probe's plugin directory and stdout ending in the `<A>` marker.

## Gotchas

- Without `--setting-sources project,local`, the user's installed pstack loads beside the probe, and the stream shows two pstack plugins.
- The marker reaches the context only through the hook's stdout. Check `markersDelivered`, which reads the session transcript's `api-request-blob` records, not only the reply. It is `null` when the transcript is missing.
- `--bare` skips hooks, so do not use it here.
