// The release check inside the required "Generated files current" job. The job
// is the ruleset's required check, so the step's place there is what blocks a
// merge. Its fetch has to work on the checkout GitHub gives a pull request,
// which is the pull request merged into its base, one commit deep.
import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const workflow = Bun.YAML.parse(readFileSync(join(repoRoot, ".github/workflows/ci.yml"), "utf8"));
const step = workflow.jobs.generated.steps.find(({ run }) => run?.includes("tools/check-release.mjs"));

describe("the step", () => {
  test("sits in the Generated files current job", () => {
    expect(workflow.jobs.generated.name).toBe("Generated files current");
    expect(step).toBeDefined();
  });

  test("runs on pull requests only, and still after an earlier step fails", () => {
    expect(step.if).toContain("github.event_name == 'pull_request'");
    expect(step.if).toContain("!cancelled()");
  });

  test("takes the base from the event through the environment, never inline", () => {
    expect(step.env).toEqual({ BASE_SHA: "${{ github.event.pull_request.base.sha }}" });
    expect(step.run).not.toContain("${{");
  });
});

describe("on a pull request's checkout", () => {
  const dirs = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  const git = (cwd, ...args) => {
    const result = spawnSync("git", args, { cwd, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    return result.stdout.trim();
  };

  // A fake GitHub holding main, the pull request's branch, and the merge of the
  // branch into main that refs/pull/1/merge points at. `pr` and `main` edit the
  // tree from the common ancestor, and the checkout is taken as actions/checkout
  // takes it, one commit deep.
  function pullRequest({ pr, main }) {
    const dir = mkdtempSync(join(tmpdir(), "pstack-ci-release-"));
    dirs.push(dir);
    const [seed, remote, work] = ["seed", "remote.git", "checkout"].map((name) => join(dir, name));
    for (const path of [seed, remote, work]) mkdirSync(path);
    git(remote, "init", "--bare", "-b", "main");
    git(seed, "init", "-b", "main");
    git(seed, "config", "user.email", "fixture@example.invalid");
    git(seed, "config", "user.name", "Fixture");
    const write = (file, text) => {
      mkdirSync(dirname(join(seed, file)), { recursive: true });
      writeFileSync(join(seed, file), text);
    };
    const commit = (message) => {
      git(seed, "add", "--all");
      git(seed, "commit", "-m", message);
    };
    for (const file of ["check-release.mjs", "plugin.mjs"]) {
      mkdirSync(join(seed, "tools"), { recursive: true });
      copyFileSync(join(repoRoot, "tools", file), join(seed, "tools", file));
    }
    write("VERSION", "0.9.1\n");
    write("plugins/pstack/skill.md", "one\n");
    write("docs/guide.md", "one\n");
    commit("base");
    git(seed, "checkout", "-b", "pr");
    pr(write);
    commit("pull request");
    git(seed, "checkout", "main");
    main(write);
    commit("main moves on");
    git(seed, "checkout", "-b", "merge");
    git(seed, "merge", "--no-ff", "pr", "-m", "merge");
    git(seed, "push", remote, "main:refs/heads/main", "merge:refs/pull/1/merge", "pr:refs/heads/pr");

    git(work, "init");
    git(work, "remote", "add", "origin", `file://${remote}`);
    const merge = git(seed, "rev-parse", "merge");
    git(work, "fetch", "--no-tags", "--prune", "--depth=1", "origin", `+${merge}:refs/remotes/pull/1/merge`);
    git(work, "checkout", "--force", "refs/remotes/pull/1/merge");
    expect(git(work, "rev-parse", "--is-shallow-repository")).toBe("true");

    writeFileSync(join(dir, "step.sh"), step.run);
    const result = spawnSync("bash", ["-e", join(dir, "step.sh")], {
      cwd: work,
      env: { ...process.env, PATH: `${dirname(process.execPath)}:${process.env.PATH}`, BASE_SHA: git(seed, "rev-parse", "main") },
      encoding: "utf8",
    });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  }

  test("fails a change to a shipped file that keeps VERSION, naming the file", () => {
    const { status, stderr } = pullRequest({
      pr: (write) => write("plugins/pstack/skill.md", "two\n"),
      main: (write) => write("docs/guide.md", "main\n"),
    });
    expect(status).toBe(1);
    expect(stderr).toContain("plugins/pstack/skill.md");
    expect(stderr).not.toContain("docs/guide.md");
  });

  test("passes a change to a shipped file that raises VERSION", () => {
    const { status, stdout } = pullRequest({
      pr: (write) => {
        write("plugins/pstack/skill.md", "two\n");
        write("VERSION", "0.9.2\n");
      },
      main: (write) => write("docs/guide.md", "main\n"),
    });
    expect({ status, bumped: stdout.includes("0.9.1 to 0.9.2") }).toEqual({ status: 0, bumped: true });
  });

  test("leaves out a shipped change that main made after the pull request branched", () => {
    const { status } = pullRequest({
      pr: (write) => write("docs/guide.md", "two\n"),
      main: (write) => {
        write("plugins/pstack/skill.md", "released on main\n");
        write("VERSION", "0.9.2\n");
      },
    });
    expect(status).toBe(0);
  });
});
