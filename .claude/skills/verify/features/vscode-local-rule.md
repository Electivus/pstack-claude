# VS Code Local session routing rule

A Local session reads pstack as a Claude Code plugin and attaches `rules/pstack-routing.md` to every request, because the rule has `applyTo: '**'`. That rule carries the routing when chat hooks are off.

## Sub-features

- `local-rule` attaches `pstack-routing.md` to the request.
- `local-no-hook` runs no hook while the account's chat preview features are off.
- `local-agents` lists the plugin's agents for `runSubagent`.

## How to get to it (user POV)

- Add the plugin folder to `chat.pluginLocations`, pick Local in the chat view's session picker, and send a prompt.

## Driving it with node scripts

Preconditions:

- `node $V/read-log.mjs policy` shows the current `chat_preview_features_enabled`. Record it, because it decides whether hooks run.
- No instance runs at `<instance>`.

- **Probe.** Run `node $V/probe-plugin.mjs <scratch>/loc-<n> --mark hooks/session-start-context.md=<A> --mark rules/pstack-routing.md=<B>`.
- **Instance.** Run `node $V/vscode-instance.mjs setup <instance> --session local --plugin <scratch>/loc-<n>/plugin`, then `launch`. The `false` harness settings make Local the session type, so no picker click is needed.
- **Ready.** Wait for `Found [0-9]* models` in the instance's `agenthost.log`.
- **Prompt.** Run `node $V/vscode-instance.mjs send <instance> "Probe <token>. Call no tools. Quote every line in your context that starts with 'Verification marker:', or say NONE."`.
- **Host record.** Run `node $V/read-log.mjs local --since <since> --match <token> --wait 150 --user-data-dir <instance>/user-data --find <A> --find <B>`. `customizations` has `[applying] pstack-routing.md — automatically attached as pattern is **` and the four `[custom-agent]` entries, `contextIncluded` names `pstack-routing.md`, `markersInLog` has `<B>: true` and `<A>: false`, and `replies` quotes `<B>`.
- **Hook run.** Run `node $V/read-log.mjs hooks <scratch>/loc-<n>/hooks.jsonl`. With chat preview features off it prints `[]`.
- **Cleanup.** Run `quit`, then `clean ... --evidence <scratch>/evidence/<name>`, which keeps the debug log.

## Gotchas

- `--model` with `--session local` stores `copilot/<id>` under `chat.currentLanguageModel.panel`. That path has not been run, so check `models` in the reader's output.
- Copilot Chat 0.76 logs no `Hook Discovery` span. With hooks off, the empty wrapper log is the only negative, and it is this run's own record, not the host's.
- The hooks-on case needs the account's editor preview features on, which an instance cannot change. Record it as not checked.
