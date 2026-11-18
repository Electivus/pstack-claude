import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const upstream = ["michael-denyer", "pstack-claude"].join("/");
// Upstream merges bring back upstream's install commands and support links.
// A mention of the upstream repository may stay only to credit it: as link
// text, as a link to the repository itself, or as a numbered issue or PR.
const credit = /^(?:\]|\)|\/(?:issues|pull)\/\d)/;

test("install commands, support links, and manifests name the Electivus fork", () => {
  const files = spawnSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).stdout.split("\0").filter(Boolean);
  expect(files.length).toBeGreaterThan(0);
  const stray = [];
  for (const file of files) {
    if (file === "CHANGES.md") continue;
    readFileSync(join(root, file), "utf8")
      .split("\n")
      .forEach((line, index) => {
        for (const match of line.matchAll(new RegExp(upstream, "g"))) {
          if (!credit.test(line.slice(match.index + upstream.length))) {
            stray.push(`${file}:${index + 1} names ${upstream}; point it at Electivus/pstack-claude`);
          }
        }
      });
  }
  expect(stray).toEqual([]);
});
