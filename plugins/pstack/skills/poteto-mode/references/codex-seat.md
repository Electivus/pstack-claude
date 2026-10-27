# Codex seat

On Claude Code, the line `codex seat: on` in the `pstack-models.md` override sheet adds one Codex seat to every pstack panel. The `codex@openai-codex` plugin runs it. The seat joins no role line: each role line lists only the Claude seats, and the Codex seat comes on top of them.

- **arena** gets one more runner beside the `arena runners`, and a second cross-judge beside the one Phase C picks from the `arena cross-judge pool`.
- **architect** runs the arena with its `architect runners` line in place of `arena runners`, so that arena still gets one Codex runner, not two.
- **interrogate** gets one more reviewer beside the `interrogate reviewers`.

## Launch

1. Write the filled prompt the Claude seats get to a file outside the repository, such as `/tmp/<skill>-<slug>/codex-<seat>-prompt.md`. Where a runner's prompt names its output location, name the Codex seat's own. Use an absolute path, because the companion resolves `--prompt-file` against `--cwd`.
2. Create a runner's output location before launch, with `git worktree add` or `mkdir -p`. The companion reports a missing `--cwd` as a missing Codex CLI.
3. Launch the seat with the Bash tool and `run_in_background: true`, in the same message as the `Agent` calls for the Claude seats:

   ```bash
   node "$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1])).plugins["codex@openai-codex"][0].installPath' "${CLAUDE_CODE_PLUGIN_CACHE_DIR:-${CLAUDE_CONFIG_DIR:-$HOME/.claude}/plugins}/installed_plugins.json")/scripts/codex-companion.mjs" task --cwd "<dir>" --prompt-file "<prompt file>"
   ```

   The command reads the plugin's install path on each call, because a plugin update moves it. Add `--write` for a runner seat only. Leave out `--model` and `--effort`, so the user's Codex configuration chooses. An `@<level>` suffix on a role line applies to the Claude seats only. Leave out the companion's own `--background`, which returns a job ID instead of the result.

Do not use the `codex:codex-rescue` subagent for a seat. It rewrites the prompt, defaults to write access, and can return a job ID instead of a result.

## Seats

| Seat | `--cwd` | `--write` |
| --- | --- | --- |
| Runner, in arena or architect | its own output location, as arena's Phase A gives each candidate: its own git worktree, or `/tmp/arena-<slug>/candidate-codex/` | yes |
| Arena cross-judge | the repository root | no |
| Interrogate reviewer | the repository root | no |

- **Runner.** It is one more Phase B candidate, labelled `codex`.
- **Cross-judge.** Give both judges the same rubric and candidates, and launch them in parallel. In Phase D, compare both verdicts with your own pick.
- **Reviewer.** Label it after the Claude reviewers, so Reviewer E follows Reviewers A to D, and list its model as Codex in the Reviewers output.

## Failures

Do not trust the companion's exit code, which can be 0 when Codex fails. Judge each run by its output. A run that prints no result, prints an error, or reports that Codex is not signed in or not installed is a dropout. So is a command that cannot find the plugin. Continue with the Claude seats, and record the dropout where the skill records dropouts: arena's synthesis note, or interrogate's Reviewers list. Tell the user to run `/codex:setup`, and to install the `codex@openai-codex` plugin first when the command could not find it.
