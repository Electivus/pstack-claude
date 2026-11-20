# VS Code Copilot session

A Copilot session in VS Code runs the GitHub Copilot build of a VS Code agent plugin. The agent host copies the plugin into the instance's `agentPlugins` folder, runs `hooks/copilot-hooks.json` from that copy, and passes the routing instruction to the model.

## Sub-features

- `cop-hook` runs `hooks/session-start.mjs copilot` with `COPILOT_PLUGIN_ROOT` naming the copy.
- `cop-context` puts the routing instruction in the model's context. The host log does not show this part, see Gotchas.
- `cop-no-rule` leaves the `.md` routing rule out of the context.
- `cop-model` runs the session on the stored model.

## How to get to it (user POV)

- Add the plugin folder to `chat.pluginLocations`, open the chat view, and send a prompt in a Copilot session, the default session type.

## Driving it with node scripts

Preconditions:

- `node $V/read-log.mjs policy` shows `chat_agent_enabled: true`.
- No instance runs at `<instance>`.

- **Probe.** Run `node $V/probe-plugin.mjs <scratch>/cop-<n> --mark hooks/session-start-context.md=<A> --mark rules/pstack-routing.md=<B>`.
- **Instance.** Run `node $V/vscode-instance.mjs setup <instance> --session copilot --plugin <scratch>/cop-<n>/plugin --model claude-haiku-4.5`, then `node $V/vscode-instance.mjs launch <instance>`. Setup creates `<instance>/copilot-home` and reports `githubAuthCopied: true`. `launch` and `send` set `COPILOT_HOME` to it, so the session never touches `~/.copilot`.
- **Ready.** Wait until `grep -q "Found [0-9]* models" <instance>/user-data/logs/*/agenthost.log` succeeds.
- **Prompt.** Run `node $V/vscode-instance.mjs send <instance> "Probe <token>. Call no tools. Quote every line in your context that starts with 'Verification marker:', or say NONE."`. Keep `since` from the output.
- **Host record.** Run `node $V/read-log.mjs copilot --instance <instance> --since <since> --match <token> --wait 150 --find <A> --find <B>`. `done: true`, `sessionStart` has a context that starts with `<EXTREMELY_IMPORTANT>`, `usedModels` is `["claude-haiku-4.5"]`, `markersInHookOutput` has `<A>: true`, `markersDelivered` has `<A>: false` and `<B>: false`, `tools` is empty, and `replies` quotes `<A>`.
- **Hook run.** Run `node $V/read-log.mjs hooks <scratch>/cop-<n>/hooks.jsonl`. The `sessionStart` command exits 0, and `COPILOT_PLUGIN_ROOT` names `<instance>/user-data/agentPlugins/<sanitized path>/<nonce>`.
- **Cleanup.** Run `quit`, then `clean ... --evidence <scratch>/evidence/<name>`.

## Gotchas

- A prompt sent before the agent host lists its models can run on a different model. `selectedModel` was null and `usedModels` showed `claude-sonnet-5.5` in one such run. Check `usedModels`, not only `selectedModel`.
- Copilot sessions log to `<instance>/copilot-home/session-state`, not the user's `~/.copilot`. `read-log.mjs copilot` needs `--instance` or `COPILOT_HOME` and never defaults to the user's home. Still pass `--match`.
- `session.warning` with `compaction_static_context_budget` reports how much of the model's budget the static context takes. On 1.148.0, Claude Haiku 4.5 showed 82% without pstack and 83% with it.
- Copilot CLI 1.0.113 logs the `sessionStart` context only in `hook.end`. It is not in `system.message`, `instruction.update`, or the `transformedContent` of `user.message`, which does carry the `userPromptSubmitted` context. So `markersDelivered` cannot show `<A>`, and its `false` for `<A>` or `<B>` is not a negative. The log proves the hook ran and returned the context. Only the reply quoting `<A>` with no tool call suggests the model saw it, and a reply proves nothing.
- The agent host runs the copy, not the checkout. Edit the source, then make a new probe directory.
