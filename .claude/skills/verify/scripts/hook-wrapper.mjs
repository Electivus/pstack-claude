#!/usr/bin/env node
// Usage: node hook-wrapper.mjs <log.jsonl> <base64 of the original hook command> [powershell]
import { appendFileSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const [log, encoded, shell] = process.argv.slice(2);
const command = Buffer.from(encoded, "base64").toString("utf8");
let stdin = "";
try {
  stdin = readFileSync(0, "utf8");
} catch {}

const options = { input: stdin, encoding: "utf8" };
const run = shell === "powershell" ? spawnSync("powershell", ["-NoProfile", "-Command", command], options) : spawnSync(command, { ...options, shell: true });
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
