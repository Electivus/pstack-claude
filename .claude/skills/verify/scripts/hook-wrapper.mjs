#!/usr/bin/env node
// Usage: node hook-wrapper.mjs <log.jsonl> <base64 of the original hook command>
import { appendFileSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const [log, encoded] = process.argv.slice(2);
const command = Buffer.from(encoded, "base64").toString("utf8");
let stdin = "";
try {
  stdin = readFileSync(0, "utf8");
} catch {}

const run = spawnSync(command, { shell: true, input: stdin, encoding: "utf8" });
const exitCode = run.status ?? 1;

appendFileSync(
  log,
  JSON.stringify({
    ts: new Date().toISOString(),
    command,
    argv: process.argv,
    cwd: process.cwd(),
    env: Object.keys(process.env).sort(),
    pluginRoots: {
      CLAUDE_PLUGIN_ROOT: process.env.CLAUDE_PLUGIN_ROOT ?? null,
      COPILOT_PLUGIN_ROOT: process.env.COPILOT_PLUGIN_ROOT ?? null,
    },
    stdin,
    exitCode,
    signal: run.signal,
    stdout: run.stdout,
    stderr: run.stderr,
    spawnError: run.error?.message ?? null,
  }) + "\n",
);

process.stdout.write(run.stdout ?? "");
process.stderr.write(run.stderr ?? "");
process.exit(exitCode);
