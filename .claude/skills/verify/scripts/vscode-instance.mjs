#!/usr/bin/env node
// Usage:
//   node vscode-instance.mjs setup <instance dir> --session copilot|local [--plugin <dir>]... [--model <id>] [--from <user data dir>]
//   node vscode-instance.mjs launch <instance dir>
//   node vscode-instance.mjs send <instance dir> <prompt>
//   node vscode-instance.mjs quit <instance dir>
//   node vscode-instance.mjs clean <instance dir> --evidence <dir>
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { parseArgs } from "node:util";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    session: { type: "string" },
    plugin: { type: "string", multiple: true, default: [] },
    model: { type: "string" },
    from: { type: "string", default: defaultUserDataDir() },
    evidence: { type: "string" },
  },
});
const [command, dir, prompt] = positionals;
const cli = process.env.CODE_CLI ?? "code-insiders";

function defaultUserDataDir() {
  const name = "Code - Insiders";
  if (platform() === "darwin") return join(homedir(), "Library/Application Support", name);
  if (platform() === "win32") return join(process.env.APPDATA ?? "", name);
  return join(homedir(), ".config", name);
}

const sqlite = (db, sql) => execFileSync("sqlite3", [db, sql], { encoding: "utf8" }).trim();
const quote = (s) => `'${s.replaceAll("'", "''")}'`;

// VS Code's portable layout: VSCODE_PORTABLE=<instance> means <instance>/user-data and <instance>/extensions.
function paths(instance) {
  const userDataDir = join(instance, "user-data");
  return { userDataDir, extensionsDir: join(instance, "extensions"), workspace: join(instance, "workspace"), user: join(userDataDir, "User") };
}

function mainPids(userDataDir) {
  const run = spawnSync("pgrep", ["-f", "--", `--user-data-dir ${userDataDir}( |$)`], { encoding: "utf8" });
  return run.stdout.split("\n").filter(Boolean).map(Number);
}

const sessions = {
  copilot: { harness: true, modelKey: "chat.currentLanguageModel.panel.agent-host-copilotcli", modelValue: (m) => `agent-host-copilotcli:${m}` },
  local: { harness: false, modelKey: "chat.currentLanguageModel.panel", modelValue: (m) => `copilot/${m}` },
};

function setup(instance) {
  const session = sessions[values.session];
  if (!session) {
    console.error("setup needs --session copilot or --session local");
    process.exit(2);
  }
  const p = paths(instance);
  if (p.userDataDir.length > 60) {
    console.error(`${p.userDataDir} is too long: VS Code puts its main socket there and macOS caps socket paths near 104 bytes.`);
    process.exit(2);
  }
  if (mainPids(p.userDataDir).length) {
    console.error(`${p.userDataDir} is in use. Run quit first.`);
    process.exit(1);
  }
  for (const d of [join(p.user, "globalStorage"), p.extensionsDir, p.workspace]) mkdirSync(d, { recursive: true });

  const settings = {
    "chat.pluginLocations": Object.fromEntries(values.plugin.map((x) => [resolve(x), true])),
    "github.copilot.chat.agentDebugLog.fileLogging.enabled": true,
    "chat.defaultToCopilotHarness": session.harness,
    "chat.editor.preferCopilotHarness": session.harness,
    "security.workspace.trust.enabled": false,
    "workbench.startupEditor": "none",
    "update.mode": "none",
  };
  writeFileSync(join(p.user, "settings.json"), JSON.stringify(settings, null, 2) + "\n");

  const db = join(p.user, "globalStorage/state.vscdb");
  sqlite(db, "create table if not exists ItemTable (key text unique on conflict replace, value blob)");
  const authKey = 'secret://{"extensionId":"vscode.github-authentication","key":"github.auth"}';
  const source = `file:${encodeURI(join(values.from, "User/globalStorage/state.vscdb"))}?mode=ro`;
  const copied = sqlite(db, `attach ${quote(source)} as src; insert into ItemTable select key, value from src.ItemTable where key = ${quote(authKey)}; select changes();`);
  if (values.model) sqlite(db, `insert into ItemTable(key, value) values (${quote(session.modelKey)}, ${quote(session.modelValue(values.model))})`);
  return { ...p, session: values.session, settings, githubAuthCopied: copied === "1", model: values.model ?? null };
}

function launch(instance) {
  const p = paths(instance);
  spawnSync(cli, ["--user-data-dir", p.userDataDir, "--extensions-dir", p.extensionsDir, "-n", p.workspace], { stdio: "inherit" });
  return { launched: p.workspace, pids: mainPids(p.userDataDir) };
}

function send(instance, text) {
  if (!mainPids(paths(instance).userDataDir).length) {
    console.error(`No instance runs on ${instance}. Run launch first, or the CLI starts a fresh window without the workspace.`);
    process.exit(1);
  }
  const since = Date.now();
  const run = spawnSync(cli, ["chat", text], { cwd: paths(instance).workspace, env: { ...process.env, VSCODE_PORTABLE: instance }, encoding: "utf8" });
  return { since, exitCode: run.status, stdout: run.stdout.trim(), stderr: run.stderr.trim() };
}

function quit(instance) {
  const pids = mainPids(paths(instance).userDataDir);
  for (const pid of pids) process.kill(pid);
  return { killed: pids };
}

function clean(instance) {
  if (mainPids(paths(instance).userDataDir).length) {
    console.error(`Run quit first: ${instance} is still running.`);
    process.exit(1);
  }
  if (!values.evidence) {
    console.error("clean needs --evidence <dir> to keep the logs");
    process.exit(2);
  }
  const { userDataDir } = paths(instance);
  const evidence = resolve(values.evidence);
  cpSync(join(userDataDir, "logs"), join(evidence, "logs"), { recursive: true });
  const storage = join(userDataDir, "User/workspaceStorage");
  for (const ws of existsSync(storage) ? readdirSync(storage) : []) {
    const debug = join(storage, ws, "GitHub.copilot-chat/debug-logs");
    if (existsSync(debug)) cpSync(debug, join(evidence, "debug-logs"), { recursive: true });
  }
  rmSync(instance, { recursive: true, force: true });
  return { removed: instance, evidence };
}

const commands = { setup, launch, send: (i) => send(i, prompt), quit, clean };
if (!commands[command] || !dir || (command === "send" && !prompt)) {
  console.error("usage: vscode-instance.mjs setup|launch|send|quit|clean <instance dir> [...]");
  process.exit(2);
}
console.log(JSON.stringify(commands[command](resolve(dir)), null, 2));
