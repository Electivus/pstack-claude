# pstack host verification map

This directory is the maintained source for proving what pstack delivers in each host. Read this index, then use the matching feature file as the recipe. Commands assume `V=.claude/skills/verify/scripts` from the repository root.

| Feature | Host | File |
| --- | --- | --- |
| Session routing from the SessionStart hook | Claude Code | [claude-code-routing.md](claude-code-routing.md) |
| Routing, skills, and agents through the Copilot build | VS Code Copilot session | [vscode-copilot-session.md](vscode-copilot-session.md) |
| Routing from the `pstack-routing` rule | VS Code Local session | [vscode-local-rule.md](vscode-local-rule.md) |

## Baseline preconditions

- `claude`, `code-insiders`, `node`, and `sqlite3` are on `PATH`.
- The user's VS Code Insiders is signed in to GitHub with Copilot access.
- Each probe uses a new directory from `probe-plugin.mjs` and new marker words.
- Each VS Code run uses its own instance under the directory `node $V/vscode-instance.mjs path <name>` prints (a short `pv-<name>` under `/tmp`, or `$PV_ROOT`).

## Driving conventions

- Put a unique token in every prompt, and pass it to the reader as `--match`.
- Ask for no tool calls unless the check is about a tool.
- Read the host's log before trusting the reply.
- Quit and clean every instance after its run, failed runs included.

## Proof and skip reporting

- Report the host version from the reader (`copilotVersion`, `version`, or the Claude Code `--version`).
- Report each marker's result from the host's log, not from the reply alone.
- Name any step done by hand in the chat view, and any check not run with its reason.
