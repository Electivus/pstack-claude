#!/usr/bin/env node
// Usage: node probe-plugin.mjs <out-dir> [--src <plugin dir>] [--mark <file in plugin>=<word>]... [--no-wrap]
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const here = dirname(fileURLToPath(import.meta.url));
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    src: { type: "string", default: resolve(here, "../../../../plugins/pstack") },
    mark: { type: "string", multiple: true, default: [] },
    "no-wrap": { type: "boolean", default: false },
  },
});
if (positionals.length !== 1) {
  console.error("usage: probe-plugin.mjs <out-dir> [--src <plugin dir>] [--mark <file>=<word>]... [--no-wrap]");
  process.exit(2);
}

const out = resolve(positionals[0]);
if (existsSync(out)) {
  console.error(`${out} exists. A Copilot session keeps its copy per source path, so give each probe a new path.`);
  process.exit(2);
}
const plugin = join(out, "plugin");
const log = join(out, "hooks.jsonl");
const wrapper = join(out, "hook-wrapper.mjs");
mkdirSync(out, { recursive: true });
cpSync(resolve(values.src), plugin, { recursive: true, filter: (p) => !p.includes("/node_modules") });
cpSync(join(here, "hook-wrapper.mjs"), wrapper);
writeFileSync(log, "");

const wrapped = [];
if (!values["no-wrap"]) {
  for (const name of readdirSync(join(plugin, "hooks")).filter((f) => f.endsWith(".json"))) {
    const file = join(plugin, "hooks", name);
    const config = JSON.parse(readFileSync(file, "utf8"));
    for (const groups of Object.values(config.hooks ?? {})) {
      for (const hook of groups.flatMap((g) => g.hooks ?? [])) {
        if (hook.type !== "command") continue;
        for (const [field, shell] of [["command", ""], ["powershell", " powershell"]]) {
          if (!hook[field]) continue;
          const b64 = Buffer.from(hook[field]).toString("base64");
          hook[field] = `node "${wrapper}" "${log}" ${b64}${shell}`;
          wrapped.push(`hooks/${name}`);
        }
      }
    }
    writeFileSync(file, JSON.stringify(config, null, 2) + "\n");
  }
}

const marks = {};
for (const spec of values.mark) {
  const at = spec.lastIndexOf("=");
  const [rel, word] = [spec.slice(0, at), spec.slice(at + 1)];
  const file = join(plugin, rel);
  if (at < 1 || !word || !existsSync(file)) {
    console.error(`bad --mark ${spec}: need <existing file in plugin>=<word>`);
    process.exit(2);
  }
  appendFileSync(file, `\n\nVerification marker: ${word}\n`);
  marks[rel] = word;
}

console.log(JSON.stringify({ plugin, log, wrapped: [...new Set(wrapped)], marks }, null, 2));
