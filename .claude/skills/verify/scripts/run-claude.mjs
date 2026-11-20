#!/usr/bin/env node
// Usage: node run-claude.mjs <probe dir> <prompt> [--model <alias>]
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { model: { type: "string", default: "haiku" } },
});
if (positionals.length !== 2) {
  console.error("usage: run-claude.mjs <probe dir> <prompt> [--model <alias>]");
  process.exit(2);
}
const probe = resolve(positionals[0]);
const workspace = join(probe, "ws");
mkdirSync(workspace, { recursive: true });

const args = [
  "-p",
  "--model",
  values.model,
  "--setting-sources",
  "project,local",
  "--plugin-dir",
  join(probe, "plugin"),
  "--output-format",
  "stream-json",
  "--verbose",
  "--include-hook-events",
  positionals[1],
];
const run = spawnSync(process.env.CLAUDE_CLI ?? "claude", args, { cwd: workspace, encoding: "utf8", timeout: 300_000 });
const stream = join(probe, "claude.jsonl");
writeFileSync(stream, run.stdout ?? "");
writeFileSync(join(probe, "claude.err"), run.stderr ?? "");
console.log(JSON.stringify({ stream, exitCode: run.status, signal: run.signal, error: run.error?.message ?? null }, null, 2));
process.exit(run.status ?? 1);
