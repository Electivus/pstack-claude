// Port-local rules live in files the port has forked, which tools/sync.mjs
// three-way merges: a clean merge is written, and a conflict is written with
// markers for a human to resolve. A rule dropped in either reads as a clean
// sync, so each one is pinned here by the sentence that carries it, with the
// issue or PR that earned it.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const skillsDir = fileURLToPath(new URL("../plugins/pstack/skills", import.meta.url));

const rules = [
  {
    source: "#331 Codex session effort with an explicit model",
    file: "poteto-mode/references/codex-tools.md",
    phrase: "pass the final level as `reasoning_effort`",
  },
  {
    source: "#331 unknown Codex session effort",
    file: "poteto-mode/references/codex-tools.md",
    phrase: "Do not substitute an omitted `reasoning_effort` for the missing starting level.",
  },
  {
    source: "#331 resolve active Codex effort before dispatch",
    file: "poteto-mode/references/codex-tools.md",
    phrase: "run `node <poteto-mode-dir>/scripts/codex-session-effort.mjs` before dispatching",
  },
  {
    source: "#71 callable driver policy",
    file: "poteto-mode/SKILL.md",
    phrase: "fall back to `run` when the repo has none",
  },
  {
    source: "#71 generated skill name",
    file: "create-verification-skill/SKILL.md",
    phrase: "YAML frontmatter (`name: verify`",
  },
  {
    source: "#71 preserve the original generator trigger",
    file: "create-verification-skill/SKILL.md",
    phrase: "make a control skill for this repo",
  },
  {
    source: "#71 maintain older generated skills",
    file: "maintain-verification-skill/SKILL.md",
    phrase: "or `.claude/skills/verify-*/` from an older generator",
  },
  {
    source: "#71 formal skill must not take the driver name",
    file: "create-formal-verification-skill/SKILL.md",
    phrase: "never `verify` or a `verify-` prefix, which belong to the driver skill `/create-verification-skill` writes",
  },
  {
    source: "#71 formal maintainer skips the driver skill",
    file: "maintain-formal-verification-skill/SKILL.md",
    phrase: "The project `verify` skill that `/create-verification-skill` writes drives the app and is not one.",
  },
  {
    source: "#72 task fallback keeps skipped steps",
    file: "poteto-mode/SKILL.md",
    phrase: "with the playbook steps verbatim and each `skip: <reason>` line",
  },
  {
    source: "#72 task fallback is a local checklist",
    file: "poteto-mode/SKILL.md",
    phrase: "an uncommitted `todo.md` Markdown checklist",
  },
  {
    source: "#229 parallel sessions keep separate todolists",
    file: "poteto-mode/SKILL.md",
    phrase: "When several sessions share the checkout, name it `.audit/<task-slug>.todo.md`",
  },
  {
    source: "#387 desktop app plan tool is named",
    file: "poteto-mode/SKILL.md",
    phrase:
      "In the Claude desktop app, only the main conversation calls `mcp__ccd_turn__update_plan`, which asks for items of about seven words.",
  },
  {
    source: "#28 a subagent keeps its own checklist",
    file: "poteto-mode/SKILL.md",
    phrase: "A subagent keeps its checklist in its task tool or `todo.md`.",
  },
  {
    source: "#387 desktop app keeps the verbatim checklist",
    file: "poteto-mode/SKILL.md",
    phrase: "keep this checklist as well, with the playbook steps verbatim and each `skip: <reason>` line",
  },
  {
    source: "#58 stop before you re-delegate",
    file: "poteto-mode/SKILL.md",
    phrase: "Stop the abandoned agent first, and confirm it stopped.",
  },
  {
    source: "#58 delegate isolation",
    file: "poteto-mode/playbooks/feature.md",
    phrase: "Give every file-writing delegate its own worktree",
  },
  {
    source: "#228 delegate worktree starts from the branch",
    file: "poteto-mode/playbooks/feature.md",
    phrase: "create its worktree with `git worktree add <path> -b <delegate-branch> HEAD`",
  },
  {
    source: "#59 item 1 drain the roster",
    file: "poteto-mode/playbooks/opening-a-pr.md",
    phrase: "stop every one that holds it, including grandchildren you never launched",
  },
  {
    source: "#59 item 2 verify the process",
    file: "principle-prove-it-works/SKILL.md",
    phrase: "Verify the process as well as the outcome.",
  },
  {
    source: "#59 item 3 red is a colour",
    file: "principle-prove-it-works/SKILL.md",
    phrase: "Red is a colour, not a measurement.",
  },
  {
    source: "#59 item 3 quote the failure content",
    file: "tdd/SKILL.md",
    phrase: "Quote the failure content",
  },
  {
    source: "#59 item 4 search the places the rules name",
    file: "recall/SKILL.md",
    phrase: "A search that skips a place the project's rules name is not exhausted.",
  },
  {
    source: "#59 item 5 blast-radius before design",
    file: "blast-radius/SKILL.md",
    phrase: "a brief that asserts something about existing code",
  },
  {
    source: "#59 item 6 load the platform skill",
    file: "poteto-mode/SKILL.md",
    phrase: "load that platform's skill",
  },
  {
    source: "#59 item 7 severity picks the artifact",
    file: "poteto-mode/SKILL.md",
    phrase: "severity decides its artifact, not where it turned up",
  },
  {
    source: "#86 confirm the first status read",
    file: "poteto-mode/playbooks/babysit.md",
    phrase: "confirm that the PR or stack it reports matches the request",
  },
  {
    source: "autopilot verify loop: only findings the diff causes go back",
    file: "poteto-mode/playbooks/autopilot-full.md",
    phrase: "A problem the PR's base already has, whether trunk or the PR below it in a stack, doesn't block unless the PR copies it or newly reaches it.",
  },
  {
    source: "autopilot verify loop: bounded rounds",
    file: "poteto-mode/playbooks/autopilot-full.md",
    phrase: "Two fix-forwards per PR is the ceiling.",
  },
  {
    source: "autopilot verify loop: size stated before fan-out",
    file: "poteto-mode/playbooks/autopilot-full.md",
    phrase: "A program of more than three owners waits for the operator's go on that size",
  },
  {
    source: "#188 no self-review in place of an independent one",
    file: "poteto-mode/SKILL.md",
    phrase: "Never count your own review, passing tests, or CI as the independent verdict.",
  },
  {
    source: "#188 a missing reviewer blocks the gate",
    file: "poteto-mode/SKILL.md",
    phrase: "Record `BLOCKED: independent review` in the todolist",
  },
  {
    source: "backnotprop/pstack#14 an outside rule nobody can check is held, not deleted",
    file: "poteto-mode/references/agents/comment-sicko.md",
    phrase: "the comment stays put as a `HOLD`, the one case where doubt is not meat",
  },
  {
    source: "backnotprop/pstack#14 a kill of an outside rule cites its evidence",
    file: "poteto-mode/references/agents/comment-sicko.md",
    phrase: "dies, and the kill cites the page or file",
  },
  {
    source: "backnotprop/pstack#14 the parent keeps each HOLD",
    file: "no-comments/SKILL.md",
    phrase: "and where to check it is not an ambiguous keep. Leave it in place and report it open.",
  },
  {
    source: "backnotprop/pstack#14 a second rejection keeps the accepted findings",
    file: "no-comments/SKILL.md",
    phrase: "fail `/no-comments` for that report's rejected findings, not for the run.",
  },
  {
    source: "backnotprop/pstack#14 an outside-rule kill needs a refuting citation",
    file: "no-comments/SKILL.md",
    phrase: "unless the report cites a documentation page or source file that refutes the rule",
  },
  {
    source: "#20 every merge request routes to Shipping",
    file: "poteto-mode/SKILL.md",
    phrase: "Merging, landing, or shipping PRs, stacked or independent, including PRs another session wrote",
  },
  {
    source: "#12 parallel delegates get their own scratch directory",
    file: "poteto-mode/SKILL.md",
    phrase: "Give each parallel delegate its own scratch subdirectory (`<scratchpad>/<tag>/`) in its brief.",
  },
  {
    source: "#12 parallel delegates keep REPL names apart",
    file: "poteto-mode/SKILL.md",
    phrase: "wrap its REPL scripts in a block or prefix its top-level names",
  },
  {
    source: "#29 host-runtime proofs reach the driver skill",
    file: "poteto-mode/SKILL.md",
    phrase: "or a change whose proof drives a host app, IDE, or agent runtime",
  },
  {
    source: "#14 trunk CI on the last merge commit",
    file: "poteto-mode/playbooks/shipping.md",
    phrase: "Before the reply, wait for trunk CI on the last merge commit",
  },
  {
    source: "#8 a PR's closing issues are recorded and checked before merge",
    file: "poteto-mode/playbooks/shipping.md",
    phrase: "Record each PR's intended closing issues beside its head.",
  },
  {
    source: "#8 ship-pr inspect compares the recorded closing issues",
    file: "poteto-mode/playbooks/shipping.md",
    phrase: "merge only on `kind: inspected`",
  },
  {
    source: "#9 a body read for write-back drops gh's stderr hint",
    file: "poteto-mode/playbooks/opening-a-pr.md",
    phrase: "--json body --jq .body 2>/dev/null",
  },
  {
    source: "#21 every CI job runs before the first push",
    file: "poteto-mode/playbooks/opening-a-pr.md",
    phrase: "run every CI job's `run:` command locally at its pinned version, tests and builds included",
  },
  {
    source: "#21 delegates get the same checks",
    file: "poteto-mode/playbooks/feature.md",
    phrase: "success criteria that include every CI job's command from **Opening a PR**",
  },
  {
    source: "#22 a deferred follow-up names its owner",
    file: "poteto-mode/playbooks/opening-a-pr.md",
    phrase: "name each follow-up's owner",
  },
  {
    source: "#22 merging alone ships nothing",
    file: "poteto-mode/playbooks/opening-a-pr.md",
    phrase: "tell the user in your reply that merging alone ships nothing",
  },
  {
    source: "#33 a negative result needs the host's record or a control run",
    file: "principle-prove-it-works/SKILL.md",
    phrase: "needs the host's own record (a log or transcript) or a control run without the change",
  },
  {
    source: "#34 a check-would-catch-it rejection needs a mutation run",
    file: "no-comments/SKILL.md",
    phrase: "needs a mutation run that shows that check failing",
  },
  {
    source: "#23 architect probes an external runtime live",
    file: "architect/SKILL.md",
    phrase: "probe it live before sketching, through its own run, debug, and log entry points. Label each grounding fact live, code, or inference.",
  },
  {
    source: "#12 an overwritten PR body is restored from its edit history",
    file: "poteto-mode/SKILL.md",
    phrase: "To restore an overwritten PR body, read GitHub's `pullRequest.userContentEdits { createdAt diff }`",
  },
  {
    source: "#15 a test-only flake fix keeps the contract",
    file: "principle-fix-root-causes/SKILL.md",
    phrase: "a fix to the test alone must leave a failing or skipped test that names the tracking issue",
  },
  {
    source: "#24 explorers list run, debug, and log entry points",
    file: "how/SKILL.md",
    phrase: "Name the subsystem's own ways to run and observe it",
  },
  {
    source: "#25 a probe settles an observable disagreement",
    file: "arena/SKILL.md",
    phrase: "When candidates disagree on a fact you can observe, run the smallest probe that settles it",
  },
  {
    source: "#26 only a dispatch failure skips the cross-judge",
    file: "arena/SKILL.md",
    phrase: "Only that dispatch failure skips the judge. Convergence, a live probe, or a clear winner never does.",
  },
  {
    source: "#26 convergence waives grafting only",
    file: "arena/SKILL.md",
    phrase: "Convergence waives grafting only, not the Phase C judge.",
  },
  {
    source: "#27 candidates report risks and checks",
    file: "arena/SKILL.md",
    phrase: "what could break, and how to verify it",
  },
  {
    source: "#27 every candidate's risks and checks reach the synthesis",
    file: "arena/SKILL.md",
    phrase: "Merge every candidate's risks and verification checks into the synthesis, separately from the design grafts",
  },
  {
    source: "#25 #27 the synthesis note carries the probe and the merged checks",
    file: "arena/SKILL.md",
    phrase: "the probe that settled any disagreement on an observable fact, every candidate's merged risks and verification checks with the reason for each one dropped",
  },
  {
    source: "#31 a file added to a shared directory runs blast-radius",
    file: "poteto-mode/SKILL.md",
    phrase: "A change that adds a file to a directory several runtimes or consumers load → **blast-radius**",
  },
  {
    source: "#31 Blast Radius comes from the consumers",
    file: "poteto-mode/playbooks/opening-a-pr.md",
    phrase: "from the list of consumers that the **blast-radius** skill builds, not from what you tested.",
  },
  {
    source: "#31 Blast Radius runs blast-radius",
    file: "poteto-mode/playbooks/opening-a-pr.md",
    phrase: "Write `## Blast Radius` from the list of consumers",
  },
  {
    source: "#21 Verification names each CI job not run locally",
    file: "poteto-mode/playbooks/opening-a-pr.md",
    phrase: "In `## Verification`, name each CI job you could not run locally.",
  },
  {
    source: "#31 blast-radius description names shared directories",
    file: "blast-radius/SKILL.md",
    phrase: "a change that adds a file to a directory several runtimes or consumers load, or a brief",
  },
  {
    source: "#32 a repeated wait triggers Attack the Premise",
    file: "poteto-mode/SKILL.md",
    phrase: "or a second wait or retry for an external state change (policy, token, cache, propagation) has ended without the change",
  },
  {
    source: "#32 attack-the-premise description covers repeated waits",
    file: "principle-attack-the-premise/SKILL.md",
    phrase: "or when a second wait or retry for an external state change (policy, token, cache, propagation) has ended without the change",
  },
  {
    source: "#32 read the state record before waiting again",
    file: "principle-attack-the-premise/SKILL.md",
    phrase: "Before you wait again, read the record that shows the current state and when it was last fetched.",
  },
];

describe("port-local skill rules", () => {
  test("every pinned phrase is distinctive enough to pin a rule", () => {
    const phrases = rules.map((r) => r.phrase);
    expect(new Set(phrases).size).toBe(phrases.length);
    for (const phrase of phrases) expect(phrase.length).toBeGreaterThanOrEqual(20);
  });

  for (const { source, file, phrase } of rules) {
    test(`${file} keeps the rule from ${source}`, () => {
      expect(readFileSync(join(skillsDir, file), "utf8")).toContain(phrase);
    });
  }
});
