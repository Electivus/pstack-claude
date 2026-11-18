#!/usr/bin/env bun
// Fails a change that edits what an installed copy reads without a release.
// Plugin auto-update installs by version number (CONTRIBUTING, Releasing), so
// such a change reaches nobody until VERSION goes up.
//
//   bun tools/check-release.mjs <base-ref>
//
// Compares the committed HEAD with <base-ref>: the files changed since their
// merge base, and VERSION on each side. Exits 0 when the change needs no
// release or carries one, 1 when it needs one, and 2 when it cannot compare.

import { spawnSync } from "node:child_process";

import { isMain, PLUGIN } from "./plugin.mjs";

// Every path whose bytes an install carries or reads. A trailing slash names a
// directory, and anything else names one file. Tests, docs, CI, tools, the
// lockfiles, the Pi test copy under plugins/, CHANGES.md, and VERSION itself
// are repo-only, so they are absent. tests/check-release.test.mjs fails when a
// file the generator stamps a version into is missing here.
export const SHIPPED = [
  // Claude Code copies this directory whole into its plugin cache, vendored
  // tests included. The other runtimes resolve skills, hooks, agents, and
  // extensions from paths inside it.
  `${PLUGIN}/`,
  // The Claude Code marketplace catalog. Its plugin entry carries the version
  // the updater compares.
  ".claude-plugin/marketplace.json",
  // The Codex marketplace catalog.
  ".agents/plugins/marketplace.json",
  // The Pi and OpenCode package manifest, read when the repository installs as
  // a Git package.
  "package.json",
  // The Kimi plugin manifest.
  "kimi.plugin.json",
];

export const isShipped = (path) => SHIPPED.some((entry) => (entry.endsWith("/") ? path.startsWith(entry) : path === entry));

// [major, minor, patch] as numbers, or null when the text is not
// MAJOR.MINOR.PATCH. Numbers, because 0.9.10 is above 0.9.9 and comparing the
// strings says the reverse.
export function parseVersion(text) {
  return /^(\d+)\.(\d+)\.(\d+)$/.exec(text)?.slice(1).map(Number) ?? null;
}

const LISTED = 20;

function listed(paths) {
  const more = paths.length - LISTED;
  return [...paths.slice(0, LISTED).map((path) => `  ${path}`), ...(more > 0 ? [`  ... and ${more} more`] : [])].join("\n");
}

// What is wrong with a change that edited `changed` paths while VERSION went
// from `base` to `head`. Empty when it needs no release or carries one.
export function releaseProblems({ changed, base, head }) {
  const shipped = changed.filter(isShipped);
  if (!shipped.length) return [];
  const [from, to] = [parseVersion(base), parseVersion(head)];
  const malformed = [
    ["base", base, from],
    ["head", head, to],
  ].filter(([, , parsed]) => !parsed);
  if (malformed.length) return malformed.map(([side, text]) => `VERSION on the ${side} must read MAJOR.MINOR.PATCH, got "${text}"`);
  const raised = to[0] - from[0] || to[1] - from[1] || to[2] - from[2];
  if (raised > 0) return [];
  return [`This change edits files an installed copy reads, but VERSION did not go up (${base} on the base, ${head} here):\n${listed(shipped)}`];
}

const FIX = `Plugin auto-update installs by version number, so this change would reach no installed copy until VERSION goes up. Release it in this PR with

  bun tools/release.mjs --title "<what changed, in a few words>" --body-file <file holding the CHANGES.md paragraph>

then commit VERSION, CHANGES.md, and the manifests it stamps. Add --bump minor or --bump major for a larger step. See CONTRIBUTING.md, Releasing.`;

function git(...args) {
  const result = spawnSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed${result.error ? `: ${result.error.message}` : `\n${result.stderr.trim()}`}`);
  }
  return result.stdout;
}

function main(args) {
  const [base, ...extra] = args;
  if (!base || base.startsWith("-") || extra.length) {
    console.error("usage: bun tools/check-release.mjs <base-ref>");
    process.exit(2);
  }
  // No rename detection, so moving a file out of an installed directory lists
  // its old path.
  const changed = git("diff", "--name-only", "--no-renames", "-z", `${base}...HEAD`, "--").split("\0").filter(Boolean);
  const versions = { base: git("show", `${base}:VERSION`).trim(), head: git("show", "HEAD:VERSION").trim() };
  const problems = releaseProblems({ changed, ...versions });
  if (problems.length) {
    for (const problem of problems) console.error(`FAIL: ${problem}`);
    console.error(`\n${FIX}`);
    process.exit(1);
  }
  const shipped = changed.filter(isShipped).length;
  console.log(
    shipped
      ? `ok: ${shipped} file(s) an installed copy reads changed, and VERSION went from ${versions.base} to ${versions.head}`
      : "ok: no file an installed copy reads changed, so this change needs no release",
  );
}

if (isMain(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    console.error(`FAIL: ${err.message}`);
    process.exit(2);
  }
}
