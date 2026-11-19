import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { exportTracked, jobCommand, LINT_JOBS, missingTools, runJob, WORKFLOW } from "../tools/ci-local.mjs";

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
      env: {},
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

describe("jobCommand step fields", () => {
  const row = { job: "j", step: "s" };
  const make = (step, job = {}, top = {}) => ({
    ...top,
    jobs: { j: { ...job, steps: [{ name: "s", run: "x", ...step }] } },
  });

  test("honors a step working-directory over the job default", () => {
    const defaults = { defaults: { run: { "working-directory": "a" } } };
    expect(jobCommand(make({ "working-directory": "docs" }, defaults), row).cwd).toBe("docs");
    expect(jobCommand(make({}, defaults), row).cwd).toBe("a");
  });

  test("merges job and step env, the step winning", () => {
    const workflow = make({ env: { B: "step", C: 3 } }, { env: { A: "job", B: "job" } });
    expect(jobCommand(workflow, row).env).toEqual({ A: "job", B: "step", C: "3" });
  });

  test("accepts bash and refuses what it cannot reproduce, naming job and field", () => {
    expect(jobCommand(make({ shell: "bash" }), row).run).toBe("x");
    expect(() => jobCommand(make({ shell: "pwsh" }), row)).toThrow(/job "j".*step "s".*shell/);
    expect(() => jobCommand(make({}, { defaults: { run: { shell: "python" } } }), row)).toThrow(/job "j".*shell/);
    expect(() => jobCommand(make({ env: { A: "${{ secrets.T }}" } }), row)).toThrow(/job "j".*step "s".*env\.A/);
    expect(() => jobCommand(make({ if: "always()" }), row)).toThrow(/job "j".*step "s".*if/);
    expect(() => jobCommand(make({ "continue-on-error": true }), row)).toThrow(/continue-on-error/);
  });

  test("accepts timeout-minutes, which cannot change a lint's result", () => {
    expect(jobCommand(make({ "timeout-minutes": 5 }), row).run).toBe("x");
  });

  test("honors workflow-level env, the job and the step overriding it", () => {
    const top = { env: { A: "wf", B: "wf", C: "wf" } };
    const workflow = make({ env: { C: "step" } }, { env: { B: "job" } }, top);
    expect(jobCommand(workflow, row).env).toEqual({ A: "wf", B: "job", C: "step" });
    expect(() => jobCommand(make({}, {}, { env: { A: "${{ github.sha }}" } }), row)).toThrow(/env\.A/);
  });

  test("honors workflow-level defaults.run, the job overriding it", () => {
    const top = { defaults: { run: { "working-directory": "top" } } };
    expect(jobCommand(make({}, {}, top), row).cwd).toBe("top");
    const job = { defaults: { run: { "working-directory": "job" } } };
    expect(jobCommand(make({}, job, top), row).cwd).toBe("job");
  });

  test("refuses a non-bash workflow-level shell unless the job or step sets bash", () => {
    const top = { defaults: { run: { shell: "pwsh" } } };
    expect(() => jobCommand(make({}, {}, top), row)).toThrow(/job "j".*shell/);
    expect(jobCommand(make({ shell: "bash" }, {}, top), row).run).toBe("x");
  });
});

describe("exportTracked", () => {
  test("copies tracked and unignored files and leaves ignored and deleted ones", () => {
    const repo = mkdtempSync(join(tmpdir(), "ci-local-repo-"));
    const git = (...args) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" });
    git("init", "-q");
    writeFileSync(join(repo, ".gitignore"), "ignored/\n");
    mkdirSync(join(repo, "ignored"));
    writeFileSync(join(repo, "ignored", "a.sh"), "");
    writeFileSync(join(repo, "kept.sh"), "");
    writeFileSync(join(repo, "gone.sh"), "");
    git("add", "-A", "-f", ".gitignore", "kept.sh", "gone.sh");
    rmSync(join(repo, "gone.sh"));
    writeFileSync(join(repo, "new.md"), "");
    const out = exportTracked(repo);
    try {
      expect(readdirSync(out).filter((name) => name !== ".git").sort()).toEqual([".gitignore", "kept.sh", "new.md"]);
      expect(readdirSync(out)).toContain(".git");
    } finally {
      rmSync(out, { recursive: true });
      rmSync(repo, { recursive: true });
    }
  });

  test("skips an untracked nested repository, which CI's checkout never contains", () => {
    const repo = mkdtempSync(join(tmpdir(), "ci-local-repo-"));
    const git = (...args) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" });
    git("init", "-q");
    writeFileSync(join(repo, "kept.sh"), "");
    mkdirSync(join(repo, "nested"));
    execFileSync("git", ["init", "-q", join(repo, "nested")]);
    writeFileSync(join(repo, "nested", "inner.sh"), "");
    const out = exportTracked(repo);
    try {
      expect(readdirSync(out).filter((name) => name !== ".git")).toEqual(["kept.sh"]);
    } finally {
      rmSync(out, { recursive: true });
      rmSync(repo, { recursive: true });
    }
  });

  test("removes its temporary directory when the export throws", () => {
    const scratch = mkdtempSync(join(tmpdir(), "ci-local-scratch-"));
    const repo = join(scratch, "repo");
    mkdirSync(repo);
    execFileSync("git", ["-C", repo, "init", "-q"]);
    writeFileSync(join(repo, "locked.sh"), "");
    chmodSync(join(repo, "locked.sh"), 0o000);
    const previous = process.env.TMPDIR;
    const temp = join(scratch, "tmp");
    mkdirSync(temp);
    process.env.TMPDIR = temp;
    try {
      expect(() => exportTracked(repo)).toThrow();
      expect(readdirSync(temp)).toEqual([]);
    } finally {
      process.env.TMPDIR = previous;
      rmSync(scratch, { recursive: true });
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

  test("a job whose command dies by signal fails", () => {
    const killed = { jobs: { j: { steps: [{ name: "s", run: "kill -INT $$" }] } } };
    expect(runJob(killed, { job: "j", step: "s", needs: {} }, tmpdir())).toBe(false);
  });
});
