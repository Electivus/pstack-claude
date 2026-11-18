#!/usr/bin/env bun
// Cuts a release in one command.
//
//   bun tools/release.mjs --title "<title>" --body-file <file> [--bump patch|minor|major]
//
// Raises VERSION, adds "## <version> - <title>" and the body above the newest
// entry in CHANGES.md, and runs the generator so every manifest carries the new
// version. The body is the entry's prose, one paragraph on what changed and
// why. The command refuses before it writes anything when the title or body is
// empty, the bump is unknown, or CHANGES.md already has a heading for the new
// version. Commit what it changed.

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { parseVersion } from "./check-release.mjs";
import { assertChangesHeading } from "./generate.mjs";
import { isMain } from "./plugin.mjs";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");

const BUMPS = {
  major: ([major]) => [major + 1, 0, 0],
  minor: ([major, minor]) => [major, minor + 1, 0],
  patch: ([major, minor, patch]) => [major, minor, patch + 1],
};

export function nextVersion(version, bump) {
  const parsed = parseVersion(version);
  if (!parsed) throw new Error(`VERSION must read MAJOR.MINOR.PATCH, got "${version}"`);
  if (!Object.hasOwn(BUMPS, bump)) throw new Error(`--bump must be patch, minor, or major, got "${bump}"`);
  return BUMPS[bump](parsed).join(".");
}

// The changelog with the new entry above the newest one. The generator's own
// heading check validates the result, so an entry it would reject never reaches
// the file.
export function withEntry(changelog, version, title, body) {
  const lines = changelog.split("\n");
  if (lines.some((line) => line === `## ${version}` || line.startsWith(`## ${version} `))) {
    throw new Error(`CHANGES.md already has a heading for ${version}`);
  }
  const newest = lines.findIndex((line) => /^## \d+\.\d+\.\d+ /.test(line));
  if (newest === -1) throw new Error("CHANGES.md has no release entry to add the new one above");
  lines.splice(newest, 0, `## ${version} - ${title}`, "", body, "");
  const updated = lines.join("\n");
  assertChangesHeading(updated, version);
  return updated;
}

export function release(root, { title, body, bump = "patch" }) {
  if (!title?.trim() || /[\r\n]/.test(title.trim())) throw new Error("--title must be one non-empty line");
  if (!body?.trim()) throw new Error("--body-file must hold the CHANGES.md paragraph, and it is empty");
  const versionFile = join(root, "VERSION");
  const changesFile = join(root, "CHANGES.md");
  const version = nextVersion(readFileSync(versionFile, "utf8").trim(), bump);
  const changelog = withEntry(readFileSync(changesFile, "utf8"), version, title.trim(), body.trim().replaceAll("\r\n", "\n"));
  writeFileSync(versionFile, `${version}\n`);
  writeFileSync(changesFile, changelog);
  const generator = spawnSync(process.execPath, [join(root, "tools/generate.mjs")], { cwd: root, encoding: "utf8" });
  if (generator.status !== 0) {
    throw new Error(
      `the generator failed after VERSION and CHANGES.md were written. Fix what it reports and run bun tools/generate.mjs, or run git restore VERSION CHANGES.md to undo the release.\n${generator.stderr.trim()}`,
    );
  }
  return { version, generated: generator.stdout.trim() };
}

function main(args) {
  const usage = 'usage: bun tools/release.mjs --title "<title>" --body-file <file> [--bump patch|minor|major]';
  let values;
  try {
    ({ values } = parseArgs({
      args,
      options: { title: { type: "string" }, "body-file": { type: "string" }, bump: { type: "string", default: "patch" } },
    }));
  } catch (err) {
    console.error(`${err.message}\n${usage}`);
    process.exit(2);
  }
  if (values.title === undefined || values["body-file"] === undefined) {
    console.error(usage);
    process.exit(2);
  }
  const { version, generated } = release(repo, {
    title: values.title,
    body: readFileSync(values["body-file"], "utf8"),
    bump: values.bump,
  });
  console.log(`${generated}\nReleased ${version}. Commit VERSION, CHANGES.md, and the manifests above.`);
}

if (isMain(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    console.error(`FAIL: ${err.message}`);
    process.exit(1);
  }
}
