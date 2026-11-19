---
name: verify
description: Drive pstack live in Claude Code, VS Code Copilot sessions, and VS Code Local sessions, and prove from each host's own log what reached the model. Use before a release that changes hooks, the routing rule, a mapping, or a manifest, to recheck a VS Code claim in docs/reference.md, or when asked to verify pstack in VS Code or Claude Code.
---

# Verify pstack in its hosts

pstack has no app to start. The surface is what each host loads from `plugins/pstack/` and hands to the model: hook output, the Local routing rule, skills, agents. A proof drives a real session on a probe copy of the plugin and reads the host's own log. The model's reply alone proves nothing, and a negative counts only when the host's log shows it too.

Scripts live in `scripts/` beside this file. Run them with `node`. Each prints JSON. Set `V=.claude/skills/verify/scripts` from the repository root.

## Launch

1. **Probe copy.** `node $V/probe-plugin.mjs <scratch>/<new dir> --mark hooks/session-start-context.md=<WORD1> --mark rules/pstack-routing.md=<WORD2>` copies `plugins/pstack` to `<dir>/plugin`. It routes every hook command through `hook-wrapper.mjs` into `<dir>/hooks.jsonl` and appends `Verification marker: <WORD>` to each marked file. Use a new directory and new words for every probe. A Copilot session keeps its own copy of the plugin per source path, so an edit after the first session never reaches it.
2. **Claude Code.** No instance to start. `node $V/run-claude.mjs <dir> "<prompt>"` runs `claude -p --model haiku --setting-sources project,local --plugin-dir <dir>/plugin` with stream-json and hook events, from an empty `<dir>/ws`. Leaving out user settings drops the user's installed pstack, so only the probe loads. The stream lands in `<dir>/claude.jsonl`.
3. **VS Code.** Each run gets its own instance, separate from the user's VS Code. `<instance>` is the output of `node $V/vscode-instance.mjs path <name>`, a short `pv-<name>` directory under `/tmp` (under the temp directory on Windows), or under `$PV_ROOT` when set:
   - `node $V/vscode-instance.mjs setup <instance> --session copilot|local --plugin <dir>/plugin [--model <id>]`
   - `node $V/vscode-instance.mjs launch <instance>`

   Setup creates `<instance>/copilot-home` and writes the instance's `settings.json` with `chat.pluginLocations`, the agent debug log, and the two harness settings. `chat.defaultToCopilotHarness` and `chat.editor.preferCopilotHarness` decide the session type. Set to `true` they give Copilot sessions, and set to `false` they give Local sessions, with no picker click. `--model` stores the chat model the picker would remember, such as `claude-haiku-4.5` for Copilot. It copies the user's VS Code GitHub sign-in (the `github.auth` secret row of their `state.vscdb`) into the instance's database, so the instance is signed in without a browser. The same macOS keychain key decrypts it. `launch` and `send` set `COPILOT_HOME=<instance>/copilot-home` for the instance, so the Copilot agent host and its runtime never read or write the user's `~/.copilot`. Keep the instance path short, under 60 characters, which is why `path` uses `/tmp` and not `os.tmpdir()`, whose macOS value is long. VS Code puts its main socket in the user data directory, macOS caps socket paths near 104 bytes, and with a long path the instance exits with no log.

   Ready means the agent host has listed its models: `grep -q "Found [0-9]* models" <instance>/user-data/logs/*/agenthost.log`. Before that, a Copilot prompt can run on another model than the one stored.

## Doctor

- `node $V/read-log.mjs policy` reads the user's cached account policy read-only. `chat_preview_features_enabled: false` means VS Code forces chat hooks off, so Local sessions run no hook. Pass `--user-data-dir <instance>/user-data` to read an instance's copy. A new instance has no cached policy, so it fetches one at launch. A running VS Code loads its cached policy at start and refetches only when the cache is older than an hour. Its hourly refetch skips while the window is unfocused and runs when the window regains focus. Run `Developer: Sync Account Policy` (`workbench.action.syncAccountPolicy`) from the Command Palette to pick up a policy change at once.
- `pgrep -fl -- "--user-data-dir <instance>"` shows the instance's main process. `vscode-instance.mjs` refuses to set up over a running instance.
- In `setup` output, `githubAuthCopied: false` means the user's VS Code is not signed in to GitHub, and the instance will not reach Copilot.

## Drive

- **Send a prompt.** `node $V/vscode-instance.mjs send <instance> "<prompt with a unique token>"`. It runs `code-insiders chat` with `VSCODE_PORTABLE` and `COPILOT_HOME` set to the instance, so the prompt reaches that instance and not the user's last active window. `code-insiders chat` takes no `--user-data-dir`. Each prompt opens a new session. The output's `since` is the timestamp the readers need.
- **Read Copilot.** `node $V/read-log.mjs copilot --instance <instance> --since <since> --match <token> --wait 150 --find <WORD1> --find <WORD2>`. It finds the new `<instance>/copilot-home/session-state/<id>/events.jsonl` whose first prompt contains the token, waits for `hook.end` with `agentStop`, and reports hooks with their context, skills, tools, subagents, the selected and used models, input tokens, warnings, replies, and which markers appear anywhere in the log.
- **Read Local.** `node $V/read-log.mjs local --since <since> --match <token> --wait 150 --user-data-dir <instance>/user-data --find ...`. It reads `User/workspaceStorage/<hash>/GitHub.copilot-chat/debug-logs/<sid>/main.jsonl` and reports the `Resolve Customizations` entries (attached instructions, skills, agents), the `context included` line, models, tools, and replies. Copilot Chat 0.75 also logged `Hook Discovery` and `Instructions Discovery` spans, which the reader prints when present.
- **Read Claude Code.** `node $V/read-log.mjs claude <dir>/claude.jsonl --find ...` reports the loaded plugins, the count of `pstack:` skills, each hook response, tool calls, the result, and the markers in the stream and in the reply.
- **Read the hook wrapper.** `node $V/read-log.mjs hooks <dir>/hooks.jsonl` lists each hook run with its command, exit code, cwd, plugin roots, runtime environment names, stdin, and stdout.
- **Marker probes.** Ask the model to quote every line that starts with `Verification marker:`. A marker in a hook's output proves that hook's output reached the model. A marker in `rules/pstack-routing.md` proves the rule was attached. Confirm with `markersInLog` or `markersInStream`, which come from the host's record and not from the model.

The feature map in `features/` holds the recipe for each check.

## Evidence

Keep, per run, the command, the reader's JSON, and the log it names. Copilot transcripts live in `<instance>/copilot-home/session-state/<id>/`, which `clean` copies to the evidence directory, Claude Code streams stay in the probe directory, and the probe's `hooks.jsonl` stays beside its plugin copy. Local debug logs live inside the instance, so `clean` copies them out.

## Cleanup

1. `node $V/vscode-instance.mjs quit <instance>` stops the instance's main process, found by its `--user-data-dir`.
2. `node $V/vscode-instance.mjs clean <instance> --evidence <scratch>/evidence/<name>` refuses any directory that lacks the `.pstack-verify-instance` marker `setup` writes, then copies the instance's `logs/` and every `debug-logs/` directory to the evidence directory, then deletes the instance, including its copy of the GitHub sign-in. Run it after every run, failed ones too.
3. Delete probe copies when done. Their `hooks.jsonl` is evidence, so copy it first if the run matters.

Never stop the user's VS Code or a process this run did not start.

## Caveats

- An instance started from an agent's shell inherits that shell's environment. Every hook then sees `CLAUDECODE=1` and `CLAUDE_CODE_*`, and the agent host also sets `CLAUDE_PLUGIN_ROOT` for Copilot hooks. Environment variables cannot tell the runtimes apart.
- `--user-data-dir` isolates VS Code's settings, storage, extensions, and agent plugins. The skill isolates the Copilot home separately: `COPILOT_HOME=<instance>/copilot-home` keeps the agent host off the user's `~/.copilot`, whose `mcp-config.json` the host's runtime can rewrite. Never launch an instance without it, and never read or write `~/.copilot` from this skill. The instance's Copilot home starts empty, so a plugin the user installed with `copilot plugin install` does not load. It does not isolate `~/.claude` or `~/.agents`, so user skills, instructions, and `CLAUDE.md` from those still reach the session.
- Account policy comes from the GitHub account, not the instance. With chat preview features off, Local sessions run no hook, and the wrapper log stays empty. The case with hooks on needs that account setting turned on, which this skill cannot change.
- The chat view's model and session pickers are GUI. This skill avoids them by storing the model and harness settings before launch. A run that needs the picker, such as switching model mid-session, is a manual step.
