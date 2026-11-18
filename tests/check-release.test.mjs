// The release check: which paths an install carries, how VERSION compares, and
// what the command says and exits with on a real git history.
import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { isShipped, parseVersion, releaseProblems } from "../tools/check-release.mjs";
import { VERSIONED_MANIFESTS } from "../tools/generate.mjs";

const tool = fileURLToPath(new URL("../tools/check-release.mjs", import.meta.url));

describe("the paths an installed copy reads", () => {
  test.each([
    "plugins/pstack/skills/tdd/SKILL.md",
    "plugins/pstack/rules/pstack-routing.md",
    "plugins/pstack/.github/plugin/plugin.json",
    "plugins/pstack/skills/statechart/scripts/test/cli.test.ts",
    ".claude-plugin/marketplace.json",
    ".agents/plugins/marketplace.json",
    "package.json",
    "kimi.plugin.json",
  ])("%s is shipped", (path) => {
    expect(isShipped(path)).toBe(true);
  });

  test.each([
    "tests/check-release.test.mjs",
    "tools/generate.mjs",
    "docs/reference.md",
    ".github/workflows/ci.yml",
    "README.md",
    "CHANGES.md",
    "VERSION",
    "bun.lock",
    "bunfig.toml",
    "plugins/package.json",
    "plugins/bun.lock",
    "plugins/pstack-extra/skill.md",
    "docs/plugins/pstack/skill.md",
    "docs/package.json",
    "tests/pi/package.json",
  ])("%s is repo-only", (path) => {
    expect(isShipped(path)).toBe(false);
  });

  test("every file the generator stamps a version into is shipped", () => {
    expect(VERSIONED_MANIFESTS.filter((file) => !isShipped(file))).toEqual([]);
  });
});

describe("comparing VERSION", () => {
  const shipped = "plugins/pstack/skills/tdd/SKILL.md";
  const check = (base, head, changed = [shipped]) => releaseProblems({ changed, base, head });

  test("a change to a shipped file passes when VERSION goes up", () => {
    expect(check("0.9.142", "0.9.143")).toEqual([]);
  });

  test("a change to a shipped file fails when VERSION stays, and names the file and both versions", () => {
    const [problem, ...others] = check("0.9.142", "0.9.142");
    expect(others).toEqual([]);
    expect(problem).toContain(shipped);
    expect(problem).toContain("0.9.142");
  });

  test("a change to a shipped file fails when VERSION goes down", () => {
    expect(check("0.9.142", "0.9.141")).toHaveLength(1);
  });

  test("compares each component as a number", () => {
    expect(check("0.9.9", "0.9.10")).toEqual([]);
    expect(check("0.9.10", "0.9.9")).toHaveLength(1);
    expect(check("0.9.142", "0.10.0")).toEqual([]);
    expect(check("0.10.0", "0.9.142")).toHaveLength(1);
    expect(check("0.99.99", "1.0.0")).toEqual([]);
  });

  test("a change to repo-only files needs no release", () => {
    expect(check("0.9.142", "0.9.142", ["tests/check-release.test.mjs", "docs/reference.md", "CHANGES.md", "VERSION"])).toEqual([]);
    expect(check("0.9.142", "0.9.142", [])).toEqual([]);
  });

  test("names only the shipped files of a mixed change", () => {
    const [problem] = check("0.9.142", "0.9.142", ["docs/reference.md", shipped, "tests/a.test.mjs", "package.json"]);
    expect(problem).toContain(shipped);
    expect(problem).toContain("package.json");
    expect(problem).not.toContain("docs/reference.md");
    expect(problem).not.toContain("tests/a.test.mjs");
  });

  test("lists twenty files and counts the rest", () => {
    const many = Array.from({ length: 25 }, (_, i) => `plugins/pstack/skills/s${i}/SKILL.md`);
    const [problem] = check("0.9.142", "0.9.142", many);
    expect(problem).toContain("plugins/pstack/skills/s19/SKILL.md");
    expect(problem).not.toContain("plugins/pstack/skills/s20/SKILL.md");
    expect(problem).toContain("and 5 more");
  });

  test("reports a VERSION that is not MAJOR.MINOR.PATCH instead of throwing", () => {
    expect(check("0.9.142", "0.9")).toEqual([expect.stringContaining('head must read MAJOR.MINOR.PATCH, got "0.9"')]);
    expect(check("v1", "0.9.142")).toEqual([expect.stringContaining('base must read MAJOR.MINOR.PATCH, got "v1"')]);
  });

  test.each([
    ["0.9.142", [0, 9, 142]],
    ["0.10.0", [0, 10, 0]],
    ["0.9", null],
    ["0.9.1-rc1", null],
    ["", null],
  ])("parses %p", (text, parsed) => {
    expect(parseVersion(text)).toEqual(parsed);
  });
});

describe("the command on a git history", () => {
  const roots = [];
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  const git = (cwd, ...args) => {
    const result = spawnSync("git", args, { cwd, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    return result.stdout.trim();
  };

  // A repository on main at VERSION 0.9.1 with one shipped and one repo-only
  // file, and a branch `change` that `edit` has changed and committed.
  function branch(edit) {
    const root = mkdtempSync(join(tmpdir(), "pstack-check-release-"));
    roots.push(root);
    git(root, "init", "-b", "main");
    git(root, "config", "user.email", "fixture@example.invalid");
    git(root, "config", "user.name", "Fixture");
    const write = (file, text) => {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), text);
    };
    const commit = (message) => {
      git(root, "add", "--all");
      git(root, "commit", "-m", message);
    };
    write("VERSION", "0.9.1\n");
    write("plugins/pstack/skill.md", "one\n");
    write("docs/guide.md", "one\n");
    commit("base");
    git(root, "checkout", "-b", "change");
    edit({ root, write, commit, git: (...args) => git(root, ...args) });
    return root;
  }

  const run = (root, ...args) => {
    const result = spawnSync(process.execPath, [tool, ...args], { cwd: root, encoding: "utf8" });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  };

  test("passes a change to repo-only files and says no release is needed", () => {
    const root = branch(({ write, commit }) => {
      write("docs/guide.md", "two\n");
      commit("docs");
    });
    const { status, stdout } = run(root, "main");
    expect({ status, stdout: stdout.includes("needs no release") }).toEqual({ status: 0, stdout: true });
  });

  test("fails a shipped change that keeps VERSION, naming the file and the release command", () => {
    const root = branch(({ write, commit }) => {
      write("plugins/pstack/skill.md", "two\n");
      write("docs/guide.md", "two\n");
      commit("skill");
    });
    const { status, stderr } = run(root, "main");
    expect(status).toBe(1);
    expect(stderr).toContain("plugins/pstack/skill.md");
    expect(stderr).not.toContain("docs/guide.md");
    expect(stderr).toContain("installs by version number");
    expect(stderr).toContain('bun tools/release.mjs --title "');
  });

  test("passes a shipped change that raises VERSION", () => {
    const root = branch(({ write, commit }) => {
      write("plugins/pstack/skill.md", "two\n");
      write("VERSION", "0.9.2\n");
      commit("release");
    });
    const { status, stdout } = run(root, "main");
    expect({ status, stdout: stdout.includes("0.9.1 to 0.9.2") }).toEqual({ status: 0, stdout: true });
  });

  test("reads VERSION at HEAD, so an uncommitted bump does not count", () => {
    const root = branch(({ write, commit }) => {
      write("plugins/pstack/skill.md", "two\n");
      commit("skill");
      write("VERSION", "0.9.2\n");
    });
    expect(run(root, "main").status).toBe(1);
  });

  test("counts only what the branch changed when main has moved on", () => {
    const root = branch(({ write, commit, git }) => {
      write("docs/guide.md", "two\n");
      commit("docs");
      git("checkout", "main");
      write("plugins/pstack/skill.md", "released on main\n");
      write("VERSION", "0.9.2\n");
      commit("release");
      git("checkout", "change");
    });
    expect(run(root, "main").status).toBe(0);
  });

  test("counts a file moved out of the plugin, which no longer reaches an install", () => {
    const root = branch(({ root, commit }) => {
      renameSync(join(root, "plugins/pstack/skill.md"), join(root, "docs/skill.md"));
      commit("move");
    });
    const { status, stderr } = run(root, "main");
    expect(status).toBe(1);
    expect(stderr).toContain("plugins/pstack/skill.md");
  });

  test("names a file whose path git would quote", () => {
    const root = branch(({ write, commit }) => {
      write("plugins/pstack/skills/déjà vu/SKILL.md", "new\n");
      commit("unicode");
    });
    expect(run(root, "main").stderr).toContain("plugins/pstack/skills/déjà vu/SKILL.md");
  });

  test("exits 2 when the base does not exist or the arguments are wrong", () => {
    const root = branch(({ write, commit }) => {
      write("docs/guide.md", "two\n");
      commit("docs");
    });
    expect(run(root, "no-such-ref").status).toBe(2);
    expect(run(root).status).toBe(2);
    expect(run(root, "--output=oops").status).toBe(2);
    expect(run(root, "main", "extra").status).toBe(2);
  });
});
