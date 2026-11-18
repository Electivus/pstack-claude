// The SessionStart hook for every runtime that runs one. Each runtime's hooks
// file passes its own name; MiniMax Code runs Claude Code's hooks file, so it
// is known by the MINIMAX_PLUGIN_ROOT it sets.
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSheet, readSheet, ROLES, sessionHookOff } from "../skills/setup-pstack/scripts/sheet.mjs";

const hooks = dirname(fileURLToPath(import.meta.url));
const file = (name) => readFileSync(join(hooks, name));
// The file's text without its final newline.
const text = (name) => file(name).toString("utf8").replace(/\n$/, "");
// The file's text ending in one newline, as a line-by-line copy prints it.
const lines = (name) => `${text(name)}\n`;
const isFile = (path) => {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
};

// A sheet committed with the project replaces the user's in that project.
// Claude Code may start in a subdirectory, so look at the repository root.
function claudeSheet() {
  const user = join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), "pstack-models.md");
  const project = process.env.CLAUDE_PROJECT_DIR;
  if (!project) return user;
  let root = project;
  try {
    const top = execFileSync("git", ["-C", project, "rev-parse", "--show-toplevel"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    root = top.replace(/\n+$/, "");
  } catch {}
  const shared = join(root, ".claude", "pstack-models.md");
  return isFile(shared) ? shared : user;
}

// GitHub Copilot parses stdout as one JSON object. Its sheet sits outside
// Copilot's path sandbox, so the hook checks the sheet and adds its role lines
// to the mandate inside its closing tag, and the agent never reads the file.
// Only a valid sheet's known role lines reach the context, rebuilt from their
// checked values, so no other text in the sheet does.
function copilot(sheet) {
  let notes = text("session-start-copilot.md");
  const state = sheet && parseSheet(sheet);
  if (state && !state.problems.length) {
    notes += `\n\n${text("session-start-copilot-sheet.md")}\n`;
    for (const role of ROLES) notes += `\n${role}: ${state.values.get(role)}`;
    if (state.values.has("default effort")) notes += `\ndefault effort: ${state.values.get("default effort")}`;
  } else {
    if (state) notes += `\n\nsheet invalid: ${state.problems.join("; ")}`;
    notes += `\n\n${text("session-start-copilot-setup.md")}`;
  }
  let body = text("session-start-context.md");
  const close = body.indexOf("</EXTREMELY_IMPORTANT>");
  body = close >= 0 ? `${body.slice(0, close)}\n${notes}\n${body.slice(close)}` : `${body}\n${notes}`;
  return `${JSON.stringify({ additionalContext: `${body}\n` })}\n`;
}

// Muse reads stdout as plain context. Its sheet has no include mechanism, so
// the hook adds each usable known role line after the mandate. Unlike the
// Copilot check, a panel of one vendor is fine here: Muse serves one family.
function muse(sheet) {
  let out = lines("session-start-muse.md");
  if (!sheet) return out;
  const state = parseSheet(sheet);
  let roles = ROLES.filter((role) => state.usable.has(role)).map((role) => `${role}: ${state.values.get(role)}\n`).join("");
  if (state.effortOk) roles += `default effort: ${state.values.get("default effort")}\n`;
  if (roles) out += `\n${lines("session-start-muse-sheet.md")}${roles}`;
  return out;
}

const RUNTIMES = {
  agy: {
    sheet: () => join(homedir(), ".gemini", "config", "pstack-models.md"),
    off: "{}\n",
    print: () => `${JSON.stringify({ injectSteps: [{ systemMessage: { systemMessage: text("session-start-agy.md") } }] })}\n`,
  },
  claude: { sheet: claudeSheet, print: () => file("session-start-context.md") },
  minimax: {
    // MiniMax Code withholds MINIMAX_DATA_DIR from hooks and its bash tool.
    sheet: () => join(homedir(), ".minimax", "pstack-models.md"),
    print: () => file("session-start-minimax.md"),
  },
  codex: {
    sheet: () => join(process.env.CODEX_HOME || join(homedir(), ".codex"), "pstack-models.md"),
    print: () => file("session-start-context.md"),
  },
  copilot: { sheet: () => join(process.env.COPILOT_HOME || join(homedir(), ".copilot"), "pstack-models.md"), print: copilot },
  muse: { sheet: () => join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "muse", "pstack-models.md"), print: muse },
};

const name = process.argv[2] === "claude" && process.env.MINIMAX_PLUGIN_ROOT ? "minimax" : process.argv[2];
const runtime = Object.hasOwn(RUNTIMES, name ?? "") ? RUNTIMES[name] : null;
if (!runtime) {
  process.stderr.write(`session-start.mjs: unknown runtime '${process.argv[2] ?? ""}' (expected agy, claude, codex, copilot, or muse)\n`);
  process.exitCode = 2;
} else {
  // A sheet that is missing or cannot be decoded leaves injection on.
  const sheet = readSheet(runtime.sheet());
  if (sessionHookOff(sheet)) process.stdout.write(runtime.off ?? "");
  else process.stdout.write(runtime.print(sheet));
}
