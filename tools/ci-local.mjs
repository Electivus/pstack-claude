#!/usr/bin/env bun
// Runs the lint and static jobs of .github/workflows/ci.yml locally, with the
// command, pinned version, and working directory the job itself declares, so a
// contributor sees CI's lint failures before a push.
//
//   bun tools/ci-local.mjs [job ...]
//
// With no argument it runs every job in LINT_JOBS. A job whose tool is missing
// fails and names how to install it. Nothing is skipped silently. Exits 0 when
// every job passes and 1 otherwise.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { isMain } from "./plugin.mjs";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

export const WORKFLOW = join(REPO_ROOT, ".github/workflows/ci.yml");

// One row per job: the ci.yml job id, the name of the step whose `run` is the
// check, and the executables that command needs with how to install each.
export const LINT_JOBS = [
  { job: "markdownlint", step: "Run markdownlint", needs: { npx: "install Node.js, which ships npx" } },
  {
    job: "links",
    step: "Check relative links and fragments",
    needs: { docker: "install and start Docker, which runs lychee at CI's pinned image" },
  },
  {
    job: "actionlint",
    step: "Run actionlint",
    needs: { docker: "install and start Docker, which runs actionlint at CI's pinned image" },
  },
  {
    job: "shellcheck",
    step: "Run shellcheck",
    needs: { shellcheck: "install it, for example `brew install shellcheck`", find: "install findutils" },
  },
  {
    job: "scripts",
    step: "Check formatting",
    needs: { bunx: "install Bun, which ships bunx" },
  },
];

export function jobCommand(workflow, { job, step }) {
  const definition = workflow.jobs[job];
  const found = definition?.steps.find(({ name }) => name === step);
  if (!found?.run) throw new Error(`ci.yml has no step "${step}" with a run in job "${job}"`);
  return { run: found.run, cwd: definition.defaults?.run?.["working-directory"] ?? "." };
}

export function missingTools(needs, which = Bun.which) {
  return Object.entries(needs).filter(([tool]) => !which(tool));
}

function dockerRunning() {
  return spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;
}

export function runJob(workflow, row, root = REPO_ROOT) {
  const missing = missingTools(row.needs);
  if (missing.length > 0) {
    for (const [tool, hint] of missing) console.error(`${row.job}: ${tool} is not installed. To run it, ${hint}.`);
    return false;
  }
  if ("docker" in row.needs && !dockerRunning()) {
    console.error(`${row.job}: Docker is installed but not running. Start it, then rerun.`);
    return false;
  }
  const { run, cwd } = jobCommand(workflow, row);
  const result = spawnSync("bash", ["-c", `set -eo pipefail\n${run}`], {
    cwd: join(root, cwd),
    stdio: "inherit",
    env: { ...process.env, GITHUB_WORKSPACE: root },
  });
  return result.status === 0;
}

function main(names) {
  const rows = names.length === 0 ? LINT_JOBS : LINT_JOBS.filter(({ job }) => names.includes(job));
  const unknown = names.filter((name) => !LINT_JOBS.some(({ job }) => job === name));
  if (unknown.length > 0) {
    console.error(`Unknown job: ${unknown.join(", ")}. Jobs: ${LINT_JOBS.map(({ job }) => job).join(", ")}.`);
    return 1;
  }
  const workflow = Bun.YAML.parse(readFileSync(WORKFLOW, "utf8"));
  const failed = [];
  for (const row of rows) {
    console.log(`\n== ${row.job}: ${row.step}`);
    if (!runJob(workflow, row)) failed.push(row.job);
  }
  console.log(failed.length === 0 ? "\nAll CI lint jobs pass." : `\nFailed: ${failed.join(", ")}.`);
  return failed.length === 0 ? 0 : 1;
}

if (isMain(import.meta.url)) process.exit(main(process.argv.slice(2)));
