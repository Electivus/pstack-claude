// Each runtime that cannot run the Claude Code SessionStart hook carries its
// own copy of the routing mandate. The generator stamps the shared block of
// each copy from hooks/session-start-context.md, so a copy cannot drift.
import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

import { plan } from "../tools/generate.mjs";
import { PLUGIN } from "../tools/plugin.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const MANDATE = `${PLUGIN}/hooks/session-start-context.md`;
const COPIES = [
  `${PLUGIN}/hooks/kimi-instructions.md`,
  `${PLUGIN}/hooks/session-start-agy.md`,
  `${PLUGIN}/hooks/session-start-minimax.md`,
  `${PLUGIN}/hooks/session-start-muse.md`,
  `${PLUGIN}/hooks/session-start-opencode.md`,
  `${PLUGIN}/rules/pstack-routing.md`,
];
const BLOCK_OPEN = "when a task meets any of these:";

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function repoCopy() {
  const root = mkdtempSync(join(tmpdir(), "pstack-routing-"));
  roots.push(root);
  cpSync(repoRoot, root, { recursive: true, filter: (src) => ![".git", "node_modules"].includes(basename(src)) });
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"));
  return root;
}

const read = (root, rel) => readFileSync(join(root, rel), "utf8");
const edit = (root, rel, change) => writeFileSync(join(root, rel), change(read(root, rel)));
const planned = (root) => {
  const { files } = plan(root);
  return (rel) => files[rel] ?? read(root, rel);
};

describe("the routing block in each runtime's copy of the mandate", () => {
  test("every hook or rule file that carries the block is a stamped copy", () => {
    const carriers = ["hooks", "rules"].flatMap((dir) =>
      readdirSync(join(repoRoot, PLUGIN, dir))
        .map((name) => `${PLUGIN}/${dir}/${name}`)
        .filter((rel) => rel.endsWith(".md") && read(repoRoot, rel).split("\n").some((line) => line.endsWith(BLOCK_OPEN))),
    );
    expect(carriers.sort()).toEqual([MANDATE, ...COPIES].sort());
  });

  test("a criterion added to the mandate in any form reaches every copy", () => {
    const root = repoCopy();
    const added = "- a change to a security boundary";
    edit(root, MANDATE, (text) => text.replace("- it is a bug", `${added}\n- it is a bug`));
    const after = planned(root);
    for (const copy of COPIES) expect(after(copy).split("\n")).toContain(added);
  });

  test("a copy that drops direct-entry skills gets the mandate's list back in its own naming", () => {
    const root = repoCopy();
    const rule = `${PLUGIN}/rules/pstack-routing.md`;
    const muse = `${PLUGIN}/hooks/session-start-muse.md`;
    edit(root, rule, (text) => text.replace(", `architect`, `how`, `why`, `arena`, `interrogate`", ""));
    edit(root, muse, (text) => text.replace(/, `plugin:pstack:interrogate`/, ""));
    const after = planned(root);
    expect(after(rule)).toBe(read(repoRoot, rule));
    expect(after(muse)).toBe(read(repoRoot, muse));
  });

  test("a changed paragraph in a copy's block is restored from the mandate", () => {
    const root = repoCopy();
    const kimi = `${PLUGIN}/hooks/kimi-instructions.md`;
    edit(root, kimi, (text) => text.replace("It routes to the right pstack skill from there.", "It routes somewhere."));
    expect(planned(root)(kimi)).toBe(read(repoRoot, kimi));
  });

  test("a copy without the block fails the plan and names the file", () => {
    const root = repoCopy();
    const agy = `${PLUGIN}/hooks/session-start-agy.md`;
    edit(root, agy, (text) => text.replace(BLOCK_OPEN, "when a task needs it."));
    expect(() => plan(root)).toThrow(`${agy}: no routing block`);
  });

  test("a copy whose direct-entry line lost its skill list fails the plan and names the file", () => {
    const root = repoCopy();
    const opencode = `${PLUGIN}/hooks/session-start-opencode.md`;
    edit(root, opencode, (text) => text.replace(/^(When the intent is already specific[^`]*).*$/m, "$1the right skill."));
    expect(() => plan(root)).toThrow(`${opencode}: no "When the intent is already specific" line with a skill list`);
  });

  test("a mandate without the block fails the plan and names the mandate", () => {
    const root = repoCopy();
    edit(root, MANDATE, (text) => text.replace(BLOCK_OPEN, "when a task needs it."));
    expect(() => plan(root)).toThrow(`${MANDATE}: no routing block`);
  });
});
