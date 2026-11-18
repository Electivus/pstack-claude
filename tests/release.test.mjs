// The release script: the version it writes, where the CHANGES.md entry goes,
// the manifests it stamps, what it refuses, and the command's exit codes. Each
// run that reaches the generator works in a copy of the repository.
import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

import { nextVersion, release } from "../tools/release.mjs";
import { VERSIONED_MANIFESTS } from "../tools/generate.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const body = "The release script writes the entry.\nIt also stamps the manifests.";

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function scratch() {
  const root = mkdtempSync(join(tmpdir(), "pstack-release-"));
  roots.push(root);
  return root;
}

// The tracked tree without git state or installed packages. The generator
// imports typebox, which the root's node_modules provides through a link.
function copy() {
  const root = scratch();
  cpSync(repoRoot, root, { recursive: true, filter: (src) => ![".git", "node_modules"].includes(basename(src)) });
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"));
  return root;
}

// A tree with only the two files a refusal reads.
function minimal(changelog = "# CHANGES\n\nPreamble.\n\n## 0.9.142 - old title\n\nOld body.\n") {
  const root = scratch();
  writeFileSync(join(root, "VERSION"), "0.9.142\n");
  writeFileSync(join(root, "CHANGES.md"), changelog);
  return root;
}

const read = (root, file) => readFileSync(join(root, file), "utf8");
const patchAbove = (version) => version.replace(/\d+$/, (patch) => String(Number(patch) + 1));

describe("the next version", () => {
  test.each([
    ["0.9.142", "patch", "0.9.143"],
    ["0.9.9", "patch", "0.9.10"],
    ["0.9.142", "minor", "0.10.0"],
    ["0.9.142", "major", "1.0.0"],
    ["1.9.9", "major", "2.0.0"],
  ])("%s with a %s bump is %s", (version, bump, expected) => {
    expect(nextVersion(version, bump)).toBe(expected);
  });

  test("refuses a bump or a VERSION it cannot read", () => {
    expect(() => nextVersion("0.9.142", "huge")).toThrow('--bump must be patch, minor, or major, got "huge"');
    expect(() => nextVersion("0.9", "patch")).toThrow("MAJOR.MINOR.PATCH");
  });
});

describe("a release", () => {
  test("writes VERSION, puts the entry above the newest one, and leaves a tree the generator accepts", () => {
    const root = copy();
    const before = read(root, "VERSION").trim();
    const changelog = read(root, "CHANGES.md");
    const oldNewest = changelog.split("\n").find((line) => line.startsWith(`## ${before} `));
    const expected = patchAbove(before);

    const { version } = release(root, { title: "  a new title ", body: `\n${body}\n\n` });

    expect(version).toBe(expected);
    expect(read(root, "VERSION")).toBe(`${expected}\n`);
    expect(read(root, "CHANGES.md")).toBe(
      changelog.replace(`${oldNewest}\n`, () => `## ${expected} - a new title\n\n${body}\n\n${oldNewest}\n`),
    );
    for (const file of VERSIONED_MANIFESTS) {
      expect(read(root, file).match(/"version"\s*:\s*"([^"]*)"/)[1], file).toBe(expected);
    }
    const check = spawnSync(process.execPath, ["tools/generate.mjs", "--check"], { cwd: root, encoding: "utf8" });
    expect({ status: check.status, stderr: check.stderr }).toEqual({ status: 0, stderr: "" });
  });

  test.each([
    ["minor", (v) => v.replace(/^(\d+)\.(\d+)\.\d+$/, (_, major, minor) => `${major}.${Number(minor) + 1}.0`)],
    ["major", (v) => `${Number(v.split(".")[0]) + 1}.0.0`],
  ])("a %s bump resets the lower components", (bump, expectedFrom) => {
    const root = copy();
    const expected = expectedFrom(read(root, "VERSION").trim());
    release(root, { title: "t", body, bump });
    expect(read(root, "VERSION")).toBe(`${expected}\n`);
  });

  test.each([
    ["a missing title", { body }, "--title"],
    ["an empty title", { title: "", body }, "--title"],
    ["a blank title", { title: "  \t ", body }, "--title"],
    ["a title over two lines", { title: "one\ntwo", body }, "--title"],
    ["a missing body", { title: "t" }, "--body-file"],
    ["an empty body", { title: "t", body: "" }, "--body-file"],
    ["a blank body", { title: "t", body: " \n\n" }, "--body-file"],
    ["an unknown bump", { title: "t", body, bump: "huge" }, "--bump"],
  ])("refuses %s and writes nothing", (_, args, flag) => {
    const root = minimal();
    expect(() => release(root, args)).toThrow(flag);
    expect(read(root, "VERSION")).toBe("0.9.142\n");
    expect(read(root, "CHANGES.md")).toBe("# CHANGES\n\nPreamble.\n\n## 0.9.142 - old title\n\nOld body.\n");
  });

  test("refuses a version that CHANGES.md already heads, and writes nothing", () => {
    const changelog = "# CHANGES\n\n## 0.9.142 - old title\n\nOld body.\n\n## 0.9.143 - written ahead\n\nAhead.\n";
    const root = minimal(changelog);
    expect(() => release(root, { title: "t", body })).toThrow("already has a heading for 0.9.143");
    expect(read(root, "VERSION")).toBe("0.9.142\n");
    expect(read(root, "CHANGES.md")).toBe(changelog);
  });

  test("refuses a body that would break the changelog, and writes nothing", () => {
    const root = minimal();
    expect(() => release(root, { title: "t", body: "one\n\n## 0.9.1 no title dash\n\ntwo" })).toThrow("CHANGES.md");
    expect(read(root, "VERSION")).toBe("0.9.142\n");
  });

  test("says how to undo the release when the generator fails", () => {
    const root = minimal();
    expect(() => release(root, { title: "t", body })).toThrow("git restore VERSION CHANGES.md");
    expect(read(root, "VERSION")).toBe("0.9.143\n");
  });
});

describe("the command", () => {
  const run = (root, ...args) => {
    const result = spawnSync(process.execPath, ["tools/release.mjs", ...args], { cwd: root, encoding: "utf8" });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  };

  test("releases from a body file and says what to commit", () => {
    const root = copy();
    writeFileSync(join(root, "body.txt"), `${body}\n`);
    const expected = patchAbove(read(root, "VERSION").trim());
    const { status, stdout } = run(root, "--title", "From the command", "--body-file", "body.txt");
    expect(status).toBe(0);
    expect(stdout).toContain(`Released ${expected}`);
    expect(stdout).toContain("write: .claude-plugin/marketplace.json");
    expect(read(root, "VERSION")).toBe(`${expected}\n`);
    expect(read(root, "CHANGES.md")).toContain(`## ${expected} - From the command\n\n${body}\n`);
  });

  test.each([
    ["no title", ["--body-file", "body.txt"]],
    ["no body file", ["--title", "t"]],
    ["an unknown flag", ["--title", "t", "--body-file", "body.txt", "--force"]],
    ["no arguments", []],
  ])("exits 2 with the usage for %s", (_, args) => {
    const root = copy();
    writeFileSync(join(root, "body.txt"), body);
    const { status, stderr } = run(root, ...args);
    expect(status).toBe(2);
    expect(stderr).toContain('usage: bun tools/release.mjs --title "<title>" --body-file <file>');
    expect(read(root, "VERSION")).toBe(readFileSync(join(repoRoot, "VERSION"), "utf8"));
  });

  test.each([
    ["an empty body file", "", "--body-file"],
    ["a body file that does not exist", null, "no-such-file.txt"],
  ])("exits 1 for %s and writes nothing", (_, text, named) => {
    const root = copy();
    if (text !== null) writeFileSync(join(root, "body.txt"), text);
    const { status, stderr } = run(root, "--title", "t", "--body-file", text === null ? "no-such-file.txt" : "body.txt");
    expect(status).toBe(1);
    expect(stderr).toContain(named);
    expect(read(root, "VERSION")).toBe(readFileSync(join(repoRoot, "VERSION"), "utf8"));
  });
});
