import { expect, test } from "bun:test";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const logScript = fileURLToPath(new URL("../plugins/pstack/skills/show-me-your-work/scripts/log.mjs", import.meta.url));

// A spreadsheet runs a leading = + - @ as a formula, and a quote-aware TSV
// reader unwraps a leading " (or runs an unterminated one into later rows).
test("cells a spreadsheet or TSV reader would reinterpret are written with a leading quote", () => {
  const dir = mkdtempSync(join(tmpdir(), "pstack-log-"));
  try {
    const log = join(dir, "log.tsv");
    const risky = ['"=HYPERLINK(""http://x"")"', '"unterminated', "=1+1", "+1", "-1", "@SUM(A1)"];
    for (const cell of [...risky, "plain"]) {
      execFileSync("node", [logScript, log, "phase", cell, "why", "evidence", "result"]);
    }
    const rows = readFileSync(log, "utf8").trimEnd().split("\n").slice(1).map((line) => line.split("\t"));
    expect(rows.map((row) => row[2])).toEqual([...risky.map((cell) => `'${cell}`), "plain"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cells holding % and backslash sequences are written as given", () => {
  const dir = mkdtempSync(join(tmpdir(), "pstack-log-"));
  try {
    const log = join(dir, "log.tsv");
    const cells = ["100%", "%s %d %n %%", "\\n \\t \\\\ \\0", "why", "result"];
    execFileSync("node", [logScript, log, ...cells]);
    const rows = readFileSync(log, "utf8").trimEnd().split("\n").slice(1).map((line) => line.split("\t"));
    expect(rows.map((row) => row.slice(1))).toEqual([cells]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// A shell printf on Linux writes 4 KiB at a time. Before the single write, 20 KB
// rows interleaved there in 12 of 20 runs and 400 KB rows in 100 of 100.
test("40 concurrent writers with 400 KB rows leave every row intact", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pstack-log-"));
  try {
    const log = join(dir, "log.tsv");
    const manyStdioBuffers = "x".repeat(100_000);
    const writers = Array.from({ length: 40 }, (_, i) =>
      spawn("node", [logScript, log, `p${i}`, ...Array(4).fill(manyStdioBuffers)], { stdio: "inherit" }),
    );
    const exits = await Promise.all(writers.map((writer) => once(writer, "exit")));
    expect(exits.map(([code]) => code)).toEqual(Array(40).fill(0));
    const rows = readFileSync(log, "utf8")
      .trimEnd()
      .split("\n")
      .map((line) => line.split("\t"))
      .filter((row) => row[0] !== "ts");
    expect(rows.filter((row) => row.length === 6 && row.slice(2).every((cell) => cell === manyStdioBuffers)).length).toBe(40);
    expect(rows.length).toBe(40);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a row with non-ASCII cells is appended byte for byte", () => {
  const dir = mkdtempSync(join(tmpdir(), "pstack-log-"));
  try {
    const log = join(dir, "log.tsv");
    const cells = ["phase", "naïve ✓", "why", "日本語", "result"];
    execFileSync("node", [logScript, log, ...cells]);
    const rows = readFileSync(log, "utf8").trimEnd().split("\n").slice(1).map((line) => line.split("\t"));
    expect(rows.map((row) => row.slice(1))).toEqual([cells]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a 200 KB row is appended, though Linux caps one argument at 128 KiB", () => {
  const dir = mkdtempSync(join(tmpdir(), "pstack-log-"));
  try {
    const log = join(dir, "log.tsv");
    const underTheCap = "x".repeat(100_000);
    execFileSync("node", [logScript, log, "phase", "decision", "why", underTheCap, underTheCap]);
    const rows = readFileSync(log, "utf8").trimEnd().split("\n").slice(1).map((line) => line.split("\t"));
    expect(rows.map((row) => row.slice(1))).toEqual([["phase", "decision", "why", underTheCap, underTheCap]]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the log's parent directory is created, one header is written, and rows append", () => {
  const dir = mkdtempSync(join(tmpdir(), "pstack-log-"));
  try {
    const log = join(dir, "missing", "nested", "log.tsv");
    execFileSync("node", [logScript, log, "a", "b", "c", "d", "e"]);
    execFileSync("node", [logScript, log, "f", "g\th\ni\rj", "k", "l", "m"]);
    const lines = readFileSync(log, "utf8").split("\n");
    expect(lines.pop()).toBe("");
    expect(lines[0]).toBe("ts\tphase\tdecision\twhy\tevidence\tresult");
    expect(lines.slice(1).map((line) => line.split("\t").slice(1))).toEqual([
      ["a", "b", "c", "d", "e"],
      ["f", "g h i j", "k", "l", "m"],
    ]);
    expect(lines[1].split("\t")[0]).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an existing empty log gets the header, and a log with rows keeps its content", () => {
  const dir = mkdtempSync(join(tmpdir(), "pstack-log-"));
  try {
    const empty = join(dir, "empty.tsv");
    writeFileSync(empty, "");
    execFileSync("node", [logScript, empty, "a", "b", "c", "d", "e"]);
    expect(readFileSync(empty, "utf8").startsWith("ts\tphase\t")).toBe(true);
    const kept = join(dir, "kept.tsv");
    writeFileSync(kept, "earlier content\n");
    execFileSync("node", [logScript, kept, "a", "b", "c", "d", "e"]);
    expect(readFileSync(kept, "utf8")).toMatch(/^earlier content\n[^\n]*\n$/);
    expect(readFileSync(kept, "utf8")).not.toContain("ts\tphase");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a wrong argument count prints the usage and writes nothing", () => {
  const dir = mkdtempSync(join(tmpdir(), "pstack-log-"));
  try {
    const log = join(dir, "log.tsv");
    for (const args of [[], [log, "a", "b", "c", "d"], [log, "a", "b", "c", "d", "e", "f"]]) {
      const { status, stderr } = spawnSync("node", [logScript, ...args], { encoding: "utf8" });
      expect({ status, stderr }).toEqual({ status: 1, stderr: "usage: log.mjs <logfile> <phase> <decision> <why> <evidence> <result>\n" });
    }
    expect(existsSync(log)).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a short write fails and says how many bytes of the row were appended", () => {
  const dir = mkdtempSync(join(tmpdir(), "pstack-log-"));
  try {
    const pastTheCap = "y".repeat(3000);
    const { status, stderr } = spawnSync(
      "bash",
      ["-c", 'ulimit -f 1 && exec node "$@"', "bash", logScript, join(dir, "log.tsv"), "phase", "decision", "why", pastTheCap, "result"],
      { encoding: "utf8" },
    );
    expect(stderr).toMatch(/^log\.mjs: short write, appended \d+ of 30\d\d bytes of the row\n$/);
    expect(status).not.toBe(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
