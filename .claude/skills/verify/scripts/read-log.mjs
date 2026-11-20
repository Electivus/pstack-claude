#!/usr/bin/env node
// Usage:
//   node read-log.mjs claude <stream.jsonl> [--find <word>]...
//   node read-log.mjs copilot --instance <dir> --since <epoch ms> --match <text> [--wait <s>] [--find <word>]...  (or COPILOT_HOME set, never the user's ~/.copilot)
//   node read-log.mjs local --since <epoch ms> --match <text> [--wait <s>] [--find <word>]... [--user-data-dir <dir>]
//   node read-log.mjs hooks <hooks.jsonl>
//   node read-log.mjs policy [--user-data-dir <dir>]
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    since: { type: "string" },
    match: { type: "string" },
    wait: { type: "string", default: "0" },
    find: { type: "string", multiple: true, default: [] },
    instance: { type: "string" },
    "user-data-dir": { type: "string", default: defaultUserDataDir() },
  },
});
const [mode, file] = positionals;

function defaultUserDataDir() {
  const name = "Code - Insiders";
  if (platform() === "darwin") return join(homedir(), "Library/Application Support", name);
  if (platform() === "win32") return join(process.env.APPDATA ?? "", name);
  return join(homedir(), ".config", name);
}

function jsonl(path) {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
}

const clip = (s, n = 160) => {
  const t = typeof s === "string" ? s : JSON.stringify(s ?? "");
  return t.length > n ? `${t.slice(0, n)}...` : t;
};

function markers(text) {
  return Object.fromEntries(values.find.map((w) => [w, text.includes(w)]));
}

// Delivery evidence is only what the host logged as sent to the model. A hook's output proves the hook ran, not that its text was sent.
// null means the host logged no record of what it sent, so a marker's absence proves nothing.
const deliveredMarkers = (records) => {
  const sent = records.filter(Boolean);
  return sent.length ? markers(sent.map((r) => JSON.stringify(r)).join("\n")) : null;
};
const hookMarkers = (outputs) => markers(outputs.map((o) => JSON.stringify(o ?? "")).join("\n"));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(pick) {
  const deadline = Date.now() + Number(values.wait) * 1000;
  for (;;) {
    const found = pick();
    if (found?.done || Date.now() >= deadline) return found;
    await sleep(2000);
  }
}

function requireSinceAndMatch() {
  if (!values.since || !values.match) {
    console.error(`${mode} needs --since <epoch ms> and --match <text from the prompt>`);
    process.exit(2);
  }
  return Number(values.since);
}

function claudeTranscript(sessionId) {
  const projects = join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"), "projects");
  if (!sessionId || !existsSync(projects)) return null;
  return readdirSync(projects).map((d) => join(projects, d, `${sessionId}.jsonl`)).find(existsSync) ?? null;
}

function readClaude(path) {
  const events = jsonl(path);
  const init = events.find((e) => e.type === "system" && e.subtype === "init");
  const result = events.find((e) => e.type === "result");
  const hookResponses = events.filter((e) => e.subtype === "hook_response");
  const transcript = claudeTranscript(init?.session_id);
  const requests = transcript ? jsonl(transcript).filter((r) => r.type === "api-request-blob" && r.message?.role !== "assistant") : [];
  return {
    model: init?.model,
    plugins: init?.plugins?.map((p) => `${p.name} ${p.source} ${p.path}`),
    pstackSkills: init?.skills?.filter((s) => s.startsWith("pstack:")).length,
    transcript,
    hooks: hookResponses.map((e) => ({ hook: e.hook_name, exit: e.exit_code, outcome: e.outcome, output: clip(e.output ?? e.stdout) })),
    toolCalls: events
      .filter((e) => e.type === "assistant")
      .flatMap((e) => e.message?.content ?? [])
      .filter((c) => c.type === "tool_use")
      .map((c) => `${c.name} ${clip(c.input, 120)}`),
    result: result?.result,
    isError: result?.is_error,
    markersDelivered: deliveredMarkers(requests.map((r) => r.message.content)),
    markersInHookOutput: hookMarkers(hookResponses.map((e) => e.output ?? e.stdout)),
    markersInReply: markers(result?.result ?? ""),
  };
}

function copilotSessions(since) {
  const home = values.instance ? join(resolve(values.instance), "copilot-home") : process.env.COPILOT_HOME;
  if (!home) {
    console.error("copilot needs --instance <dir> or COPILOT_HOME naming an instance's copilot-home. It never reads the user's ~/.copilot.");
    process.exit(2);
  }
  const root = join(home, "session-state");
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .map((id) => join(root, id))
    .filter((dir) => statSync(dir).birthtimeMs >= since && existsSync(join(dir, "events.jsonl")));
}

function readCopilot(since) {
  for (const dir of copilotSessions(since)) {
    const events = jsonl(join(dir, "events.jsonl"));
    const prompt = events.find((e) => e.type === "user.message")?.data?.content ?? "";
    if (!prompt.includes(values.match)) continue;
    const start = events.find((e) => e.type === "session.start")?.data;
    const ends = events.filter((e) => e.type === "hook.end");
    return {
      done: ends.some((e) => e.data.hookType === "agentStop") || events.some((e) => e.type === "session.error"),
      events: join(dir, "events.jsonl"),
      selectedModel: start?.selectedModel ?? null,
      modelChanges: events.filter((e) => e.type === "session.model_change").map((e) => `${e.data.previousModel} -> ${e.data.newModel} (${e.data.source})`),
      usedModels: [...new Set(events.filter((e) => e.type === "session.usage_record").map((e) => e.data.usage?.model))],
      inputTokens: events.filter((e) => e.type === "session.usage_record").map((e) => e.data.usage?.inputTokens),
      warnings: events.filter((e) => e.type === "session.warning").map((e) => clip(e.data.message, 120)),
      copilotVersion: start?.copilotVersion,
      hooks: ends.map((e) => ({
        hook: e.data.hookType,
        success: e.data.success,
        context: e.data.output?.additionalContext ? clip(e.data.output.additionalContext) : undefined,
        decision: e.data.output?.permissionDecision,
      })),
      skills: events.filter((e) => e.type === "skill.invoked").map((e) => `${e.data.name} ${e.data.path}`),
      tools: events.filter((e) => e.type === "tool.execution_start").map((e) => `${e.data.toolName} ${clip(e.data.arguments, 120)}`),
      subagents: events.filter((e) => e.type === "subagent.started").map((e) => e.data.agentName),
      errors: events.filter((e) => /error/i.test(e.type)).map((e) => `${e.type} ${clip(e.data, 400)}`),
      replies: events.filter((e) => e.type === "assistant.message" && e.data.content).map((e) => e.data.content),
      markersDelivered: deliveredMarkers([
        ...events.filter((e) => e.type === "system.message" || e.type === "instruction.update").map((e) => e.data.content),
        ...events.filter((e) => e.type === "user.message").map((e) => e.data.transformedContent),
      ]),
      markersInHookOutput: hookMarkers(ends.map((e) => e.data.output)),
    };
  }
}

function localLogs(since) {
  const storage = join(values["user-data-dir"], "User/workspaceStorage");
  if (!existsSync(storage)) return [];
  return readdirSync(storage).flatMap((ws) => {
    const logs = join(storage, ws, "GitHub.copilot-chat/debug-logs");
    if (!existsSync(logs)) return [];
    return readdirSync(logs)
      .map((sid) => join(logs, sid, "main.jsonl"))
      .filter((f) => existsSync(f) && statSync(f).birthtimeMs >= since);
  });
}

function readLocal(since) {
  for (const path of localLogs(since)) {
    const spans = jsonl(path);
    const prompt = spans.find((s) => s.type === "user_message")?.attrs?.content ?? "";
    if (!prompt.includes(values.match)) continue;
    const requests = spans.filter((s) => s.type === "llm_request");
    const systemPrompts = readdirSync(dirname(path))
      .filter((f) => /^system_prompt_\d+\.json$/.test(f))
      .map((f) => JSON.parse(readFileSync(join(dirname(path), f), "utf8")).content);
    const inputMessages = requests.flatMap((s) => JSON.parse(s.attrs?.inputMessages ?? "[]")).filter((m) => m.role !== "assistant");
    const hookSpans = spans.filter((s) => (/hook/i.test(s.type) || /hook/i.test(s.name ?? "")) && s.name !== "Hook Discovery");
    const detail = (name) => [...new Set(spans.filter((s) => s.name === name).map((s) => s.attrs?.details))];
    return {
      done: spans.some((s) => s.type === "turn_end"),
      log: path,
      version: spans.find((s) => s.type === "session_start")?.attrs,
      models: [...new Set(requests.map((s) => s.name))],
      hookDiscovery: detail("Hook Discovery"),
      instructionsDiscovery: detail("Instructions Discovery"),
      customizations: detail("Resolve Customizations")
        .flatMap((d) => d?.split(/ \| |, /) ?? [])
        .filter((e) => !e.startsWith("[skipped]") || /hook/i.test(e)),
      contextIncluded: [...new Set(spans.filter((s) => s.name === "Custom Instructions").map((s) => s.attrs?.details?.split("\n")[0]))],
      replies: spans
        .filter((s) => s.type === "agent_response")
        .flatMap((s) => JSON.parse(s.attrs?.response ?? "[]"))
        .flatMap((m) => m.parts ?? [])
        .filter((p) => p.type === "text")
        .map((p) => p.content),
      hooks: hookSpans.map((s) => `${s.name} ${s.status} ${clip(s.attrs, 300)}`),
      tools: spans.filter((s) => s.type === "tool_call").map((s) => `${s.name} ${s.status}`),
      errors: spans.filter((s) => s.status && s.status !== "ok").map((s) => `${s.type} ${s.name} ${clip(s.attrs, 400)}`),
      markersDelivered: deliveredMarkers([...systemPrompts, ...inputMessages]),
      markersInHookOutput: hookMarkers(hookSpans.map((s) => s.attrs?.output)),
    };
  }
}

function readHooks(path) {
  return jsonl(path).map((r) => ({
    ts: r.ts,
    command: r.command,
    exitCode: r.exitCode,
    cwd: r.cwd,
    pluginRoots: r.pluginRoots,
    runtimeEnv: r.env.filter((n) => /^(CLAUDE|COPILOT|VSCODE)/.test(n)),
    stdin: clip(r.stdin, 300),
    stdout: clip(r.stdout, 300),
    stderr: clip(r.stderr, 300),
  }));
}

function readPolicy() {
  const db = join(values["user-data-dir"], "User/globalStorage/state.vscdb");
  const sql = "select value from ItemTable where key='defaultAccount.cachedPolicyData'";
  const raw = execFileSync("sqlite3", ["-readonly", db, sql], { encoding: "utf8" }).trim();
  if (!raw) return { db, cached: null };
  const { accountPolicyData: p } = JSON.parse(raw);
  const at = (ms) => (ms ? new Date(ms).toISOString() : null);
  return {
    db,
    policy: p.policyData,
    entitlementsFetchedAt: at(p.entitlementsFetchedAt),
    tokenEntitlementsFetchedAt: at(p.tokenEntitlementsFetchedAt),
    managedSettingsFetchedAt: at(p.managedSettingsFetchedAt),
  };
}

const readers = {
  claude: () => readClaude(file),
  hooks: () => readHooks(file),
  policy: readPolicy,
  copilot: () => waitFor(() => readCopilot(requireSinceAndMatch())),
  local: () => waitFor(() => readLocal(requireSinceAndMatch())),
};
if (!readers[mode] || (["claude", "hooks"].includes(mode) && !file)) {
  console.error("usage: read-log.mjs claude|hooks <file> | copilot|local --since <ms> --match <text> | policy");
  process.exit(2);
}
const out = await readers[mode]();
console.log(JSON.stringify(out ?? { found: false }, null, 2));
if (!out || out.done === false) process.exit(1);
