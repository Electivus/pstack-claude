#!/usr/bin/env node
// Append a well-formed row to a show-me-your-work decision log (TSV).
// Usage: node log.mjs <logfile> <phase> <decision> <why> <evidence> <result>
import { closeSync, fstatSync, mkdirSync, openSync, writeSync } from "node:fs";
import { dirname } from "node:path";

const USAGE = "usage: log.mjs <logfile> <phase> <decision> <why> <evidence> <result>";
const HEADER = "ts\tphase\tdecision\twhy\tevidence\tresult\n";

// Strip tabs, LF, and CR so a cell stays on one line, and prefix any cell a
// spreadsheet would parse as a formula (= + - @) or a TSV reader as an opening
// field quote (") with a single quote. The skill expects this log to be read in
// spreadsheets, so attacker-controlled evidence (PR titles, filenames,
// generated text) must not become formula execution when a reviewer opens it.
function clean(cell) {
  const flat = cell.replace(/[\t\n\r]/g, " ");
  return /^[=+\-@"]/.test(flat) ? `'${flat}` : flat;
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.length !== 6) fail(USAGE);
const [logfile, ...cells] = args;

const ts = new Date().toISOString().replace(/\.\d+Z$/, "Z");
const row = Buffer.from(`${[ts, ...cells.map(clean)].join("\t")}\n`, "utf8");

try {
  mkdirSync(dirname(logfile), { recursive: true });
  // Append only, never truncate. Creating the file exclusively lets exactly
  // one of several first writers add the header. An existing empty file also
  // gets one, and a network mount that misreports the size of a log that
  // exists costs one stray header line, not the rows.
  let fd;
  let fresh = false;
  try {
    fd = openSync(logfile, "ax");
    fresh = true;
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    fd = openSync(logfile, "a");
  }
  const prefix = fresh || fstatSync(fd).size === 0 ? Buffer.from(HEADER) : Buffer.alloc(0);
  // One write call, header included, so parallel writers cannot interleave a
  // row longer than a stdio buffer or land a row ahead of the header. Node
  // ignores SIGXFSZ, so a file-size limit surfaces here as a short write or
  // EFBIG.
  const written = writeSync(fd, Buffer.concat([prefix, row]));
  closeSync(fd);
  const appended = Math.max(0, written - prefix.length);
  if (appended !== row.length) {
    fail(`log.mjs: short write, appended ${appended} of ${row.length} bytes of the row`);
  }
} catch (error) {
  fail(`log.mjs: ${error.message}`);
}
