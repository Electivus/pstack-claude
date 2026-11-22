// The SessionStart hook on Windows with no sh and no PowerShell on PATH. Muse
// spawns its argv with no shell, Codex substitutes the plugin root into its
// command text and runs it through cmd when no PowerShell exists, and Claude
// Code runs its command through Git Bash.
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { MUSE_HOOKS } from "../tools/runtimes.mjs";
import { roleCases, sessionHookValues, sheetCases, writeSheet } from "./session-hook-sheets.mjs";

const pluginRoot = fileURLToPath(new URL("../plugins/pstack/", import.meta.url));
const read = (rel) => readFileSync(join(pluginRoot, rel), "utf8");
const hookOf = (file) => JSON.parse(read(file)).hooks.SessionStart[0].hooks[0];
const codex = hookOf(JSON.parse(read(".codex-plugin/plugin.json")).hooks);
const copilot = hookOf(JSON.parse(read(".github/plugin/plugin.json")).hooks);
const claude = hookOf("hooks/hooks.json");
const muse = MUSE_HOOKS.find((hook) => hook.id === "session-start").command;
const mandate = read("hooks/session-start-context.md");
const museMandate = read("hooks/session-start-muse.md");
// The note as the hook prints it, line ending included.
const museSheetNote = read("hooks/session-start-muse-sheet.md");
const models = JSON.parse(read("models.json"));

// CI's Windows job sets this, so a platform check that misfires fails there
// instead of skipping every test.
const required = process.env.PSTACK_REQUIRE_WINDOWS_HOOK === "1";
const onWindows = process.platform === "win32" || required;
const systemRoot = process.env.SystemRoot ?? "C:\\Windows";
const nodeDir = onWindows ? dirname(spawnSync("node", ["-p", "process.execPath"], { encoding: "utf8" }).stdout.trim()) : "";
const gitBash = join(process.env.ProgramFiles ?? "C:\\Program Files", "Git", "bin", "bash.exe");

// A plugin copy under a path with spaces, a user profile, and the hook's
// environment: node and System32 on PATH, which holds cmd and no PowerShell.
function run({ via, command, sheet, sheetAt, env = {}, context }) {
  const fixture = mkdtempSync(join(tmpdir(), "pstack windows hook "));
  try {
    const plugin = join(fixture, "plugin with spaces");
    const profile = join(fixture, "user profile");
    for (const dir of ["hooks", "skills/setup-pstack/scripts"]) cpSync(join(pluginRoot, dir), join(plugin, dir), { recursive: true });
    if (context !== undefined) writeFileSync(join(plugin, "hooks/session-start-context.md"), context);
    if (sheet !== undefined) {
      const path = sheetAt({ profile, fixture });
      mkdirSync(dirname(path), { recursive: true });
      writeSheet(path, sheet);
    }
    const base = {
      SystemRoot: systemRoot,
      PATH: `${nodeDir};${join(systemRoot, "System32")}`,
      PATHEXT: process.env.PATHEXT,
      TEMP: process.env.TEMP,
      TMP: process.env.TMP,
      USERPROFILE: profile,
      HOME: join(fixture, "other home"),
    };
    const vars = { ...base, ...(typeof env === "function" ? env({ profile, fixture, plugin }) : env) };
    for (const name of Object.keys(vars)) if (vars[name] === undefined) delete vars[name];
    const text = typeof command === "string" ? command.replaceAll(/\$\{[A-Z_]+_PLUGIN_ROOT\}/g, plugin) : command;
    const result =
      via === "cmd"
        ? spawnSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", text], { env: vars, windowsVerbatimArguments: true })
        : via === "bash"
          ? spawnSync(gitBash, ["-c", command], { env: { ...vars, CLAUDE_PLUGIN_ROOT: plugin } })
          : spawnSync(text[0], text.slice(1), { cwd: plugin, env: { ...vars, MUSE_PLUGIN_ROOT: plugin } });
    if (result.error) throw result.error;
    return { status: result.status, out: result.stdout.toString("utf8"), err: result.stderr.toString("utf8") };
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}

const inProfile = (...rel) => ({ profile }) => join(profile, ...rel);

describe.skipIf(!onWindows)("Windows SessionStart hook without PowerShell", () => {
  test("the hook environment cannot find PowerShell", () => {
    const where = spawnSync(join(systemRoot, "System32", "where.exe"), ["powershell", "pwsh"], {
      env: { SystemRoot: systemRoot, PATH: `${nodeDir};${join(systemRoot, "System32")}`, PATHEXT: process.env.PATHEXT },
    });
    expect(where.status).not.toBe(0);
  });

  test("Codex's command runs through cmd and injects the mandate", () => {
    expect(run({ via: "cmd", command: codex.command })).toEqual({ status: 0, out: mandate, err: "" });
  });

  for (const { name, sheet, off } of sheetCases) {
    test(`Codex ${off ? "injects nothing" : "injects the mandate"} when the sheet has ${name}`, () => {
      expect(run({ via: "cmd", command: codex.command, sheet, sheetAt: inProfile(".codex", "pstack-models.md") })).toEqual({
        status: 0, out: off ? "" : mandate, err: "",
      });
    });
  }

  test("CODEX_HOME takes precedence over USERPROFILE, and an empty one falls back", () => {
    const sheetAt = ({ fixture }) => join(fixture, "codex home", "pstack-models.md");
    const codexHome = ({ fixture }) => ({ CODEX_HOME: join(fixture, "codex home") });
    expect(run({ via: "cmd", command: codex.command, sheet: "session hook: off\r\n", sheetAt, env: codexHome }).out).toBe("");
    expect(run({ via: "cmd", command: codex.command, sheet: "session hook: off\n", sheetAt: inProfile(".codex", "pstack-models.md"), env: { CODEX_HOME: "" } }).out).toBe("");
  });

  // A cloud session starts with an empty home, so no user sheet survives it.
  for (const [label, value, off] of sessionHookValues) {
    test(`Codex ${off ? "injects nothing" : "injects the mandate"} when PSTACK_SESSION_HOOK is ${label} and no sheet exists`, () => {
      expect(run({ via: "cmd", command: codex.command, env: { PSTACK_SESSION_HOOK: value } })).toEqual({ status: 0, out: off ? "" : mandate, err: "" });
    });
  }

  test("PSTACK_SESSION_HOOK=off wins over a sheet with session hook: on", () => {
    const sheetAt = inProfile(".codex", "pstack-models.md");
    expect(run({ via: "cmd", command: codex.command, sheet: "session hook: on\n", sheetAt, env: { PSTACK_SESSION_HOOK: "off" } }).out).toBe("");
  });

  test("writes UTF-8 context byte for byte", () => {
    const context = "Routing context: 中文 café 🚀";
    expect(run({ via: "cmd", command: codex.command, context })).toEqual({ status: 0, out: context, err: "" });
  });

  test("fails on an unknown runtime", () => {
    const r = run({ via: "cmd", command: codex.command.replace(/ codex$/, " cursor") });
    expect({ status: r.status, out: r.out, err: r.err.trimEnd() }).toEqual({
      status: 2, out: "", err: "session-start.mjs: unknown runtime 'cursor' (expected agy, claude, codex, copilot, or muse)",
    });
  });

  test("Copilot's command adds a valid sheet's role lines", () => {
    const sheet = Buffer.from(`\ufeff${models.roles.map(({ role, models: tier }) => `${role}: ${tier === "panel" ? "gpt-5.5, claude-opus-5" : "gpt-5.5"}`).join("\r\n")}\r\n`, "utf16le");
    const r = run({ via: "cmd", command: copilot.command, sheet, sheetAt: inProfile(".copilot", "pstack-models.md") });
    expect({ status: r.status, err: r.err }).toEqual({ status: 0, err: "" });
    expect(JSON.parse(r.out).additionalContext).toContain("\nbug-fix: gpt-5.5\n");
  });

  test("Muse's argv runs with no shell and injects the mandate", () => {
    expect(run({ via: "argv", command: muse })).toEqual({ status: 0, out: museMandate, err: "" });
  });

  for (const { name, sheet, roles } of roleCases) {
    test(`Muse adds ${roles.length ? roles.join(", ") : "no role lines"} for a sheet with ${name}`, () => {
      const out = roles.length ? `${museMandate}\n${museSheetNote}${roles.join("\n")}\n` : museMandate;
      expect(run({ via: "argv", command: muse, sheet, sheetAt: inProfile(".config", "muse", "pstack-models.md") })).toEqual({ status: 0, out, err: "" });
    });
  }

  test("Muse reads XDG_CONFIG_HOME, and finds the profile without a USERPROFILE variable", () => {
    const sheetAt = ({ fixture }) => join(fixture, "xdg", "muse", "pstack-models.md");
    expect(run({ via: "argv", command: muse, sheet: "session hook: off\n", sheetAt, env: ({ fixture }) => ({ XDG_CONFIG_HOME: join(fixture, "xdg") }) }).out).toBe("");
    expect(run({ via: "argv", command: muse, env: { USERPROFILE: undefined } })).toEqual({ status: 0, out: museMandate, err: "" });
  });

  test.skipIf(!existsSync(gitBash) && !required)("Claude Code's command runs through Git Bash", () => {
    expect(run({ via: "bash", command: claude.command })).toEqual({ status: 0, out: mandate, err: "" });
    expect(run({ via: "bash", command: claude.command, sheet: "session hook: off\n", sheetAt: inProfile(".claude", "pstack-models.md") }).out).toBe("");
  });
});

// VS Code's Local agent reads hooks/hooks.json as a Claude Code plugin. On
// Windows, with ComSpec set to cmd.exe, its hook executor runs the hook's
// windows field, else powershell, else command, through
// `powershell.exe -Command`, and warns the user on the first turn about any
// exit code other than 0 or 2.
function runVSCodeLocalHook() {
  const fixture = mkdtempSync(join(tmpdir(), "pstack windows vscode hook "));
  try {
    const plugin = join(fixture, "plugin with spaces");
    cpSync(join(pluginRoot, "hooks"), join(plugin, "hooks"), { recursive: true });
    const raw = claude.windows ?? claude.powershell ?? claude.command;
    // VS Code quotes a plugin root with spaces as a PowerShell literal.
    const command = raw.replace(/(["']?)\$\{CLAUDE_PLUGIN_ROOT\}([\w./\\~:-]*)\1/g, (_, _quote, rest) => `'${`${plugin}${rest}`.replaceAll("'", "''")}'`);
    const env = {
      SystemRoot: systemRoot,
      PATH: `${nodeDir};${join(systemRoot, "System32")};${join(systemRoot, "System32", "WindowsPowerShell", "v1.0")}`,
      PATHEXT: process.env.PATHEXT,
      TEMP: process.env.TEMP,
      TMP: process.env.TMP,
      USERPROFILE: join(fixture, "user profile"),
      CLAUDE_PLUGIN_ROOT: plugin,
      POWERSHELL_UPDATECHECK: "Off",
    };
    const result = spawnSync("powershell.exe", ["-ExecutionPolicy", "Bypass", "-NoProfile", "-NoLogo", "-Command", command], {
      env,
      input: JSON.stringify({ hook_event_name: "SessionStart", source: "new" }),
      encoding: "utf8",
    });
    if (result.error) throw result.error;
    return { status: result.status, out: result.stdout, err: result.stderr };
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}

describe.skipIf(!onWindows)("Windows VS Code Local SessionStart hook", () => {
  test("exits 0 with no output, so the first Local turn shows no hook warning and the routing rule stays the only mandate", () => {
    expect(runVSCodeLocalHook()).toEqual({ status: 0, out: "", err: "" });
  });
});
