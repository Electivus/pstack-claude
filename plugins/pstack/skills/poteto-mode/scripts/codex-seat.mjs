#!/usr/bin/env node
// Run one pstack seat on the Codex CLI. Port-only, Claude Code only.
// Usage: node codex-seat.mjs '<seat>' --cd <dir> --prompt <file> --out <file> [--write]
import { spawnSync } from "node:child_process";
import { closeSync, existsSync, openSync, rmSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

const seatPattern = /^codex(?:\/([a-z0-9][a-z0-9.-]*))?(?: @(low|medium|high|xhigh|max))?$/;

// The one owner of the Codex seat syntax. Returns null for any other value.
function parseSeat(value) {
  const match = seatPattern.exec(value);
  return match ? { model: match[1] ?? null, effort: match[2] ?? null } : null;
}

function usage(message) {
  console.error(`codex-seat: ${message}`);
  process.exit(2);
}

function main() {
  let parsed;
  try {
    parsed = parseArgs({
      allowPositionals: true,
      options: {
        cd: { type: "string" },
        prompt: { type: "string" },
        out: { type: "string" },
        write: { type: "boolean" },
      },
    });
  } catch (error) {
    usage(error.message);
  }
  const { positionals, values } = parsed;
  if (positionals.length !== 1) usage("expected one seat argument");
  const seat = parseSeat(positionals[0]);
  if (!seat) usage(`not a Codex seat: ${positionals[0]}`);
  for (const flag of ["cd", "prompt", "out"]) if (!values[flag]) usage(`missing --${flag}`);
  if (!existsSync(values.prompt)) usage(`prompt file not found: ${values.prompt}`);
  if (resolve(values.out) === resolve(values.prompt)) usage("--out and --prompt name the same file");

  const args = ["exec", "-s", values.write ? "workspace-write" : "read-only"];
  if (seat.model) args.push("-m", seat.model);
  if (seat.effort) args.push("-c", `model_reasoning_effort="${seat.effort}"`);
  args.push("--skip-git-repo-check", "--color", "never", "-C", values.cd, "-o", values.out, "-");

  // A stale <out> from an earlier run must not pass for this run's answer.
  rmSync(values.out, { force: true });
  const log = `${values.out}.log`;
  const stdin = openSync(values.prompt, "r");
  const logFd = openSync(log, "a");
  const result = spawnSync("codex", args, { stdio: [stdin, logFd, logFd] });
  closeSync(stdin);
  closeSync(logFd);

  if (result.error?.code === "ENOENT") {
    console.error("codex seat unavailable: codex is not on PATH");
    process.exit(127);
  }
  let status = result.status ?? 1;
  if (status === 0 && !(existsSync(values.out) && statSync(values.out).size > 0)) status = 1;
  if (status !== 0) {
    console.error(`codex seat failed: exit ${status}, log ${log}`);
    process.exit(status);
  }
  console.log(`codex seat ok: ${values.out}`);
}

main();
