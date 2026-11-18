# Other runtimes

The role lines are the same everywhere. What differs is the sheet path, how the runtime loads it, and how you list models. Detect models with the runtime's own tool and never write a slug you have not seen listed. A runtime whose subagent call has no model parameter still gets the sheet, as the record of the user's choice, and applies it where it can. The `session hook` line applies to the Claude Code, Codex, GitHub Copilot, Muse, MiniMax Code, Antigravity, OMP, and OpenCode 2 plugins and to the pstack Pi extension. VS Code's Local agent has no routing hook, so the line does not apply there, and its section below says how to turn routing off.

`<codex-home>` is `$CODEX_HOME` when that variable is set and `~/.codex` otherwise.

| Runtime | Sheet | Load | List models | Status |
| --- | --- | --- | --- | --- |
| Claude Code | `<config>/pstack-models.md`, or `.claude/pstack-models.md` at the repository root, which replaces it in that project | `@<config>/pstack-models.md` in `<config>/CLAUDE.md`, or `@.claude/pstack-models.md` in the repository root's `CLAUDE.md` | the `Agent` tool's model parameter | verified live |
| Codex | `<codex-home>/pstack-models.md` | model rows: paste into `<codex-home>/AGENTS.md`; hook setting: read by the plugin | your configured Codex models, see [codex-tools.md](../../poteto-mode/references/codex-tools.md#model-names) | hook contract tested; discovery verified |
| Pi | `pstack-models.md` in the Pi agent directory, `$PI_CODING_AGENT_DIR` or `~/.pi/agent` | read by the pstack Pi extension, model rows and hook setting both; no include line | `pi --list-models`, see [pi-tools.md](../../poteto-mode/references/pi-tools.md#model-names) and its `setup-pstack` note | extension contract tested offline; live results in the repository's `docs/pi-equivalence.md` |
| GitHub Copilot (CLI, app, and Copilot sessions in VS Code) | `${COPILOT_HOME:-~/.copilot}/pstack-models.md` | the plugin hook checks it and injects its role lines at session start; skills-only installs read it with `view` | the `task` tool's `model` enum, see [copilot-tools.md](../../poteto-mode/references/copilot-tools.md#model-names) | hook contract tested; CLI install smoke-tested |
| VS Code Local agent | `~/.copilot/instructions/pstack-models-vscode-local.instructions.md` | VS Code lists it among the session's instruction files with its absolute path, and the plugin's routing instruction tells the agent to read it before a role-model skill; no hook setting | the `Available models` list that a `runSubagent` call with an unknown `model` returns, see [vscode-local-tools.md](../../poteto-mode/references/vscode-local-tools.md#model-names) | routing instruction, sheet listing, the unknown-model error, and a dispatch on a sheet model checked live on VS Code Insiders 1.147; the cost-tier refusal not run |
| Muse | `${XDG_CONFIG_HOME:-~/.config}/muse/pstack-models.md` | the plugin hook reads it and injects its role lines at session start, once hooks are approved; no include line | the model catalog (`muse model-profile show <model>` names each one), see [muse-tools.md](../../poteto-mode/references/muse-tools.md#model-names) | hook contract tested; plugin install verified |
| MiniMax Code | `~/.minimax/pstack-models.md`, even when `MINIMAX_DATA_DIR` moves MiniMax's data directory, since MiniMax Code withholds that variable from hooks and its `bash` tool | model rows: read by the agent before a role-model skill, or paste into `AGENTS.md` in MiniMax Code's data directory; hook setting: read by the plugin | `mcode provider list` or the `model` slash command, see [minimax-tools.md](../../poteto-mode/references/minimax-tools.md#model-names) | hook contract tested; plugin load smoke-tested on 0.7.4; no live session |
| Kimi Code CLI | `<KIMI_CODE_HOME>/pstack-models.md`, or `~/.kimi-code/pstack-models.md` when unset | read by the agent before a role-model skill; no hook setting | the `Agent` tool's model parameter when available, see [kimi-tools.md](../../poteto-mode/references/kimi-tools.md#model-names) | installation and synthetic-provider context delivery checked on Kimi 2.4.1 for macOS; model compliance untested |
| Antigravity (`agy`) | `~/.gemini/config/pstack-models.md` | model rows: read by the agent before a role-model skill, or paste into `~/.gemini/config/AGENTS.md`; hook setting: read by the plugin's `SessionStart` hook | `invoke_subagent`'s `Model` enum (`inherit`, `flash_lite`, `flash`, `pro`), see [agy-tools.md](../../poteto-mode/references/agy-tools.md#model-names) | tested with `agy` 1.5.0 on macOS: plugin install, hook on/off, full skill read and a live subagent reply; Windows untested |
| OMP | `~/.omp/pstack-models.md` (global across profiles; hook only) | read by the OMP plugin for routing | `omp models --kind chat`; model roles use OMP configuration, see [omp-tools.md](../../poteto-mode/references/omp-tools.md#model-names) | installation, skill access, and the routing toggle checked on OMP 18.16.0 with a synthetic provider; model compliance untested |
| Grok Build | `${GROK_HOME:-~/.grok}/pstack-models.md` | read by the agent before a role-model skill; the `session hook` line does not control the Grok routing hint | the `spawn_subagent` tool's advertised models; use overrides only at the user's explicit request; see [grok.md](../../poteto-mode/references/grok.md#model-names) | synthetic-provider plugin and skill loading tested |
| OpenCode 2 | `${XDG_CONFIG_HOME:-~/.config}/opencode/pstack-models.md` | add the path to the `instructions` array in `opencode.jsonc`; the plugin reads the hook setting directly | the `models` command in the session; see [opencode-tools.md](../../poteto-mode/references/opencode-tools.md#model-names) | native skill activation and routing tested on 2.2.5 with a loopback provider |
| Gemini CLI | `~/.gemini/pstack-models.md` | `@~/.gemini/pstack-models.md` in `~/.gemini/GEMINI.md` | the `model` slash command in the session | from published docs, no live session |
| Prime Agent | no documented sheet path; Prime's configuration chooses models | | | no live session |

Every runtime uses its row above in place of the Claude Code paths and step 7's include line. A section below exists only for a step change the table cannot express.

## Codex

- **Step 3 (map and confirm).** `session` effort requires the current thread's active-turn metadata, which some hosts do not expose. The platform mapping's helper reads it; when it is unavailable, an explicit effort choice is required before dispatching. Offer a fixed default level for those hosts instead of promising automatic inheritance.
- **Step 4 (session hook).** The plugin's `SessionStart` hook injects the mandate as on Claude Code, after the user trusts plugin hooks through `/hooks`.
- **Step 5 (validate).** The effort levels are the `reasoning_effort` values your Codex models accept.
- **Step 7 (wire it in).** Paste the `default effort` line into `<codex-home>/AGENTS.md` with the model rows, but not the `session hook` line: the plugin hook reads that from the sheet.

## GitHub Copilot

Follow [the Copilot setup](../copilot.md); its opening names the steps it replaces.

## VS Code Local agent

Read the [platform mapping](../../poteto-mode/references/vscode-local-tools.md) first. Copilot sessions in VS Code use the GitHub Copilot sheet and [the Copilot setup](../copilot.md) instead.

- **Step 1 (detect models).** Tell the user that you will make one subagent call that fails on purpose. Call `runSubagent` with `model: "pstack-list-models"`, `prompt: "List nothing."`, and `description: "List models"`. The call fails before a subagent starts. Its error lists the available models, each as `Name (vendor)`, and can list the models above the session model's cost tier as a second group. Offer both groups and mark the second, because a role on such a model runs only when the session itself runs on a model at least that expensive. If the error lists no models, ask the user to read the names from the model picker, and add ` (copilot)` to each.
- **Step 2 (load current state).** Keep model names exactly as listed, including the vendor in parentheses. Do not apply the Claude Code family-name rewrite. When your instructions list has a `pstack-models-vscode-local` entry, read that file for the current choices. A sheet that a `CLAUDE.md` names is Claude Code's sheet, not this one.
- **Steps 3 and 5 (effort, validate).** `runSubagent` has no effort parameter. Skip the effort questions in step 3 and effort validation in step 5, and omit the `default effort` line and `@<level>` suffixes. Validate each value by checking it against the list that step 1's call printed. Do not run `check-sheet.sh`. It checks Copilot model IDs and rejects these names.
- **Step 4 (session hook).** Skip it, and omit the `session hook` line. Routing comes from the plugin's `pstack-routing` instruction, which VS Code attaches to every Local request. To turn it off, disable that instruction in the Chat Customizations view, or disable the plugin.
- **Step 6 (write the sheet).** Print the home directory with `run_in_terminal` (`echo "$HOME"`), and write the sheet with `create_file` at `<home>/.copilot/instructions/pstack-models-vscode-local.instructions.md`, with that absolute path. Use this front matter and header in place of step 6's paragraph, then the role lines of step 6 with the user's choices. Write a line for every role, with `inherit-parent` for a role the user left on the session's model.

  ```markdown
  ---
  description: pstack role models for VS Code's Local agent, as runSubagent model names. Read it before a pstack skill dispatches subagents.
  ---

  # pstack model configuration

  Per-role model choices for pstack skills on VS Code's Local agent, written by setup-pstack. Each value is a model name exactly as `runSubagent` lists it. A value of `inherit-parent` or `auto` runs that role on the session's model (the `runSubagent` call omits `model`). Rerun setup-pstack to change a line.
  ```

- **Step 7 (wire it in).** Nothing to wire. VS Code lists the file from `~/.copilot/instructions`, so it appears in the session's instructions from the next Local request.
- **Step 8 (confirm).** Say where the sheet is, that the choices apply from the next Local request, and that Copilot sessions in VS Code keep their own sheet at `${COPILOT_HOME:-~/.copilot}/pstack-models.md`. Say that routing follows the `pstack-routing` instruction, not a `session hook` line.

## Muse

- **Step 4 (session hook).** The native plugin's `SessionStart` hook injects the mandate and the role lines only after the user approves the plugin's hooks with `muse plugins approve pstack`. In step 8, name that command when it has not run yet.

## Pi

- **Step 4 (session hook).** The pstack extension adds the mandate to the system prompt at every agent start.

## OpenCode 2

- **Steps 3 and 5 (effort, validate).** The `subagent` tool has no effort field. Skip the effort questions in step 3 and effort validation in step 5, and omit the `default effort` line and `@<level>` suffixes. A variant the user asks for goes in the model ID as `providerID/modelID#variant`.
- **Step 4 (session hook).** The native plugin adds the mandate to root-session model requests.

## Antigravity

- **Steps 3 and 5 (effort, validate).** `invoke_subagent` takes a `Model` and no effort parameter. Skip the effort questions in step 3 and effort validation in step 5, and omit the `default effort` line and `@<level>` suffixes.

## Kimi Code CLI

- **Steps 1 and 6 (detect models, write the sheet).** Describe `inherit-parent` and `auto` as omitting `model`: Kimi uses the configured subagent default when present, otherwise the parent's model. Write that meaning in the sheet header. If the `Agent` tool has no `model` parameter, offer only these aliases.
- **Step 2 (load current state).** Preserve model aliases exactly, including ones starting with `claude-`; do not apply the Claude Code family-name rewrite.
- **Steps 3, 4, and 5 (effort, session hook, validate).** Skip step 4, the effort questions in step 3, and effort validation in step 5. Omit effort and `session hook` lines and suffixes from the sheet.
- **Step 8 (confirm).** Explain that routing is controlled by the plugin's enabled state instead of reporting a hook setting.

## Grok Build

Read the [platform mapping](../../poteto-mode/references/grok.md) first.

- **Step 1 (detect models).** Use the models advertised by `spawn_subagent` and ask the user to confirm choices; the session model selector is supplementary. If the tool exposes no `model` parameter, explain that per-call model selection is unavailable and offer only `inherit-parent` and `auto`; both omit `model`, and configured subagent overrides may still apply. Write that meaning in the sheet header.
- **Step 2 (load current state).** Preserve full `claude-` IDs and validate them against the tool's advertised models instead of rewriting them to family names.
- **Steps 3, 4, and 5 (effort, session hook, validate).** Skip step 4, the effort questions in step 3, and effort validation in step 5. Omit effort and `session hook` lines and suffixes from the sheet. Grok exposes no per-call effort parameter.
- **Step 8 (confirm).** Explain that the enabled plugin supplies a model-followed routing hint that the `session hook` setting does not control.

## OMP

Follow [OMP setup](../../poteto-mode/references/omp-tools.md#model-names) instead of steps 1 through 8. OMP uses native model roles and agent overrides; its global pstack sheet controls only the session hook.

1. Ask whether main-session routing should be on or off for all OMP profiles.
2. In `~/.omp/pstack-models.md`, replace all `session hook:` lines with one exact `session hook: on` or `session hook: off` line, preserving other lines and the existing encoding.
3. Confirm the global scope and restart the session to clear earlier context.
