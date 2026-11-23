#!/usr/bin/env node
// Locate the transcript whose opening user prompt carries a fragment.
//
//   node find-transcript.mjs <transcripts-dir> <opening-prompt-fragment> [workspace]
//
// Prints the matching active Pi path or the newest matching path, then the
// transcripts of that session's subagents in the order they were last written,
// one per line, or exits 1 with "no transcript". Covers
// Claude Code's three layouts under one per-project directory (flat
// <id>.jsonl, nested <id>/<id>.jsonl, subagent <id>/subagents/<child>.jsonl)
// Pi's <iso>_<id>.jsonl under its per-cwd sessions directory, and GitHub
// Copilot's <id>/events.jsonl under its session-state directory, told apart by
// Pi's session header line and Copilot's session.start event. Each candidate is
// streamed line by line; a Claude Code or Copilot transcript is abandoned at its
// first typed user record. Copilot searches compare the session header's cwd
// with the workspace (the current directory by default) before reading user
// messages. A Pi session is read to its last entry to find
// the active branch. A Codex rollout is refused by name rather than read as an
// empty Claude transcript.
import { createReadStream, lstatSync, readdirSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

// readline also breaks on U+2028 and U+2029, which JSON leaves unescaped.
async function* jsonlLines(stream) {
  let rest = "";
  for await (const chunk of stream) {
    const parts = (rest + chunk).split("\n");
    rest = parts.pop();
    yield* parts;
  }
  if (rest) yield rest;
}

// Session cleanup can delete a transcript or its session directory while a
// search runs. Anything under the root that vanishes after it was listed is
// skipped; a missing root still throws.
export function rethrowUnlessRemoved(error) {
  if (error.code !== "ENOENT") throw error;
}

export function candidates(projectsDir, maxDepth = 2, { includeCompressed = false } = {}) {
  const files = [];
  const walk = (dir, depth) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isFile() && (entry.name.endsWith(".jsonl") || (includeCompressed && entry.name.endsWith(".jsonl.zst")))) files.push(full);
      else if (entry.isDirectory() && depth < maxDepth) {
        try {
          walk(full, depth + 1);
        } catch (error) {
          rethrowUnlessRemoved(error);
        }
      }
    }
  };
  walk(projectsDir, 0);
  return files
    .flatMap((path) => {
      const stat = statSync(path, { throwIfNoEntry: false });
      return stat ? [{ path, mtime: stat.mtimeMs }] : [];
    })
    .sort((a, b) => b.mtime - a.mtime);
}

function text(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((block) => typeof block?.text === "string")
      .map((block) => block.text)
      .join("\n");
  }
  return null;
}

// `user` records Claude Code writes for a local command (/clear, !cmd) and its
// output, not a prompt the user typed. A skill invocation leads with
// <command-message> and is kept: its <command-args> carry what the user typed.
const LOCAL_COMMAND = /^\s*<(?:command-name|local-command-stdout|bash-input)>/u;

// A Pi session opens with this header line; Claude Code transcripts never do.
const isPiHeader = (record) =>
  record?.type === "session" && Number.isInteger(record.version) && typeof record.cwd === "string";
// A Codex rollout opens with its session metadata.
const isCodexHeader = (record) => record?.type === "session_meta";

// A Copilot events.jsonl opens with this event and records each prompt the
// user typed as a `user.message` event.
const isCopilotHeader = (record) => record?.type === "session.start" && typeof record.data === "object";

async function copilotOpening(head, records, workspace) {
  if (workspace !== undefined) {
    const cwd = head.data?.context?.cwd;
    if (typeof cwd !== "string" || !isAbsolute(cwd)) return null;
    try {
      if (realpathSync(cwd) !== realpathSync(workspace)) return null;
    } catch {
      // A removed or inaccessible workspace cannot identify this session.
      return null;
    }
  }
  for await (const record of records) {
    if (record?.type !== "user.message") continue;
    const prompt = text(record.data?.content);
    if (prompt) return prompt;
  }
  return null;
}

async function* parsed(lines) {
  for await (const line of lines) {
    try {
      yield JSON.parse(line);
    } catch {}
  }
}

async function* prepend(head, rest) {
  yield head;
  yield* rest;
}

// A Claude Code transcript opens with the first prompt the user typed.
async function claudeOpening(records) {
  for await (const record of records) {
    if (record?.type !== "user" || record.isMeta) continue;
    const prompt = text(record.message?.content);
    if (prompt && !LOCAL_COMMAND.test(prompt)) return prompt;
  }
  return null;
}

// Pi branches in place: every entry is appended to one file and linked to its
// parent by id, and the last entry is the current leaf. The opening prompt is
// the first user message on the path from that leaf to its root, which may not
// be the first one in file order.
async function piBranch(header, records) {
  const entries = new Map();
  let leaf = null;
  for await (const record of records) {
    if (typeof record?.id !== "string") continue;
    const isUser = record.type === "message" && record.message?.role === "user";
    const agent = record.type === "custom" && record.customType === "pstack-agents" ? record.data?.agent : null;
    const { sessionDir, sessionId } = agent ?? {};
    entries.set(record.id, {
      parentId: record.parentId ?? null,
      prompt: isUser ? text(record.message.content) || null : null,
      agent: typeof sessionDir === "string" && typeof sessionId === "string" ? { sessionDir, sessionId } : null,
    });
    leaf = record.id;
  }
  let prompt = null;
  const piAgents = [];
  const seen = new Set();
  for (let id = leaf; entries.has(id) && !seen.has(id);) {
    seen.add(id);
    const entry = entries.get(id);
    prompt = entry.prompt ?? prompt;
    if (entry.agent) piAgents.push(entry.agent);
    id = entry.parentId;
  }
  return { prompt, piAgents, piHeader: header };
}

// Readers by opening record. Claude Code writes no header, so its row is last
// and takes every file the others do not claim.
const READERS = [
  [isCopilotHeader, (head, rest, path, workspace) => copilotOpening(head, rest, workspace)],
  [isCodexHeader, (head, rest, path) => {
    throw new Error(`${path} is a Codex rollout, which find-transcript does not read; pass the session digest instead`);
  }],
  [() => true, (head, rest) => claudeOpening(prepend(head, rest))],
];

async function readTranscript(path, workspace, piOnly = false) {
  const stream = createReadStream(path, { encoding: "utf8" });
  try {
    const records = parsed(jsonlLines(stream));
    const { value: head, done } = await records.next();
    if (done) return null;
    if (isPiHeader(head)) return await piBranch(head, records);
    if (piOnly) return null;
    const [, read] = READERS.find(([matches]) => matches(head));
    return { prompt: await read(head, records, path, workspace), piAgents: null };
  } finally {
    stream.destroy();
  }
}

export async function openingPrompt(path, workspace) {
  return (await readTranscript(path, workspace))?.prompt ?? null;
}

function activePiCandidate(projectsDir, file) {
  if (!file || !isAbsolute(file) || !file.endsWith(".jsonl")) return null;
  try {
    if (realpathSync(dirname(file)) !== realpathSync(projectsDir)) return null;
    const path = join(projectsDir, basename(file));
    return lstatSync(path, { throwIfNoEntry: false })?.isFile() ? path : null;
  } catch {
    return null;
  }
}

async function findMatchingTranscript(projectsDir, fragment, workspace, activePiFile) {
  let checkedPiPath;
  const active = activePiCandidate(projectsDir, activePiFile);
  if (active) {
    try {
      const result = await readTranscript(active, workspace, true);
      if (result?.prompt?.includes(fragment)) return { path: active, ...result, activePi: true };
      if (result) checkedPiPath = active;
    } catch (error) {
      rethrowUnlessRemoved(error);
    }
  }
  for (const { path } of candidates(projectsDir)) {
    if (path === checkedPiPath) continue;
    try {
      const result = await readTranscript(path, workspace);
      if (result?.prompt?.includes(fragment)) return { path, ...result };
    } catch (error) {
      rethrowUnlessRemoved(error);
    }
  }
  return null;
}

export async function findTranscript(projectsDir, fragment, workspace = process.cwd()) {
  return (await findMatchingTranscript(projectsDir, fragment, workspace))?.path ?? null;
}

// Claude Code keeps a session's subagent transcripts under <id>/subagents/,
// beside a flat <id>.jsonl or around a nested <id>/<id>.jsonl, some of them in
// a deeper directory. Any other transcript, a subagent's own included, has none.
export function subagentTranscripts(path) {
  const id = basename(path, ".jsonl");
  const session = basename(dirname(path)) === id ? dirname(path) : join(dirname(path), id);
  try {
    return candidates(join(session, "subagents"), Infinity)
      .reverse()
      .map((candidate) => candidate.path);
  } catch (error) {
    rethrowUnlessRemoved(error);
    return [];
  }
}

// Pi writes <ISO timestamp with colons and dots replaced>_<session id>.jsonl.
const PI_SESSION_NAME = /^\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d-\d{3}Z_(.+)\.jsonl$/u;
const PI_SESSION_ID = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/u;

function trustedPiAgentDir({ path, activePi, piHeader }) {
  try {
    const root = realpathSync(process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent"));
    if (activePi) return root;
    return PI_SESSION_NAME.exec(basename(path))?.[1] === piHeader.id && dirname(dirname(realpathSync(path))) === join(root, "sessions") ? root : null;
  } catch {
    return null;
  }
}

// A fork keeps inherited agent records in place. Only its parentSession chain
// can establish which earlier sessions owned them; imported custom entries cannot.
async function piParentHeader(file, sessionDir, agentDir) {
  if (typeof file !== "string" || !isAbsolute(file) || !file.endsWith(".jsonl")) return null;
  try {
    const dir = realpathSync(dirname(file));
    if (dir !== realpathSync(sessionDir) && dirname(dir) !== join(agentDir, "sessions")) return null;
    const parent = join(dir, basename(file));
    if (!lstatSync(parent).isFile()) return null;
    const stream = createReadStream(parent, { encoding: "utf8" });
    try {
      const { value } = await jsonlLines(stream).next();
      const header = JSON.parse(value);
      return isPiHeader(header) ? header : null;
    } finally {
      stream.destroy();
    }
  } catch {
    return null;
  }
}

async function piSubagentTranscripts(match) {
  if (!match.piAgents.length) return [];
  const realAgentDir = trustedPiAgentDir(match);
  if (!realAgentDir) return [];
  const directories = new Map();
  for (const { sessionDir, sessionId } of match.piAgents) {
    if (sessionDir.includes("\0") || !PI_SESSION_ID.test(sessionId)) continue;
    const dir = resolve(sessionDir);
    if (!directories.has(dir)) directories.set(dir, new Set());
    directories.get(dir).add(sessionId);
  }
  const needed = new Set([...directories.keys()].map((dir) => basename(dirname(dir))));
  const owners = new Set();
  let header = match.piHeader;
  while (header && typeof header.id === "string" && PI_SESSION_ID.test(header.id) && !owners.has(header.id)) {
    owners.add(header.id);
    needed.delete(header.id);
    if (!needed.size) break;
    header = await piParentHeader(header.parentSession, dirname(match.path), realAgentDir);
  }
  const files = new Map();
  for (const [dir, ids] of directories) {
    const owner = basename(dirname(dir));
    const root = dirname(dirname(dirname(dir)));
    if (!owners.has(owner) || dir !== join(root, "pstack", owner, "agents")) continue;
    const realDir = join(realAgentDir, "pstack", owner, "agents");
    try {
      if (realpathSync(root) !== realAgentDir || realpathSync(dir) !== realDir) continue;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isFile() || !ids.has(PI_SESSION_NAME.exec(entry.name)?.[1])) continue;
        const path = join(dir, entry.name);
        try {
          const realPath = join(realDir, entry.name);
          if (files.has(realPath) || realpathSync(path) !== realPath) continue;
          const stat = lstatSync(path, { throwIfNoEntry: false });
          if (stat?.isFile()) files.set(realPath, { path, mtime: stat.mtimeMs });
        } catch {
          continue;
        }
      }
    } catch {
      continue;
    }
  }
  return [...files.values()].sort((a, b) => a.mtime - b.mtime).map(({ path }) => path);
}

async function main(argv) {
  const [projectsDir, fragment, workspace] = argv;
  if (!projectsDir || !fragment || argv.length > 3) {
    console.error("usage: find-transcript.mjs <transcripts-dir> <opening-prompt-fragment> [workspace]");
    return 2;
  }
  const match = await findMatchingTranscript(projectsDir, fragment, workspace ?? process.cwd(), process.env.PI_SESSION_FILE);
  if (!match) {
    console.error(`no transcript under ${projectsDir} opens with ${JSON.stringify(fragment)}`);
    return 1;
  }
  const { path, piAgents } = match;
  const children = piAgents ? await piSubagentTranscripts(match) : subagentTranscripts(path);
  console.log([path, ...children].join("\n"));
  return 0;
}

// node leaves argv[1] unresolved and may set it to a non-file (`node -e ... arg`).
function invokedDirectly() {
  if (!process.argv[1]) return false;
  try {
    return fileURLToPath(import.meta.url) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
}

if (invokedDirectly()) {
  process.exitCode = await main(process.argv.slice(2));
}
