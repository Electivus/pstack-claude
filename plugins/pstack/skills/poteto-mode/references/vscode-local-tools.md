# VS Code Local agent tool mapping for pstack

pstack skills are written in Claude Code tool language (the `Skill` tool, the `Agent` tool, `AskUserQuestion`, Claude model names, `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/` and `~/.claude/orchestrate/` paths). This mapping is for VS Code's Local agent, the GitHub Copilot Chat session whose subagent tool is `runSubagent` and whose file tool is `read_file`. It loads the pstack Claude Code plugin through VS Code's Claude-format reader: the skills, the four plugin agents, and a routing instruction. Read this when a pstack skill names a Claude tool, a driver or bundled skill, a Claude model, or a Claude Code path. A VS Code session of type Copilot, whose tools include `task`, `skill`, and `view`, runs the GitHub Copilot build and uses [copilot-tools.md](copilot-tools.md) instead. This file is specific to the Local agent. Other runtimes use their own equivalents.

## Tool actions

| pstack / Claude action | VS Code Local agent equivalent |
|------------------------|--------------------------------|
| Read a file (`Read`) | `read_file` with an absolute `filePath`, a `startLine`, and an `endLine`. All three are required, so read a long file in ranges. |
| Create a file | `create_file` |
| Edit a file | `replace_string_in_file`, or `multi_replace_string_in_file` for several edits |
| Run a shell command | `run_in_terminal` with `command`, `explanation`, `goal`, and `mode`. Use `mode: "sync"` for a short command. For a long one use `mode: "async"`, then read it with `get_terminal_output`. |
| Search file contents / find files | `grep_search` / `file_search`. Use `semantic_search` to find code by meaning. |
| Fetch a URL | `fetch_webpage` |
| Search the web | No built-in tool is listed. Use an MCP search tool when the session has one, or say that web search is unavailable. |
| Invoke a skill (the `Skill` tool, `/command`, `pstack:<skill>`) | `read_file` on the `<file>` path that your skills list gives for the bare skill name (`poteto-mode`, not `pstack:poteto-mode`). A user types `/pstack:<skill>` in the chat input. |
| Dispatch a subagent (the `Agent`/`Task` tool) | `runSubagent` with `prompt`, `description`, `agentName`, and `model`. |
| Dispatch N parallel subagents in one turn | N `runSubagent` calls in one response. VS Code runs them in parallel and returns every result together. |
| Background subagent (`run_in_background: true`) | None. A `runSubagent` call blocks until the subagent returns. Put every independent dispatch in one response instead. |
| Message or resume a running subagent (`SendMessage`) | None. Start a fresh subagent with the consolidated brief, as poteto-mode's Subagents section says to do by default. |
| Track tasks (the todolist; `TaskCreate` / `TaskUpdate`, or `TodoWrite` on Claude Code) | `manage_todo_list` with `operation: "write"` and the whole `todoList`. When your tool list lacks it, load it with `tool_search`. If it is not there either, keep the `todo.md` checklist that poteto-mode describes. |
| Ask the human a fixed-choice question (`AskUserQuestion`) | `vscode_askQuestions` with a `questions` list. Each question has a `header` of at most 50 characters, a `question` of at most 200, `options`, and optionally `multiSelect` and `allowFreeformInput`. |
| Load a deferred tool | `tool_search` |
| Call an MCP tool (`mcp__<server>__<tool>`) | The tool by the name that your tool list or `tool_search` gives. There is no `mcp__` prefix convention to scan for. |
| Schedule a self-paced re-invocation (`ScheduleWakeup`, the `loop` skill) | None. Rerun the step yourself on the user's next turn. |
| Search Claude Code transcripts under `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/projects/` | See Transcripts below. |

## Subagent policy

poteto-mode's Subagents section sets Claude-specific defaults (`subagent_type: "pstack:poteto-agent"`, `run_in_background: true`). On the VS Code Local agent:

- The plugin's agents load under their bare names: `poteto-agent`, `comment-sicko`, `thermo-nuclear-review-subagent`, and `thermo-nuclear-code-quality-review-subagent`. Take the name a skill gives as `subagent_type`, such as `pstack:poteto-agent` or `pstack:comment-sicko`, drop the `pstack:` prefix, and pass the rest as `agentName`. Your agents list shows the bare names.
- `general-purpose` maps to a `runSubagent` call with no `agentName`, which runs the current agent. Where a skill leaves the type unset, use `agentName: "poteto-agent"`.
- `poteto-agent` cannot find the `poteto-mode` skill on its own, since it searches Claude Code's plugin cache. Put the absolute path of `poteto-mode`'s `SKILL.md`, as your skills list gives it, and the absolute path of this mapping in every `poteto-agent` brief.
- `readonly: true` (reviewers, explorers, critics) maps to `agentName: "Explore"` for code reading. When a read-only role must run commands, omit `agentName`, say in the prompt that the subagent must not write files, and review its diff anyway.
- `run_in_background: true` has no field. Every call blocks, so a step that waits on a background agent runs in the foreground.
- `isolation: "worktree"` has no field. Before you dispatch a writer, create its worktree with `git worktree add` through `run_in_terminal` and name that path in the prompt, so the **swarm** skill's workers and the fan-out playbooks (`orchestrate`, `autopilot-full`, `autopilot-stack`) never share a checkout.
- A role's model goes in `model` (see Model names). Reasoning effort has no field, so omit it.
- Keep the rest of the policy unchanged. Pass file pointers, not inlined context, and review every subagent's diff yourself.

## Model names

Skills name Claude Code model aliases in their Models sections. Those aliases are not VS Code model names, and the VS Code Local build ships no default models. `runSubagent` takes a `model` written as `Model Name (vendor)`, as the chat model picker shows it, and the models an account can reach depend on its plan and policy. The user picks them once.

- The model sheet is `~/.copilot/instructions/pstack-models-vscode-local.instructions.md`. VS Code lists it among the session's instructions as `pstack-models-vscode-local`, with its absolute path, and does not attach its text. Before a skill that needs a role model (`arena`, `interrogate`, `no-comments`, `poteto-mode`, `swarm`, `thermos`), read it with `read_file` at that path. With no such entry, omit `model` for every role, say once that the roles run on the session's model and that `setup-pstack` chooses others, and continue.
- A role line in the sheet is the user's explicit model instruction, so pass its value as `runSubagent`'s `model`, exactly as written. `inherit-parent` or `auto` omits `model`. `runSubagent` has no effort parameter, so ignore a `default effort` line and any `@<level>` suffix.
- `runSubagent` refuses a model whose cost multiplier is above the session model's, and a name it does not know. On either error, rerun that call without `model`, say which role ran on the session's model, and never substitute a model the sheet does not name.
- VS Code includes `CLAUDE.md` files and does not expand their `@` lines. A `pstack-models.md` that such a line names is Claude Code's sheet. Do not read it for role models or pass its values to `runSubagent`.
- Roles that default to the worker model (`feature, refactoring`): the worker model the user chose.
- Roles that default to the strongest model (`strongest judgment`): the strongest model the user chose.
- Diverse-model panels (`arena`, `interrogate`): the adversarial signal comes from model diversity, so fill a panel from distinct model families (Claude, GPT, Gemini, Grok, and so on). The vendor in parentheses is `copilot` for nearly every model, so it does not tell families apart. If only one family is reachable, note in the verdict that diversity was reduced.

`/setup-pstack` writes the configured model list. On VS Code's Local agent, list the models from the error of a `runSubagent` call with an unknown `model`, and write only names it shows. The Copilot sheet checker rejects these names and does not apply.

## Session routing

VS Code attaches the plugin's `pstack-routing` instruction to every Local request. No hook is involved, so routing works where an organization turns chat hooks off, and the `session hook` setting does not control it. To stop routing, disable the `pstack-routing` instruction in the Chat Customizations view, or disable the plugin.

When hooks are on, Local also runs the plugin's Claude Code `SessionStart` hook. That hook prints plain text, which VS Code's source shows Local dropping for `SessionStart`, so the mandate does not arrive twice. On Windows, Local runs the hook's `powershell` field, `exit 0`, in place of its command, which PowerShell cannot run, so the first turn shows no hook warning.

If the instruction is missing from a session (applying instructions turned off, or a policy that blocks customizations), type `/pstack:poteto-mode` to load the skill, or add a standing instruction to `AGENTS.md`.

## Plugin file access

`read_file` reads the plugin's own files, such as a playbook or a reference, without a prompt. Find the plugin's skills directory from the `<file>` path that your skills list gives for `poteto-mode`. A path a skill names, such as `references/vscode-local-tools.md`, sits beside that `SKILL.md`.

Run a script from the plugin through `run_in_terminal`, with its interpreter and absolute path. The call follows VS Code's terminal approval settings.

## Transcripts

Claude Code keeps one directory per project under `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/projects/<encoded-cwd>/`. The Local agent keeps one file per session at `<workspaceStorage>/<id>/GitHub.copilot-chat/transcripts/<session-id>.jsonl`. pstack's transcript finder does not read that layout, and this mapping names no other Local transcript store. Do not read Claude Code's projects directory or Copilot's `session-state` directory as this session's history. Say that session history is unavailable instead of reporting that something was never recorded.

`autopilot-full` keeps its store under `~/.claude/orchestrate/` on Claude Code. On the VS Code Local agent, keep it under `~/.copilot/orchestrate/`, the default location of the GitHub Copilot build's store.

## Driver and bundled skills pstack references

The [driver policy](../SKILL.md#non-negotiables) selects the app driver. For skills and drivers named by these workflows, use these VS Code Local equivalents:

| Skill or driver named in pstack | On VS Code Local agent |
|---------------------------------|------------------------|
| `run` (drive a CLI/TUI to see a change work) | Run the app yourself with `run_in_terminal` and observe the real output. |
| Project UI driver | Drive the UI with the browser tools (`open_browser_page`, `navigate_page`, `click_element`, `type_in_page`, `screenshot_page`, `read_page`), or hand the user a concrete manual check. Do not claim done without observing the artifact. |
| `plugin-dev:skill-development` (Claude's SKILL.md authoring guidance) | Follow the Agent Skills conventions: a `SKILL.md` with `name` and `description` frontmatter, progressive disclosure into `references/`, and poteto-mode's [authoring-a-skill playbook](../playbooks/authoring-a-skill.md). |
| `loop` (recurring/self-paced re-invocation, used by `babysit`) | The Local agent has no `loop` skill and no scheduler. Rerun the step yourself on a cadence and state the cadence. The `/loop` command does not exist here. |

## Instructions file

Where a pstack skill says "your instructions file" or `CLAUDE.md`, on the VS Code Local agent that is `AGENTS.md` or `.github/copilot-instructions.md` in the repository, and `~/.copilot/copilot-instructions.md` for every repository. Local also includes a repository's `CLAUDE.md` and the user-level `CLAUDE.md` in the `.claude` folder of your home directory. It does not expand `@~/` includes in them, so a `pstack-models.md` that such a line names is not loaded here, as Model names above says.

## Skill locations

Where a pstack skill names `.claude/skills/`, the Local agent reads project skills from `.github/skills/`, `.claude/skills/`, and `.agents/skills/` in the workspace. VS Code's source also lists `~/.copilot/skills/`, `~/.agents/skills/`, and the `skills` folder inside the `.claude` folder of your home directory for personal skills. A live session has not confirmed the personal locations.

## Per-skill notes

Affected skill entry points point here. Most skills need only the tables above. These need one more mapping:

| Skill | On VS Code Local agent |
|-------|------------------------|
| `setup-pstack` | The skill's [Other runtimes](../../setup-pstack/references/runtimes.md) table names the Local sheet and how VS Code lists it. Its VS Code Local agent section lists the models with an unknown-model `runSubagent` call. |
| `architect` | A large or contested design goes through the **arena** skill: each runner is one `runSubagent` call in one response, with a model from the sheet's `arena runners` line. |
| `arena` | Runners and the cross-judge pool come from the sheet's panel lines. A refusal for cost tier reruns that entry without `model` (see Model names). Pick the cross-judge from a different model family than the candidate it grades. |
| `how` | The one subagent is a `runSubagent` call. |
| `interrogate` | Each adversary is a `runSubagent` call, all in one response, with a model from the sheet. Keep the panel's model families distinct. |
| `no-comments` | The `pstack:comment-sicko` dispatch is a `runSubagent` call with `agentName: "comment-sicko"`. |
| `thermos` | Both review dispatches are `runSubagent` calls in one response, with `agentName: "thermo-nuclear-review-subagent"` and `agentName: "thermo-nuclear-code-quality-review-subagent"`. Each prompt carries the same diff and file contents. |
| `swarm` | Each worker is a `runSubagent` call, all in one response. Give each writing worker its own worktree first (see Subagent policy). |
| `why` | List MCP servers from your tool list or `tool_search`, not from Claude Code's MCP files. |
| `reflect` | The transcript finder reads Claude Code's layout and finds no Local session, so work from the conversation in your context and say that the transcript was not found. |
| `recall` | Do not list or read `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/projects/`, which holds Claude Code history, not this session's. Work from live state and the shared record. |
| `show-me-your-work` | Check the log against this session's own context, not a Claude Code transcript. |
| `automate-me` | The skill-authoring guidance resolves through the Driver and bundled skills table above. This mapping names no readable Local transcript store, so draw on the current session and the user's own account of how they work. |
| `babysit` | `loop` has no equivalent here. Run one check per user turn and state the cadence. |

## Vendored scripts

`skills/poteto-mode/scripts/` ships the `watch-pr` PR watcher, `resume.mjs`, and `worktree-audit.mjs`. These scripts use bun and Node.js and run the same on the Local agent. Invoke them through `run_in_terminal`. They need `bun` and `gh`, or `origin` when the forge is Origin. `worktree-audit.mjs` finds each worktree's last chat only in the transcript directories that exist (Claude Code, Codex, Pi, GitHub Copilot), so it does not read Local sessions. It imports the transcript walker from the `reflect` skill, so keep the `reflect` skill installed beside `poteto-mode`.
