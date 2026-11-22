// Reads and checks a pstack model sheet. Shared by check-sheet.mjs, which
// setup-pstack runs after it writes a GitHub Copilot sheet, by the session
// hook, and by the Copilot PreToolUse hook. It lives under skills/ so a
// skills-only install still has check-sheet.mjs's dependency.
import { readFileSync, statSync } from "node:fs";

// Stamped from plugins/pstack/models.json; edit there and rerun tools/generate.mjs.
export const ROLES = ["feature, refactoring", "bug-fix", "perf-issue", "hillclimb", "judgment and prose", "strongest judgment", "arena runners", "arena cross-judge pool", "swarm workers", "interrogate reviewers", "thermos reviewers", "no-comments reviewer"];
const PANELS = new Set(["arena runners", "arena cross-judge pool", "interrogate reviewers"]);
const EFFORTS = new Set(["low", "medium", "high", "xhigh", "max"]);
// End of the stamped lists.

const ALIASES = new Set(["inherit-parent", "auto"]);
const UTF8_BOM = "\xef\xbb\xbf";

// The sheet is UTF-8, or UTF-16 LE behind its byte-order mark, which Windows
// PowerShell 5.1's `>` writes. Lines are kept as byte strings (one char per
// byte), so a sheet that is not valid UTF-8 compares the way the bytes do. One
// leading byte-order mark is dropped, lines end at LF, and one CR before the
// LF is dropped. Returns null for UTF-16 with an odd byte count or an unpaired
// surrogate, which counts as no sheet.
export function decodeSheet(bytes) {
  let text;
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    try {
      const utf16 = new TextDecoder("utf-16le", { fatal: true, ignoreBOM: true }).decode(bytes);
      text = Buffer.from(utf16, "utf8").toString("latin1");
    } catch {
      return null;
    }
  } else {
    text = bytes.toString("latin1");
  }
  if (text.startsWith(UTF8_BOM)) text = text.slice(UTF8_BOM.length);
  return text.split("\n").map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line));
}

// The sheet's lines, or null when it is missing, not a regular file,
// unreadable, or not decodable: each leaves the session hook on.
export function readSheet(path) {
  try {
    if (!statSync(path).isFile()) return null;
    return decodeSheet(readFileSync(path));
  } catch {
    return null;
  }
}

export const sessionHookOff = (lines) => lines !== null && lines.includes("session hook: off");

const trim = (s) => s.replace(/^[ \t]+|[ \t]+$/g, "");

// The label before the colon of a `label: value` line, or "" for any other line.
function labelOf(line) {
  const colon = line.indexOf(":");
  return colon > 0 && !/^[ \t]/.test(line) ? trim(line.slice(0, colon)) : "";
}

// Drops a role value's reasoning effort suffix, as in `gpt-5.5 @xhigh`.
function modelOf(entry) {
  const effort = /[ \t]+@([a-z]+)$/.exec(entry);
  return effort && EFFORTS.has(effort[1]) ? entry.slice(0, effort.index) : entry;
}

const vendorOf = (id) => id.replace(/-.*/, "");

// Parses a decoded sheet. `values` maps each known role, and `default effort`,
// to its last line's value. `problems` lists what is wrong in a fixed wording
// that quotes no unchecked sheet text, since hooks add it to the session
// context: a missing role, an entry that is not inherit-parent, auto, or a
// model ID with an optional effort, a default effort that is not session or a
// level, or a panel with models from fewer than two vendors without a
// `panel vendors: any` line. `usable` holds each role whose line has only good
// entries, and `effortOk` says whether a good default effort line exists, for
// readers that keep a sheet's good lines and drop the rest. `models` is every
// entry's model or alias, `explicit` the model IDs in first-seen order, and
// `aliases` whether any role inherits its model.
export function parseSheet(lines) {
  const values = new Map();
  let anyVendor = false;
  for (const line of lines) {
    const label = labelOf(line);
    if (ROLES.includes(label) || label === "default effort") values.set(label, trim(line.slice(line.indexOf(":") + 1)));
    else if (label === "panel vendors" && trim(line.slice(line.indexOf(":") + 1)) === "any") anyVendor = true;
  }
  const problems = ROLES.filter((role) => !values.has(role)).map((role) => `missing role \`${role}\``);
  const effort = values.get("default effort");
  const effortOk = effort !== undefined && (effort === "session" || EFFORTS.has(effort));
  if (effort !== undefined && !effortOk) problems.push("default effort is not session or a level");
  const usable = new Set();
  const models = new Set();
  const explicit = [];
  let aliases = false;
  for (const role of ROLES) {
    if (!values.has(role)) continue;
    const value = values.get(role);
    if (value === "") {
      problems.push(`no model in \`${role}\``);
      continue;
    }
    const vendors = [];
    let real = false;
    let good = true;
    for (const raw of value.split(",")) {
      const entry = modelOf(trim(raw));
      if (entry === "") {
        problems.push(`an empty entry in \`${role}\``);
        good = false;
      } else if (ALIASES.has(entry)) {
        aliases = true;
        models.add(entry);
      } else if (!/^[a-z0-9][a-z0-9.-]*$/.test(entry)) {
        problems.push(`\`${role}\` has an entry that is not a model ID`);
        good = false;
      } else {
        if (!models.has(entry)) explicit.push(entry);
        models.add(entry);
        real = true;
        if (!vendors.includes(vendorOf(entry))) vendors.push(vendorOf(entry));
      }
    }
    if (good) usable.add(role);
    if (PANELS.has(role) && real && vendors.length < 2 && !anyVendor) {
      problems.push(`\`${role}\` has models from one vendor (${vendors.join(", ")})`);
    }
  }
  return { values, problems, usable, effortOk, models, explicit, aliases };
}
