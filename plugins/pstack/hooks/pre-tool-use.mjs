// GitHub Copilot's PreToolUse hook. It approves `view` of this plugin's own
// files and the strict form of a registered script run, and it denies a pstack
// agent dispatch on a model the user did not save. Anything else gets no
// output and takes Copilot's normal permission flow.
// Copilot denies the call when this hook fails, so every path exits 0: an
// error goes to stderr and no decision is printed.
import { accessSync, constants, lstatSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";

const ALLOW = { permissionDecision: "allow" };
// The reason keeps tab and carriage return, which JSON escapes, and loses
// every other control character.
const deny = (reason) => ({
  permissionDecision: "deny",
  permissionDecisionReason: reason.replace(/[\x00-\x08\x0a-\x0c\x0e-\x1f\x7f]/g, ""),
});

const control = (s) => /[\x00-\x1f\x7f]/.test(s);
const text = (value) => (typeof value === "string" ? value : "");
const isObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);

// JSON.parse keeps the last of two members with one name. A decision must not
// depend on that, so a payload that repeats a name in any object is refused.
// Call it on text JSON.parse accepted.
function repeatsName(json) {
  const open = [];
  let named = false;
  for (const [token] of json.matchAll(/"(?:[^"\\]|\\.)*"|[{}[\],]/g)) {
    if (token === "{") open.push(new Set());
    else if (token === "[") open.push(null);
    else if (token === "}" || token === "]") open.pop();
    else if (token !== "," && named) {
      const name = JSON.parse(token);
      if (open.at(-1).has(name)) return true;
      open.at(-1).add(name);
    }
    named = token === "{" || (token === "," && open.at(-1) !== null);
  }
  return false;
}

// True when path is strictly below dir and every segment after dir is a name.
function under(path, dir) {
  if (dir === "" || !path.startsWith(`${dir}/`)) return false;
  return path
    .slice(dir.length + 1)
    .split("/")
    .every((name) => name !== "" && name !== "." && name !== "..");
}

// The directory `cd d && pwd -P` prints in POSIX sh, or null when cd fails.
// cd walks d by name: each name must be a directory, and `..` then drops the
// name before it, even when that name is a symlink. Exactly two leading
// slashes stay two. A relative d starts from the directory the hook runs in.
function physical(d) {
  try {
    const from = d.startsWith("/") ? d : `${process.cwd()}/${d}`;
    const lead = /^\/\/(?!\/)/.test(from) ? "//" : "/";
    const names = [];
    for (const name of from.split("/")) {
      if (name === "..") names.pop();
      else if (name !== "" && name !== ".") {
        names.push(name);
        if (!statSync(lead + names.join("/")).isDirectory()) return null;
      }
    }
    const logical = lead + names.join("/");
    accessSync(logical, constants.X_OK);
    // Not realpathSync.native, which rewrites each name in the case the file
    // system stores, where pwd -P keeps the case d was written in.
    return lead.slice(1) + realpathSync(logical);
  } catch {
    return null;
  }
}

function isSymlink(path) {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

// Copilot reports cwd as a real path (/private/tmp on macOS), while the agent
// may write the path it was given. Resolves the longest existing directory
// prefix of p. File and dangling symlinks take the normal permission flow.
// So does a path with a single quote, which the shell that once resolved
// these could not take, and a relative path with a leading dash, which that
// shell's cd read as an option.
function resolve(p) {
  if (p === "" || p.includes("'") || p.startsWith("-") || control(p)) return "";
  let d = p;
  let rest = "";
  while (d !== "" && d !== "/") {
    const real = physical(d);
    if (real !== null) return control(real) ? "" : real + rest;
    if (isSymlink(d)) return "";
    const slash = Math.max(d.lastIndexOf("/"), 0);
    rest = d.slice(slash) + rest;
    d = d.slice(0, slash);
  }
  return p;
}

// Splits a command on spaces. A word is plain, from a strict safe set, or
// single-quoted with no quote inside. Returns null on anything else.
function words(command) {
  const found = [];
  let rest = command;
  for (;;) {
    rest = rest.replace(/^ +/, "");
    if (rest === "") return found;
    const quoted = rest[0] === "'";
    const word = quoted ? /^'([^']*)'/.exec(rest) : /^([A-Za-z0-9_.\/:=@%+,-]+)/.exec(rest);
    if (!word) return null;
    found.push({ quoted, word: word[1] });
    rest = rest.slice(word[0].length);
    if (rest !== "" && rest[0] !== " ") return null;
  }
}

// resume.mjs: operation first, then named paths. Only publication accepts
// note and artifact inputs. Both --option=value and --option value are
// supported.
function resume([operation, ...rest]) {
  if (!["begin", "read", "publish"].includes(operation)) return null;
  const seen = new Set();
  const paths = [];
  for (let i = 0; i < rest.length; i++) {
    const eq = rest[i].indexOf("=");
    const option = eq < 0 ? rest[i] : rest[i].slice(0, eq);
    if (!["--project", "--note", "--artifact"].includes(option)) return null;
    if (operation !== "publish" && option !== "--project") return null;
    if (option !== "--artifact" && seen.has(option)) return null;
    seen.add(option);
    if (eq >= 0) paths.push(rest[i].slice(eq + 1));
    else if (++i >= rest.length || rest[i].startsWith("--")) return null;
    else paths.push(rest[i]);
  }
  return operation !== "publish" || seen.has("--note") ? paths : null;
}

// Each argument shape returns the arguments that are path operands, or null
// for a form it does not know. Prose and operation names are not paths.
const SHAPES = {
  log: (args) => (args.length === 6 ? [args[0]] : null),
  transcript: (args) => ((args.length === 2 || args.length === 3) && args[1] !== "" ? [args[0], ...args.slice(2)] : null),
  "optional-path": (args) => (args.length <= 1 ? args : null),
  "one-path": (args) => (args.length === 1 ? args : null),
  paths: (args) => args,
  resume,
};

// Approved entry points and their argument shapes. Adding a script under
// skills/ does not grant it automatic approval. Unknown forms stay silent.
const CONTRACT = new Map([
  ["skills/show-me-your-work/scripts/log.mjs", "log"],
  ["skills/reflect/scripts/find-transcript.mjs", "transcript"],
  ["skills/setup-pstack/scripts/check-sheet.mjs", "optional-path"],
  ["skills/poteto-mode/scripts/check-playbooks.mjs", "optional-path"],
  ["skills/poteto-mode/scripts/check-plan.mjs", "one-path"],
  ["skills/poteto-mode/scripts/worktree-audit.mjs", "paths"],
  ["skills/poteto-mode/scripts/resume.mjs", "resume"],
]);

// The plugin's own files: playbooks, references, and scripts.
function viewRule({ args, root, real }) {
  const path = text(args.path);
  if (/["\\]/.test(path) || control(path)) return null;
  return under(path, root) || under(path, real) ? ALLOW : null;
}

// A pstack agent dispatched with an explicit model must use one of the user's
// saved choices in a valid sheet. A call with no model, or for another agent,
// is not ours.
function taskRule({ args, sheet, readSheet, parseSheet }) {
  const type = text(args.agent_type);
  const model = text(args.model);
  if (!type.startsWith("pstack:") || model === "") return null;
  const lines = readSheet(sheet);
  if (lines === null) return null;
  const { problems, models, explicit, aliases } = parseSheet(lines);
  if (problems.length || models.has(model)) return null;
  if (!explicit.length) {
    return deny(
      `pstack model check: every role in the user's saved pstack model choices (${sheet}) is inherit-parent or auto, so call \`task\` for ${type} without \`model\`.`,
    );
  }
  return deny(
    `pstack model check: \`${model}\` is not one of the user's saved pstack model choices (${sheet}). Set \`model\` to the model saved for this role: one of ${explicit.map((id) => `\`${id}\``).join(", ")}.` +
      (aliases ? " A role saved as inherit-parent or auto omits `model`." : "") +
      " To change the choices, the user reruns setup-pstack.",
  );
}

// Tokenizes a strict shell form, then lets the registered script's contract
// select its path operands.
function scriptRule({ args, root, real, cwd: reported }) {
  const command = text(args.command);
  if (/[;|&$`<>()\\"]/.test(command) || control(command)) return null;
  const cwd = resolve(reported);
  // A workspace that holds the plugin, or sits in it, could rewrite its files.
  if (root === "" || cwd === "") return null;
  if ([root, real].some((dir) => dir === cwd || under(dir, cwd) || under(cwd, dir))) return null;
  const found = words(command);
  if (found === null) return null;
  const run = !found[0]?.quoted && found[0]?.word === "node" ? found.slice(1) : found;
  const [script, ...rest] = run.map(({ word }) => word);
  if (script === undefined) return null;
  const home = [root, real].find((dir) => under(script, dir));
  if (home === undefined) return null;
  const shape = CONTRACT.get(script.slice(home.length + 1));
  const operands = shape === undefined ? null : SHAPES[shape](rest);
  // Path operands stay in the workspace: one in the plugin could rewrite the
  // context every later session loads.
  const inside = (operand) => {
    if (operand === "" || operand.split("/").includes("..")) return false;
    const path = resolve(operand.startsWith("/") ? operand : `${cwd}/${operand}`);
    return path !== "" && (path === cwd || under(path, cwd));
  };
  return operands?.every(inside) ? ALLOW : null;
}

// Copilot sends Claude-format input to PascalCase hooks, so `view` arrives as
// `Read`.
const RULES = new Map([
  ["Read", viewRule],
  ["view", viewRule],
  ["Agent", taskRule],
  ["Task", taskRule],
  ["task", taskRule],
  ["Bash", scriptRule],
  ["bash", scriptRule],
]);

async function decide() {
  // Imported here so that a plugin copy without the module still exits 0.
  const { parseSheet, readSheet } = await import("../skills/setup-pstack/scripts/sheet.mjs");
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  let json;
  let payload;
  try {
    // A lossy decode would let two different byte strings compare equal, and a
    // decoder that drops a byte-order mark would accept one before the object.
    json = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(Buffer.concat(chunks));
    payload = JSON.parse(json);
  } catch {
    return null;
  }
  const plugin = process.env.COPILOT_PLUGIN_ROOT ?? "";
  if (plugin === "" || !isObject(payload) || repeatsName(json)) return null;
  const claude = Object.hasOwn(payload, "tool_name");
  const args = claude ? payload.tool_input : payload.toolArgs;
  const rule = RULES.get(text(claude ? payload.tool_name : payload.toolName));
  if (!rule || !isObject(args)) return null;
  return rule({
    args,
    cwd: text(payload.cwd),
    root: plugin.replace(/\/$/, ""),
    real: physical(plugin) ?? "",
    sheet: `${process.env.COPILOT_HOME || `${homedir()}/.copilot`}/pstack-models.md`,
    readSheet,
    parseSheet,
  });
}

try {
  const decision = await decide();
  if (decision) process.stdout.write(`${JSON.stringify(decision)}\n`);
} catch (error) {
  process.stderr.write(`pre-tool-use.mjs: ${error.message}\n`);
}
