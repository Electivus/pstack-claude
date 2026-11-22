# Codex seats

This file is port-only and applies to Claude Code only. Every runtime's build ships this directory, so other runtimes ignore it.

A Codex seat runs a role on the Codex CLI instead of the `Agent` tool. It gives Claude Code a real model from another family.

## Sheet syntax

A Codex seat is a value in the Claude Code override sheet `pstack-models.md`, as a role's value or as one entry of a panel list.

- `codex` runs the model Codex is configured for.
- `codex/<model>` runs that model. `<model>` matches `[a-z0-9][a-z0-9.-]*`.
- Optionally, `@<level>` after a space sets the reasoning effort. The level is `low`, `medium`, `high`, `xhigh`, or `max`.

`scripts/codex-seat.mjs` owns this syntax. Any other value exits 2 with one line on stderr and runs nothing. A Codex seat is opt-in. No default line names one.

## Families

A Codex seat is a family of its own, different from every Claude model.

Some skills ask for a model from another family and name no role line. Examples are the second opinion in **poteto-mode** and the trail review in **show-me-your-work**. For those, use the first Codex seat in the `arena cross-judge pool` line. With none there, pick as before.

The same seat runs every independent verifier or reviewer of a change another agent wrote, such as the Shipping verifier and a required review gate. It replaces the `Agent` subagent that the `swarm workers` line would otherwise pick. A role with its own line, such as `swarm workers`, `thermos reviewers`, or `no-comments reviewer`, keeps that line.

Arena and the Eval playbook take the first entry of that line from another family than the parent. So put the Codex seat first in the line. One line in the sheet then routes the cross-judge, the eval judge, second opinions, independent verifiers, and the trail review to Codex.

## Dispatch

1. Write the kickoff an `Agent` seat would get to a file in the seat's scratch directory. Its first line still names `worker.md`.
2. Run the script with the Bash tool and `run_in_background: true`, in the same message as the other seats.

```shell
node <poteto-mode-dir>/scripts/codex-seat.mjs '<seat>' --cd <dir> --prompt <file> --out <file> [--write [--network] [--add-dir <dir>]...]
```

`<poteto-mode-dir>` is this skill's directory. `--out` is the file the seat's final message lands in.

3. When the run finishes, read `<out>`. Read `<out>.log` only on a failure. It holds Codex's progress output.

`--out` must not name the prompt file. The script removes any earlier `<out>` before the run, so an old answer never passes for this one.

The log's `session id` line names the seat's Codex session. Its transcript is the file under `${CODEX_HOME:-~/.codex}/sessions/` whose name ends in that id. Where a skill reads a delegate's transcript, as **show-me-your-work** and the Eval playbook do, read that file for a Codex seat.

The script exits 0 and prints `codex seat ok: <out>` when `<out>` holds an answer. A run that exits 0 and leaves `<out>` missing or empty counts as a failure.

## Effort

Resolve the level as for an `Agent` seat, then append a space and `@<level>` to the seat argument. A seat with no level runs at the effort Codex is configured for.

## Sandbox

A seat is read-only by default. Use that for a judge, a reviewer, or a second opinion.

Pass `--write` for a seat that produces files, such as an arena runner or an interrogate adversary. Point `--cd` at that seat's own worktree or output directory. The script always passes `-s`, so a `sandbox_mode` in the operator's Codex config never applies to a seat. The operator's `[sandbox_workspace_write]` settings still apply under `--write` and can add writable roots. Their `network_access` alone does not open the network when the operator's Codex has the `network_proxy` feature on, because the proxy then denies every domain off its allowlist.

Three limits hold under `--write` with those settings at their defaults, observed with codex-cli 0.171.0.

- The writable roots are the `--cd` directory, the system temp directory, and `$TMPDIR`.
- `git commit` fails inside a linked git worktree, because the index lives in the main repository's `.git`. The parent commits the seat's files.
- Commands the seat runs have no network.

Two opt-in flags lift the first and last limits for one seat. Each needs `--write`, and the script exits 2 without it.

- `--network` gives the seat's commands the network. It sets `network_access` and turns Codex's network proxy off for that run, so every domain is reachable. Use it for a seat that runs `gh`, installs dependencies, or reads CI.
- `--add-dir <dir>`, repeatable, adds a writable root, such as a package manager's store. It does not let the seat commit in a linked worktree. Codex keeps `.git` read-only even when the main repository's `.git` is added, so the parent still commits.

A networked seat runs with the operator's credentials. `gh` inside it is signed in as the operator, so it can call the GitHub API as them, comments and merges included, and nothing in the sandbox stops it. Keep the default split. The seat returns its verdict as text, and the parent posts it and lands the change.

## Failure

A non-zero exit is a dispatch failure. The script prints `codex seat failed: exit <n>, log <out>.log` to stderr. Exit 127 means `codex` is not on PATH. Handle it as you handle a slug the `Agent` tool rejects, with the calling skill's own fallback, and report it.

## Review gates

A Codex seat that did not write the change counts as an independent reviewer for a review gate.

## Verifiers

A verifier runs the change the way a user would. On a Codex seat that changes four things.

- You create the verifier's worktree at the PR head, because the seat cannot write `.git`. Point `--cd` at it.
- Run the seat with `--write`. Add `--network` when it calls `gh`, installs dependencies, or reads CI. Otherwise install dependencies and download CI logs into the worktree before dispatch.
- Name the driver skill in the kickoff by its absolute path, since the seat does not load Claude Code skills.
- The seat returns `PASS`, `PASS+NOTES`, or `FAIL` as text. You post it on the PR verbatim, labelled with the seat, and record the head SHA it ran.

When the seat fails to dispatch, run the verifier as an `Agent` subagent that did not write the change, and say so in the reply.

## Requirements

- `codex` is on PATH and signed in. Check with `codex login status`.
- `codex debug models` lists the model slugs that fill `<model>`.
- Codex seats are verified on macOS and unverified on Windows, where `codex` may be a `.cmd` shim.
