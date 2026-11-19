import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { jobCommand, LINT_JOBS, missingTools, runJob, WORKFLOW } from "../tools/ci-local.mjs";

const workflow = Bun.YAML.parse(readFileSync(WORKFLOW, "utf8"));
const command = (job) => jobCommand(workflow, LINT_JOBS.find((row) => row.job === job));

describe("LINT_JOBS", () => {
  test.each(LINT_JOBS)("$job names a step that exists in ci.yml", (row) => {
    expect(jobCommand(workflow, row).run.length).toBeGreaterThan(0);
  });

  test("the commands are the ones CI pins", () => {
    expect(command("markdownlint").run).toMatch(/markdownlint-cli2@\d+\.\d+\.\d+/);
    expect(command("links").run).toMatch(/lychee:\d+\.\d+\.\d+@sha256:/);
    expect(command("actionlint").run).toMatch(/actionlint:\d+\.\d+\.\d+@sha256:/);
    expect(command("scripts")).toEqual({
      run: expect.stringMatching(/prettier@\d+\.\d+\.\d+ --check/),
      cwd: "plugins/pstack/skills/poteto-mode/scripts",
    });
  });

  test("every executable a command runs is in the row's needs", () => {
    for (const row of LINT_JOBS) {
      const { run } = jobCommand(workflow, row);
      for (const tool of ["docker", "npx", "bunx", "shellcheck"]) {
        if (new RegExp(`(^|\\s)${tool}\\s`).test(run)) expect(row.needs).toHaveProperty(tool);
      }
    }
  });
});

describe("a missing tool", () => {
  test("is reported with how to install it", () => {
    const needs = { nosuchtool: "install it" };
    expect(missingTools(needs, () => null)).toEqual([["nosuchtool", "install it"]]);
    expect(missingTools(needs, () => "/bin/x")).toEqual([]);
  });

  test("fails the job instead of skipping it", () => {
    const row = { job: "markdownlint", step: "Run markdownlint", needs: { "no-such-tool-xyz": "install it" } };
    expect(runJob(workflow, row)).toBe(false);
  });
});
