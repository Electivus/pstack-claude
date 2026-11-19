# pstack reference

Start with the [README](../README.md) for installation and your first task.

## Slash commands

The package includes 67 skill directories: 43 public skills and 24 `principle-*` references. Claude Code uses `/pstack:<name>`, Pi uses `/skill:<name>`, and Muse lists each user-invocable skill as `/<name>`. In Codex, mention a skill with `$<name>`, such as `$poteto-mode`, or pick one from `/skills`.

The skills keep upstream's `disable-model-invocation: true`, so Claude Code and Pi list to the model only `poteto-mode`, the six direct entries the routing hook names (`tdd`, `architect`, `how`, `why`, `arena`, `interrogate`), and the skills upstream leaves unflagged (`setup-pstack` and the cursor-team-kit skills). Every other skill runs when you type it, or when another pstack skill reads it by path.

Find each skill's instructions in the [skills tree](../plugins/pstack/skills/).

| command | use it when |
| --- | --- |
| `/poteto-mode` | default entry point for any non-trivial task |
| `/how` | walk through how a subsystem works |
| `/why` | investigate why something was built this way (parallel multi-MCP evidence) |
| `/architect` | settle types and module shape before writing code that crosses a function boundary |
| `/arena` | run N parallel attempts at the same task and pick the best parts |
| `/interrogate` | have three different models try to break a diff |
| `/automate-me` | draft your own personal -mode skill from recent transcripts |
| `/reflect` | capture a long task's lessons as a skill edit |
| `/correct` | find the mistakes agents keep repeating in a repo and make each one impossible, enforced at the highest level that works |
| `/tdd` | fix a bug by writing the failing test first, then the fix |
| `/benchmark-checklist` | vet a measured speedup or regression (limiter, tuning, errors, repeat runs, end-to-end relevance) before you report or act on it |
| `/typescript-best-practices` | ground type-system discipline in TypeScript syntax |
| `/teach` | explain a subsystem plainly by composing how + why |
| `/swarm` | fan out N parallel workers across slices or races, then return one aggregated report |
| `/technical-writing` | write docs, RFCs, readmes, PR descriptions, and commit messages to one layered standard |
| `/bro` | restate the last message in plain human language, no jargon |
| `/in-your-own-words` | play back your goal and the problem before the agent starts |
| `/sharpen` | make a task deeper, not bigger, by naming what a top expert would do and what would show the result is right, then rewrite the prompt to ask for that |
| `/figure-it-out` | design a rigorous, auditable playbook for a task no bundled playbook fits |
| `/show-me-your-work` | log decisions to a reviewable tsv decision trail |
| `/blast-radius` | find what a change could break beyond the diff and prove safety by running code |
| `/recall` | catch up on recent working context from chat history, live state, and the shared record |
| `/ketchup` | catch up on everything in this chat since your last message, with an executive summary for each action item |
| `/ketchup-video` | get the `/ketchup` catch-up as a short silent video of slides, with the calls waiting on you as text under it |
| `/setup-pstack` | configure pstack per-role model choices |
| `/poteto-help` | answer a question about pstack with the prompt to send and the file the answer came from |
| `/unslop` | clean up writing by removing AI tells |
| `/no-comments` | strip comments before review, fix the accepted findings, encode claimed constraints |
| `/create-verification-skill` | generate a project-local verification skill and feature map |
| `/maintain-verification-skill` | re-sync a drifted verification skill and its feature map |
| `/create-formal-verification-skill` | generate a project-local skill that formally verifies one high-risk property |
| `/maintain-formal-verification-skill` | re-sync a formal verification after the code it covers changed |
| `/statechart` | check a TLA+ model and draw it as a Mermaid statechart, with the shortest path to each state that breaks a rule |
| `/deslop` | deslop a diff before commit |
| `/babysit` | monitor an open PR, fix CI/comments, keep it merge-ready |
| `/thermo-nuclear-review` | audit a branch's changes for bugs, breakage, security issues, devex regressions, and feature-gate leaks |
| `/thermo-nuclear-code-quality-review` | extremely strict maintainability audit |
| `/thermos` | run both thermo-nuclear reviews as parallel subagents and synthesize their findings |
| `/make-pr-easy-to-review` | clean noisy history and improve PR description before review |
| `/fix-ci` | find failing PR checks, inspect logs, apply focused fixes |
| `/fix-merge-conflicts` | non-interactively resolve merge conflicts, validate, finalize |
| `/get-pr-comments` | fetch and summarize review comments from the active PR |
| `/what-did-i-get-done` | summarize authored commits over a user-chosen period |

## Runtime support

All runtimes share [one skills tree](../plugins/pstack/skills/). A skills-only installation includes the skills, scripts, agent references, and license notices. Claude Code, Codex, GitHub Copilot, Muse, MiniMax Code, and Antigravity use plugin hooks for routing, and so do VS Code's Copilot sessions. VS Code's Local sessions get routing from an instruction file the plugin ships. Kimi adds routing while its plugin is enabled, OMP adds it before main-agent turns, OpenCode adds it at each model step in root sessions, and Pi adds it through an extension that also supplies subagent tools. Grok exposes a routing hint through a skill description, which the model may not follow.

| Runtime | Setup and recorded verification |
| --- | --- |
| Claude Code | Install the marketplace plugin (Claude Code 2.1.292 or later). Skills use Claude tool names and model defaults; the plugin installs automatic routing. |
| Codex | Install the native plugin through the repository's marketplace and trust its hook through `/hooks`. The [Codex mapping](../plugins/pstack/skills/poteto-mode/references/codex-tools.md) translates Claude tools and model names. Shared skill symlinks were also detected in a live session. |
| Pi | Install the repository as a Pi package with `pi install` (Pi 1.5.1 or later). The [Pi extension](../plugins/pstack/pi/index.ts) registers the subagent, question, and wake-up tools and `/loop`, and the [Pi mapping](../plugins/pstack/skills/poteto-mode/references/pi-tools.md) translates Claude tools and model names. The [equivalence table](pi-equivalence.md) records each Claude Code mechanism and how it was verified on Pi 1.5.1. |
| GitHub Copilot | Install the plugin through the repository's marketplace; the CLI and the GitHub Copilot app share it. The [Copilot mapping](../plugins/pstack/skills/poteto-mode/references/copilot-tools.md) translates Claude tools, paths, and model roles, and maps app-only tools to CLI fallbacks. Install, routing, agent dispatch, and first-run setup are smoke-tested on the CLI; see [GitHub Copilot](#github-copilot). VS Code's Copilot sessions load the same build; see [VS Code](#vs-code). |
| VS Code Local agent | Install pstack as a VS Code agent plugin, which also serves Copilot sessions in VS Code. A Local session reads it as a Claude Code plugin and gets routing from the [`pstack-routing` rule](../plugins/pstack/rules/pstack-routing.md). The [VS Code Local mapping](../plugins/pstack/skills/poteto-mode/references/vscode-local-tools.md) translates Claude tools, subagents, and model roles. On VS Code Insiders 1.147.0 for macOS, with chat hooks disabled by policy, the shipped rule reached a Local session, and the model loaded `poteto-mode` and the mapping, read the model sheet, and dispatched `poteto-agent` on the sheet's model. On Windows Server 2025 with VS Code Insiders 1.148 and chat hooks on, a Local session ran the Claude Code hook's `powershell` override with no warning and attached the same rule. The marketplace install route has not been run. See [VS Code](#vs-code). |
| Muse | Install the native plugin bundle with `muse plugins install`, then approve its hooks and agent definitions with `muse plugins approve pstack`. The [Muse mapping](../plugins/pstack/skills/poteto-mode/references/muse-tools.md) translates Claude tools, subagents, transcripts, and model roles. See [Muse](#muse). |
| OMP | Install through the marketplace as described in the [README](../README.md#install). The [OMP mapping](../plugins/pstack/skills/poteto-mode/references/omp-tools.md) covers tools and model roles. On OMP 18.16.0, installation from a local marketplace, skill access, and the routing toggle were verified with a synthetic provider; model compliance has not been tested. |
| Kimi Code CLI | Install the native plugin from a release containing its manifest, or test a clean local copy as described in the [README](../README.md#install). The [Kimi mapping](../plugins/pstack/skills/poteto-mode/references/kimi-tools.md) covers tool and model differences. On Kimi Code CLI 2.4.1 for macOS, installation and delivery of routing and skill content to a synthetic provider were verified; model compliance has not been tested. |
| Grok Build | Install the native plugin from a local checkout as described in the [README](../README.md#install). The [Grok mapping](../plugins/pstack/skills/poteto-mode/references/grok.md) covers tool and model differences. On Grok Build 1.0.70 for macOS, `tests/grok-smoke.py` checked that a synthetic provider received the routing skill description and explicit skill content. |
| MiniMax Code | Copy `plugins/pstack` into `${MINIMAX_DATA_DIR:-~/.minimax}/plugins/`, where MiniMax Code loads it as the local plugin `pstack@local` through its Claude Code reader, skills, agents, and routing hook included. The [MiniMax Code mapping](../plugins/pstack/skills/poteto-mode/references/minimax-tools.md) translates Claude tools, subagents, and model roles. On 0.7.4, synthetic-provider guest sessions delivered routing and the explicit `pstack:poteto-mode` skill when enabled, and disabled controls omitted them. Agent dispatch and real-model compliance remain unverified. Plugin loading is also checked by `tests/minimax-smoke`. |
| Antigravity (`agy`) | Install `plugins/pstack` with `agy plugin install ./plugins/pstack`. Antigravity reads [`.antigravity-plugin/plugin.json`](../plugins/pstack/.antigravity-plugin/plugin.json) and the root [`hooks.json`](../plugins/pstack/hooks.json). The [Antigravity mapping](../plugins/pstack/skills/poteto-mode/references/agy-tools.md) translates Claude tools, subagents, transcripts, and model roles. On macOS, a signed-in `agy` 1.5.0 session received the routing instruction and read the full `poteto-mode` skill. A separate session dispatched `poteto-agent` and received its reply. The hook runs `node ./hooks/session-start.mjs agy`; Windows is untested. |
| Prime Agent | Its documentation describes shared-directory discovery; it has not been tested in a live session. Choose tools and models through Prime's configuration. |
| OpenCode 2 | Add the checkout's `plugins/pstack/opencode` directory to OpenCode's `plugins` array, or install the repository as a Git package with `opencode plugin add`. The native plugin registers bundled skills under `pstack-` IDs and injects routing in root sessions. Explicit activation and routing were tested on 2.2.5 with a synthetic loopback provider; CLI delegation was previously verified on 2.0.30. Real model behavior for this plugin remains untested. See the [OpenCode mapping](../plugins/pstack/skills/poteto-mode/references/opencode-tools.md). |
| Gemini CLI | Its documentation describes shared-directory discovery; it has not been tested in a live session. Use `/skills list` to check discovery and `/skills reload` after changes. |

These checks cover skill discovery. Delegation remains unverified on Prime Agent and Gemini CLI, as do their multi-model workflows. On those runtimes, agents must adapt Claude-specific tools, models, and configuration. Each mapping applies only to its runtime.

### Automatic routing

The Claude Code, Codex, and GitHub Copilot plugins load the same short [routing instruction](../plugins/pstack/hooks/session-start-context.md) on startup, resume, clear, and compact. The Kimi plugin contributes that instruction to the system prompt while enabled, with the limitations in its [mapping](../plugins/pstack/skills/poteto-mode/references/kimi-tools.md). The Muse plugin loads its [Muse wording](../plugins/pstack/hooks/session-start-muse.md) of the same instruction. MiniMax Code runs the Claude Code hook, which finds `MINIMAX_PLUGIN_ROOT` and loads the [MiniMax Code wording](../plugins/pstack/hooks/session-start-minimax.md) instead. VS Code's Local agent attaches the plugin's [routing rule](../plugins/pstack/rules/pstack-routing.md) to every request. It needs no hook, ignores `session hook`, and states the same three conditions as the hook's instruction, which the generator checks. The [hook](../plugins/pstack/hooks/session-start.mjs) runs as `node hooks/session-start.mjs <runtime>` on every runtime and OS: on Claude Code, Codex, and GitHub Copilot, where it prints the instruction as JSON `additionalContext` with a Copilot addendum, and on Muse, where it prints plain text. The plugin ships no `sh` or PowerShell script, so a machine that blocks `*.sh` files or PowerShell scripts still loads it. On Windows, Claude Code starts it through Git Bash, Muse spawns it with no shell, and Codex and GitHub Copilot start it through PowerShell, which then only launches `node`; a machine that blocks `powershell.exe` itself loads no instruction on those two. Codex requires the user to trust plugin hooks through `/hooks`. On OMP, the marketplace plugin adds its routing instruction before each main-agent turn; the global `session hook: off` setting disables it. On Pi, the [extension](../plugins/pstack/pi/prompt.ts) adds the same instruction to the system prompt at every agent start, so it survives compaction. The [OpenCode plugin](../plugins/pstack/opencode/index.js) adds its [routing instruction](../plugins/pstack/hooks/session-start-opencode.md) at each model step in root sessions, including after compaction. The instruction invokes `poteto-mode` when a task meets any of these conditions:

- It touches more than one file or changes a signature other files call.
- It involves a design or architecture choice.
- It concerns a bug with an unknown cause or a performance issue.

Smaller tasks proceed directly. The full skill loads when invoked, and explicit user instructions take precedence.

To disable routing on runtimes that support the session hook setting, run `setup-pstack` and turn it off, or write `session hook: off` in the runtime's sheet at the path in [setup-pstack's runtime table](../plugins/pstack/skills/setup-pstack/references/runtimes.md). In Claude Code, use `/pstack:setup-pstack`. On Claude Code, a project's committed `.claude/pstack-models.md` replaces the user's sheet in that project, so `session hook: off` there turns routing off for that project alone. Without the setting, routing stays on. On OMP this setting applies across profiles. On Kimi, disable the plugin to stop its routing instruction. In VS Code's Local sessions, disable the `pstack-routing` instruction in the Chat Customizations view, or disable the plugin. Grok's routing hint is not controlled by the session hook setting.

Skills-only installs and other runtimes do not include these integrations. Request `poteto-mode` explicitly, or add a standing instruction to the runtime's instruction file.

### Shared skills installation

Use this path for Prime Agent, Gemini CLI, or a skills-only Codex installation. Run the script under [Other harnesses](../README.md#other-harnesses) in the README, which clones the repository and links its skills into `~/.agents/skills/`.

Keep all skill directories, including the principle references. Leave the clone at this path while the links are installed.

### Manage linked skills

If a destination already exists, inspect it before replacing it. The installation skips existing files, directories, and links.

To update, run `git pull` in the clone that the links point to, then run the install loop again. A pull updates skills that are already linked but does not link new skill directories. To uninstall a linked skill, remove its link at `~/.agents/skills/<name>`. This removes it from every runtime using that directory.

### Install with the skills CLI

To install without keeping a local clone:

```shell
npx skills add https://github.com/Electivus/pstack-claude/tree/main/plugins/pstack/skills --skill "*" --agent "*" --yes
```

The [CI installation check](../.github/workflows/ci.yml) uses the skills CLI to copy the checkout's skill tree and compare the installed files with their sources.

### Codex

The [native plugin manifest](../plugins/pstack/.codex-plugin/plugin.json) points to the shared skills directory and the Codex [SessionStart hook](../plugins/pstack/hooks/codex-hooks.json). The [marketplace catalog](../.agents/plugins/marketplace.json) lists `pstack` in the `pstack-claude` marketplace. Review and trust the hook, listed as `Loading pstack routing`, through `/hooks`; Codex asks again when its definition changes.

The [README installation](../README.md#codex) registers that catalog with `codex plugin marketplace add`, then installs the plugin with `codex plugin add`. These commands match the help output from `codex-cli 0.154.0-alpha.6.2`. A fresh native installation was not tested for this documentation change.

OpenAI documents [marketplace registration and the plugin format](https://developers.openai.com/plugins/build/plugins#add-a-marketplace-from-the-cli). If your CLI lacks `plugin add`, use the plugin browser after registering the marketplace, or use the [skills-only installation](#shared-skills-installation).

Invoke a skill the two ways [Codex's skills documentation](https://developers.openai.com/codex/skills) gives. Type `$` and the skill's name, such as `$poteto-mode` or `$babysit`, and choose its entry, or pick it from `/skills`. In a plugin install the entry reads `poteto-mode (pstack)` and inserts `$pstack:poteto-mode`. A skills-only install has no `pstack:` prefix. To enable parallel subagents:

```toml
[features]
multi_agent = true
```

Add this setting to `~/.codex/config.toml` if subagents are disabled. Skills such as `arena`, `interrogate`, and `architect` use parallel agents. The [mapping](../plugins/pstack/skills/poteto-mode/references/codex-tools.md) describes a sequential fallback and translates Claude tool names, model defaults, and verification instructions.

### Pi

The repository root is a [Pi package](https://pi.dev/packages): its [`package.json`](../package.json) lists the shared skills directory and the [pstack Pi extension](../plugins/pstack/pi/index.ts). Install it with `pi install git:github.com/Electivus/pstack-claude`, or `pi install <clone path>` for a local checkout.

The extension supplies what Pi lacks natively, under the Claude Code names the skills use:

- `agent` dispatches a child `pi --mode rpc` process with the skill's `subagent_type`, model, and effort, in the foreground or background, optionally in its own git worktree. A background agent's completion joins the running turn after its current tool calls, or starts a turn when the session is idle.
- `send_message`, `list_agents`, and `stop_agent` message, list, and stop those agents. A message to a running agent is an RPC `steer` on the child's stdin, which the agent reads after its current tool calls before it carries on in the same run. A finished agent resumes with the message. An agent's status follows its process. `list_agents`, a foreground agent's result, and each completion notice name the child's transcript, `<timestamp>_<session id>.jsonl` under `<agent dir>/pstack/<parent session id>/agents/`, so a user can follow a running agent with `tail -f` or render a finished one with `pi --export`. A running agent's `list_agents` entry also carries `activity`, its current or last tool call and its latest message, read from the child's RPC events and kept in memory, so the model sees it only in a `list_agents` result. The top-level session shows the count and the most recently active agent in a `pstack-agents` footer line, and the user can run `/pstack-agents` for a per-agent view that is not sent to the model.
- `ask_user_question` and `schedule_wakeup` match `AskUserQuestion` and `ScheduleWakeup`, and `/loop` matches the `loop` skill. In a child agent, asking a question and scheduling a wakeup both return an error. Pi refuses to start when two extensions register the same tool name, so if you use another extension that provides `ask_user_question`, add a `pi ask tool: off` line to the override sheet and the pstack extension leaves that tool to it.
- If you delegate through another subagent extension, such as `pi-subagents`, add a `pi agent tools: off` line to the override sheet. The pstack extension then registers none of `agent`, `send_message`, `list_agents`, `stop_agent`, and `/pstack-agents`, so the model sees one set of delegation tools. Everything else stays, including `ask_user_question`, `schedule_wakeup`, `/loop`, and the exit hook.
- At every agent start it adds the routing instruction, the override sheet `~/.pi/agent/pstack-models.md`, and a pointer to the Pi mapping to the system prompt.

Family names such as `opus` resolve through the `pi` block of [`models.json`](../plugins/pstack/models.json) to model IDs for the provider the Pi session runs on. A ChatGPT sign-in (`openai`, or the legacy `openai-codex`) gets OpenAI models, and Anthropic or any other provider gets Claude models. Pi warns that Anthropic bills Claude used through Pi per token, as extra usage, even on a Claude subscription, and every subagent pstack starts adds to that bill. Run pstack in Claude Code to stay within a Claude plan's limits. A `pi models:` line in the sheet remaps any family name. The [Pi mapping](../plugins/pstack/skills/poteto-mode/references/pi-tools.md) lists every translation, and the [equivalence table](pi-equivalence.md) records what was verified and how.

### GitHub Copilot

The Copilot CLI reads the Claude Code [marketplace](../.claude-plugin/marketplace.json). For the plugin it looks for `.github/plugin/plugin.json` before `.claude-plugin/plugin.json`, so pstack ships a [Copilot manifest](../plugins/pstack/.github/plugin/plugin.json) whose `hooks` field names [`hooks/copilot-hooks.json`](../plugins/pstack/hooks/copilot-hooks.json). Copilot then skips the Claude Code `hooks/hooks.json`, so each hook runs once, and Claude Code keeps reading its own manifest. The GitHub Copilot app loads plugins installed into `~/.copilot`; a manual app check of routing, first-run setup, agent dispatch, `session hook: off`, and the app-only tools passed on 2026-09-25. To try a local checkout, pass its absolute path to `copilot plugin marketplace add`. Skills load by bare name through the `skill` tool, and a user types `/pstack:<skill>` in the CLI prompt; the agents keep their prefix, `pstack:poteto-agent` and `pstack:comment-sicko`.

Copilot's hook file runs the [SessionStart hook](../plugins/pstack/hooks/session-start.mjs) with `node` and the `copilot` argument. It prints JSON `additionalContext`: the routing instruction plus a [Copilot addendum](../plugins/pstack/hooks/session-start-copilot.md). It reads the model sheet, which sits outside Copilot's path sandbox, and checks it with the [same validator](../plugins/pstack/skills/setup-pstack/scripts/sheet.mjs) that `setup-pstack` runs through `check-sheet.mjs` after it writes the sheet. A valid sheet adds one line per known role, rebuilt from the checked values, so no other sheet text reaches the context. An invalid sheet adds `sheet invalid:` with each problem, and a missing sheet adds a note; both tell the session to run `setup-pstack` first. A second hook, [`pre-tool-use.mjs`](../plugins/pstack/hooks/pre-tool-use.mjs) with the matcher `view|task|bash`, does three things on Copilot. It approves reads inside the plugin directory so playbooks and references load without a path-access prompt. It approves registered scripts with their declared argument contracts and matching interpreters, using a strict command form with no shell metacharacters. It checks path operands separately from prose fields; unknown scripts and argument forms take the normal permission flow. Setup, SessionStart, and PreToolUse share one sheet decoder, including UTF-16LE support. While the sheet is valid, it denies a `pstack:*` `task` call whose `model` is not one of the saved choices, with the saved IDs in the reason. The script stays silent on everything else and always exits 0, because Copilot denies a tool call when the hook fails; an error in the script still reaches stderr. On Windows, Copilot runs each hook's `powershell` string in place of its `command`, so PowerShell starts `node` on the same SessionStart script; the plugin ships no PowerShell script. PreToolUse exits 0 with no decision, so on Windows a read inside the plugin asks for path access, registered scripts take the normal permission flow, and the `task` model check does not run. Copilot runs plugin hooks on every session start, so the Claude matcher does not apply. The hook runs lazily, after the first message is submitted and before the first model turn, including when that message is a slash command such as `/pstack:arena`. A resumed session runs it again with source `resume`, and the model still sees one routing block. On CLI 1.0.87 through 1.0.92, the context of several plugins' session-start hooks merges ([github/copilot-cli#3589](https://github.com/github/copilot-cli/issues/3589) reported that only the last one survived). If a version drops the merge, use the standing instruction from `setup-pstack`. On 1.0.92, when the CLI's cached experiment assignment turns on computer use, `-p` sessions load no plugin skills while interactive sessions still do; the smoke test clears that cache before each `-p` probe.

pstack ships no default Copilot models, because the models an account reaches depend on its plan and policy. The first skill that dispatches on role models runs `setup-pstack`. It asks one `ask_user` question per tier and panel slot, each a short list drawn from the `task` tool's models and grouped by vendor, and recommends no model. It then writes `${COPILOT_HOME:-~/.copilot}/pstack-models.md` and runs `check-sheet.mjs`, and later sessions receive its choices from the hook. Choose panel models from distinct vendors. A role value's `@<level>` suffix and the sheet's `default effort` line map to the `task` tool's `reasoning_effort`.

Copilot lists only part of a large plugin's skills in its prompt, so some pstack skills do not appear there; each one still loads by name. If another hook or a skills-only install displaces the routing instruction, `setup-pstack` offers a standing instruction for `~/.copilot/copilot-instructions.md`.

[`tests/copilot-smoke`](../tests/copilot-smoke) installs the checkout into a throwaway `COPILOT_HOME` and checks installation, routing, `session hook: off`, agent dispatch with an explicit model, first-run setup, that setup writes no sheet without the user's answers and exactly the supplied IDs with them, and that saved choices and plugin files reach a session without `--allow-all-paths` or any path-access request, from each session's `events.jsonl` and the written sheet. It runs the setup checks once per model in `SMOKE_SETUP_MODELS`. It also checks the `PreToolUse` deny, a vendored script and `check-sheet.mjs` run with no permission request, that an injected sheet line stays out of the context, that an invalid sheet yields `sheet invalid`, that each hook fires once, the merge with a second plugin's session-start context, a `-p` resume, and, on a pseudo-terminal through [`tests/copilot-tui.py`](../tests/copilot-tui.py), a slash-command first message and an interactive resume. It needs a signed-in `copilot` CLI, spends about twenty premium requests, and skips when `copilot` is missing. CI does not run it.

### VS Code

VS Code's chat has two session types that run pstack. The session picker lists Copilot sessions, which run on the Copilot runtime in VS Code's agent host, and Local sessions, which run VS Code's in-process agent. In VS Code 1.147 the Copilot type is the default, and VS Code's source marks the Local type for removal in a future release. One VS Code agent-plugin install of pstack serves both types. A plugin installed with `copilot plugin install` appears in VS Code's plugin list too. VS Code's source shows that it does not forward that plugin to the agent host, because the Copilot runtime loads it itself, so that install serves Copilot sessions. Whether a Local session loads a Copilot CLI install was not tested, so keep one install.

**Copilot sessions.** The agent host copies a VS Code agent plugin to the `agentPlugins` folder of VS Code's user data and passes the copy to the Copilot runtime. The runtime reads `.github/plugin/plugin.json` and `hooks/copilot-hooks.json` from the copy, so these sessions run the GitHub Copilot build described [above](#github-copilot). Checked live on 2026-11-18, on VS Code Insiders 1.147.0 with Copilot Chat 0.75.2026111701 and Copilot runtime 1.0.111, with a probe copy of the plugin loaded through `chat.pluginLocations`. The hooks ran with `COPILOT_PLUGIN_ROOT` naming the copy, and the routing instruction reached the model. The `skill` tool loaded `poteto-mode`, and `view` read its playbooks, which the `PreToolUse` hook approved. The `task` tool listed the four `pstack:` agents and a `vscode-agent-<hash>` copy of each, and a call with `agent_type: "pstack:poteto-agent"` returned its reply. The transcript is `~/.copilot/session-state/<id>/events.jsonl`, with `client_name` set to `vscode-agent-host`. The copy lagged behind the checkout. VS Code refreshed it once after a folder was added, a renamed file never reached it, and a checkout at a new path got a fresh copy. Claude Haiku 4.5 could not start a Copilot session with pstack loaded, because the static system messages and tool definitions exceeded its context budget.

**Local sessions.** VS Code reads the first manifest it finds in this order: `.plugin/plugin.json`, `.claude-plugin/plugin.json`, `plugin.json`, then `.github/plugin/plugin.json`. pstack ships the second, so a Local session reads it as a Claude Code plugin with its skills, agents, `hooks/hooks.json`, and the default `rules/` directory, and never reads the Copilot manifest. The generator fails when an earlier manifest would shadow the Claude Code one, and when that manifest names a `rules` entry, which would replace the default directory. VS Code's source shows that a Local `SessionStart` hook can add context only as JSON `hookSpecificOutput.additionalContext`, so Local drops the Claude Code hook's plain text. Chat hooks can also be off. On the account used for these checks, Local resolved no hooks and logged the plugin's hooks file as disabled. VS Code's source forces hooks off through an account policy when the account lacks preview features, which is the inferred cause. For these reasons Local routing is an instruction file and no hook.

With chat hooks on, VS Code on Windows runs a hook's `windows` field, else its `powershell` field, else its command, through `powershell.exe -ExecutionPolicy Bypass -NoProfile -NoLogo -Command` when `ComSpec` is `cmd.exe`, and shows the user a warning on the first turn for any exit code other than 0 or 2. PowerShell could not parse the Claude Code command `"<plugin>/hooks/session-start.sh" claude` that pstack shipped then, so the hook carries `"powershell": "exit 0"`; Local sessions take routing from `rules/pstack-routing.md`. This was checked live on 2026-11-18, on a Windows Server 2025 Azure VM with VS Code Insiders 1.148.0, Git for Windows 2.56.1, and the account's editor preview features on. Without an override, the first turn of each Local session showed "Warning from Session Start hook" with PowerShell's `Unexpected token 'claude'` parser error. The debug log (`<workspaceStorage>/<id>/GitHub.copilot-chat/debug-logs/<session>/main.jsonl`) recorded the hook with `resultKind` `non_blocking_error`, the "GitHub Copilot Chat Hooks" output showed `Completed (NonBlockingError)`, and the same spawn exited with code 1. The routing rule still attached, so only the warning was wrong. The hook therefore carries `"powershell": "exit 0"`. After that change, a new Local session's hook reported `Completed (Success)` with no output, the first turn showed no warning, and the debug log listed `pstack-routing.md` on its `context included` line. Claude Code 2.1.327 has no `powershell` field in its command hook schema and drops unknown keys. On macOS, `claude -p --plugin-dir` runs with and without the key gave the same SessionStart hook events, routing output, and reply. On the Windows VM, Claude Code 2.1.327 with Git for Windows ran the hook's command with and without the key, exiting 0 with the routing instruction both times.

[`rules/pstack-routing.md`](../plugins/pstack/rules/pstack-routing.md) has `applyTo: '**'`, so VS Code attaches it to every Local request. On the account with hooks off, VS Code attached the shipped rule to every Local request, and the debug log listed it on its `context included` line. Given a two-file task, a Claude Sonnet 5.5 Local session followed it. The model read the `poteto-mode` skill, the VS Code Local mapping, and a model sheet that named `Claude Haiku 5.5 (copilot)` for the feature role. Then it called `runSubagent` with `agentName: "poteto-agent"` and that model, and the subagent replied. In a Copilot session in VS Code, the same plugin copy held the rule, and the model reported no instruction addressed to the Local agent. The rule states the routing conditions of the [hook's instruction](../plugins/pstack/hooks/session-start-context.md), points at the [VS Code Local mapping](../plugins/pstack/skills/poteto-mode/references/vscode-local-tools.md), and ignores sessions without `runSubagent`. The file ends in `.md` and not `.instructions.md`. The Copilot runtime in VS Code's agent host attached `rules/pstack-routing.instructions.md` and did not attach the `.md` file, so the suffix keeps the Local routing out of Copilot sessions. Claude Code 2.1.327 ignored a plugin `rules/` directory. The generator fails when the rule is missing, has an `.instructions.md` twin, lacks `applyTo: '**'`, drops the mapping pointer or `runSubagent`, differs from the hook's routing conditions, or passes 3000 bytes.

**Local models and tools.** The `runSubagent` tool takes an agent's bare name as `agentName` and a model as `Model Name (vendor)`. It has no effort field and no background mode. A call with an unknown `model` fails before any subagent starts, and its error lists the available models. VS Code's source also refuses a model above the session model's cost tier, which has not been run. The model sheet is `~/.copilot/instructions/pstack-models-vscode-local.instructions.md`. It has a `description` and no `applyTo`, so VS Code lists it among the session's instructions with its absolute path and does not attach its text, and the routing rule tells the agent to read it before a role-model skill. Copilot sessions in VS Code do not see that file. `read_file` read the plugin's own files outside the workspace without a prompt. Local keeps transcripts at `<workspaceStorage>/<id>/GitHub.copilot-chat/transcripts/<sessionId>.jsonl`, which pstack's transcript finder does not read.

**Not checked.** The marketplace install route comes from VS Code's source and was not run. Five other cases were not run: Windows Copilot sessions, VS Code's separate Agents window, a Copilot CLI install seen from a Local session, the cost-tier refusal of `runSubagent`, and a macOS Local session with chat hooks on. For the last one, VS Code's source shows that Local logs the Claude Code hook's plain text as non-JSON output and ignores it, without a message to the user. VS Code loads the account's cached policy at start, and refetches only when the cache is older than an hour (`isDataStale`). An hourly timer repeats the check, skips it while the window is unfocused, and runs it when the window regains focus (a `3600*1e3` interval beside `defaultAccount.cachedPolicyData` in the 1.148.0 workbench bundle). `Developer: Sync Account Policy` (`workbench.action.syncAccountPolicy`) forces a refetch, so run it to pick up a policy change at once. The cache lives in `User/globalStorage/state.vscdb`. To see the cached flag and when it was fetched without touching the database, run `sqlite3 -readonly "<User>/globalStorage/state.vscdb" "select value from ItemTable where key='defaultAccount.cachedPolicyData'"` and read `chat_preview_features_enabled` and the `*FetchedAt` times. A new instance with its own `--user-data-dir` fetched the policy at launch, so it does not depend on the hourly poll. The case stays unchecked because the account's editor preview features are off by enterprise policy. The `gh` token used for these checks lacks the `admin:enterprise` scope, and no REST endpoint for that control was found, so it was not turned on for a test.

To recheck the Local rule in a live session, load a checkout through `chat.pluginLocations`, open a Local session, and ask the model to quote the first sentence of its pstack instruction. VS Code's debug log lists each attached instruction file on a `context included` line. The repository's [verify skill](../.claude/skills/verify/SKILL.md) scripts this check, the Copilot session check, and the Claude Code check, each in its own throwaway instance.

### Muse

The Muse build is a native Muse plugin bundle rooted at `plugins/pstack/`. Its [manifest](../plugins/pstack/.muse-plugin/plugin.json) lists every shared skill as a skill capability and one inline `SessionStart` hook that runs `node hooks/session-start.mjs muse`. The generator owns the manifest's skill list and hook, so the list always matches the tree and the hook always runs the argv in `MUSE_HOOKS` in `tools/runtimes.mjs`. Muse rejects a command whose id duplicates a skill id, so the build ships no command templates: Muse lists each user-invocable skill as `/<name>` itself, and plugin skills load with `read_skill` as `plugin:pstack:<name>`.

Install from a clone as the [README](../README.md) shows, then approve the plugin. Muse runs third-party hooks and agent definitions only after `muse plugins approve pstack`; until then the skills work on request and nothing routes automatically. Once approved, the hook prints the [Muse routing instruction](../plugins/pstack/hooks/session-start-muse.md) as plain additional context, plus the saved role lines from `${XDG_CONFIG_HOME:-~/.config}/muse/pstack-models.md` when the sheet has any. Only known role lines whose entries are model IDs or aliases reach the context, rebuilt from their checked values. `session hook: off` in the sheet disables the injection, as on the other runtimes.

Muse caps its skill catalog at 32 KB, so with pstack's 65 skills installed it compacts descriptions to fit; no skill id is dropped, and every skill still loads by name. The plugin's four `agents/` files register as Muse agent definitions under scoped ids such as `pstack/poteto-agent`, so poteto-mode's dispatches resolve as written, through the Muse mapping. A role's effort suffix passes as a Workflow child's `effort`, the Muse form of the dispatch effort field every runtime now uses. The Muse block of `models.json` gives a Muse model per tier; `subagent_spawn` takes a definition rather than a model, so per-role models apply where the dispatch takes one (a Workflow child's `model`), and the mapping says so. The `typescript-best-practices` skill's `paths` frontmatter is metadata on Muse, so `muse skills validate` reports it as an unsupported-field warning while the skill stays valid.

Update an installed copy after a `git pull` with `muse plugins update pstack`, and re-approve when Muse asks, since approval is pinned to the hook and agent definitions it first saw. Remove it with `muse plugins remove pstack`.

## Configuration and dependencies

Invoke [setup-pstack](../plugins/pstack/skills/setup-pstack/SKILL.md) to choose models for each role. It detects available models, confirms the choices, and writes an override sheet. Its [runtime table](../plugins/pstack/skills/setup-pstack/references/runtimes.md) names the sheet path and loading mechanism for each runtime. Defaults live in [models.json](../plugins/pstack/models.json).

For design comparisons and reviews, choose distinct models available to your runtime. The default panel uses different Claude models.

Install dependencies for the workflows you use:

| Dependency | When you need it |
| --- | --- |
| GitHub CLI, `gh` | PR monitoring and shipping. Authenticate with `gh auth login`. The playbooks use Origin's CLI, `origin`, instead when it can resolve the repository. |
| Node.js | The `SessionStart` hook on Claude Code, Codex, GitHub Copilot, Muse, MiniMax Code, and Antigravity, Copilot's `PreToolUse` hook, and the bundled `.mjs` scripts. Each runs as `node <script>` on macOS, Linux, and Windows, with no `sh` or PowerShell script. Without `node` on the hook's PATH, the hook fails and the session starts without the routing instruction. |
| Bun | The bundled `watch-pr` scripts. Their bootstrap installs script dependencies on first run. |
| `plugin-dev` | Claude Code skill-authoring guidance used by `automate-me`, `reflect`, and `poteto-mode`. |

Install the Claude Code skill-authoring companion with:

```text
/plugin marketplace add anthropics/claude-plugins-official
/plugin install plugin-dev@claude-plugins-official
```

Those authoring workflows need `plugin-dev` for their guidance; other workflows do not. Codex and GitHub Copilot use the equivalents named in their mappings: [Codex](../plugins/pstack/skills/poteto-mode/references/codex-tools.md#driver-and-bundled-skills-pstack-references) and [Copilot](../plugins/pstack/skills/poteto-mode/references/copilot-tools.md#driver-and-bundled-skills-pstack-references).

Playbooks use the runtime's task-tracking tools or an uncommitted `todo.md` checklist. For Claude Code, the repository documents `CLAUDE_CODE_ENABLE_TODO_TOOLS=1`; see [platform adaptation](../plugins/pstack/skills/poteto-mode/SKILL.md#platform-adaptation).

Use [create-verification-skill](../plugins/pstack/skills/create-verification-skill/SKILL.md) to record how the agent should run and check your project, following the [driver policy](../plugins/pstack/skills/poteto-mode/SKILL.md#non-negotiables).

## Maintenance

### Repository layout

```text
.claude-plugin/marketplace.json    Claude Code marketplace
.agents/plugins/marketplace.json  Codex marketplace
package.json                      Pi package manifest
plugins/pstack/
  .claude-plugin/plugin.json      Claude Code plugin manifest
  .codex-plugin/plugin.json       Codex plugin manifest
  .github/plugin/plugin.json      GitHub Copilot plugin manifest
  .muse-plugin/plugin.json        Muse native plugin manifest (skill list generated)
  pi/                            Pi extension (subagent, question, and wake-up tools)
  opencode/                      OpenCode 2 server plugin
  skills/                        Shared skills, references, and scripts
  agents/                        Claude Code subagent definitions (Muse agent definitions too)
  hooks/                         Startup routing for Claude Code, Codex, Copilot, Muse, MiniMax Code, Antigravity, and OpenCode; Copilot tool checks
  rules/                         Routing instruction for VS Code's Local agent
tools/                           Generation, validation, and upstream sync
tests/                           Repository checks
```

Skills-only installs use `plugins/pstack/skills/`. Agent references and license files are included under `poteto-mode/references/`.

### Generated files and checks

The [generator](../tools/generate.mjs) updates versions, model defaults, Copilot and Muse preambles and role lists, the Muse manifest's skill list, and portable reference files, and validates the Pi package manifest and the VS Code Local routing rule. It also fails when the [slash-command table](#slash-commands) and the public skills disagree. Keep a row for every public skill, with `poteto-mode` first.

[Documentation fact tests](../tests/readme-facts.test.mjs) check the skill counts and upstream pin. The table parser requires the header `| command | use it when |`.

Run the generator and repository tests with Bun:

```shell
bun install --frozen-lockfile
bun tools/generate.mjs
bun test tests/
```

The install step reads the root `bun.lock` and fetches `typebox`, which the Pi extension and its tests import.

CI also checks shell scripts, workflows, Markdown, relative links, and the bundled Bun tools. See [local checks](../CONTRIBUTING.md#things-that-will-fail-ci) for commands and [release instructions](../CONTRIBUTING.md#releasing) for versioning and the live Claude Code command check.

### Port scope and attribution

The skill tree is synced against upstream `c742dd6` (v0.15.36). The thermos skills and agents are synced against `118e73b` (thermos 1.0.0).

This repository ports Lauren Tan's pstack from Cursor to Claude Code and shares the skills with other runtimes. It includes six cursor-team-kit skills, the three thermos skills with their two review subagents, and an independently authored `babysit` skill. The port supplies Claude Code plugin registration and routing, Codex manifests, the Codex tool mapping, the Pi package, extension, and tool mapping, the GitHub Copilot hooks and tool mapping, and the Muse native plugin, routing hook, and tool mapping.

Cursor-specific automations, sticky-mode metadata, the Grok Bot UI workflow, and the Cursor UI tutorial are excluded. [tools/upstream.json](../tools/upstream.json) records the revisions and exclusions, [tools/substitutions.json](../tools/substitutions.json) holds the Cursor-to-Claude rewrite rules, and [CHANGES.md](../CHANGES.md) records each release. The bundled `thermo-nuclear-code-quality-review` provides a maintainability review when a workflow calls for one, `thermo-nuclear-review` a correctness and security audit, and `thermos` runs both as parallel subagents.

For skill changes, follow the [sync boundary](../CONTRIBUTING.md#the-sync-boundary). Runtime adaptations and workflow changes both land here, and a workflow change is declared as a fork.

See the [license summary](../README.md#license) for licenses and full-plugin attribution. [NOTICE-skills.md](../NOTICE-skills.md) is the notice for skills-only installations.
