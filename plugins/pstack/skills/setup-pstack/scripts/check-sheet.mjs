#!/usr/bin/env node
// Checks a pstack model sheet: every role has a line, every entry is
// inherit-parent, auto, or a model ID with an optional effort, and each panel
// names models from two vendors unless the sheet has `panel vendors: any`.
// Prints `sheet ok`, or `sheet invalid: <problems>` and exits 1.
// Usage: node check-sheet.mjs [sheet]
// The default sheet is GitHub Copilot's, so setup-pstack can run this without
// naming a path outside the workspace.
import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { decodeSheet, parseSheet } from "./sheet.mjs";

const sheet = process.argv[2] || join(process.env.COPILOT_HOME || join(homedir(), ".copilot"), "pstack-models.md");

function invalid(problems) {
  process.stdout.write(`sheet invalid: ${problems}\n`);
  process.exit(1);
}

let bytes;
try {
  if (!statSync(sheet).isFile()) invalid(`cannot read ${sheet}`);
  bytes = readFileSync(sheet);
} catch {
  invalid(`cannot read ${sheet}`);
}
const lines = decodeSheet(bytes);
if (lines === null) invalid(`cannot decode ${sheet}`);
const { problems } = parseSheet(lines);
if (problems.length) invalid(problems.join("; "));
process.stdout.write("sheet ok\n");
