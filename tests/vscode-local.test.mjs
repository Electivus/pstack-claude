import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadModels } from "../tools/generate.mjs";
import { PLUGIN } from "../tools/plugin.mjs";
import {
  roleSkills,
  RUNTIMES,
  validateVSCodeLocalPackage,
  VSCODE_MANIFESTS,
  VSCODE_ROUTING_BUDGET,
  VSCODE_ROUTING_RULE,
  vscodeLocalModelNamesSection,
} from "../tools/runtimes.mjs";
import { mappingCoverage } from "./mapping-coverage.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const vscode = RUNTIMES.find((runtime) => runtime.name === "VS Code Local agent");
const models = loadModels();
const inTree = (rel) => existsSync(join(repoRoot, rel));
const readTree = (rel) => readFileSync(join(repoRoot, rel), "utf8");

const manifest = JSON.parse(readTree(`${PLUGIN}/.claude-plugin/plugin.json`));
const RULE = `${PLUGIN}/${VSCODE_ROUTING_RULE}`;
const rule = readTree(RULE);
const mapping = readTree(vscode.tools);

function check({ files = {}, extra = [], removed = [], manifest: replaced = manifest } = {}) {
  return validateVSCodeLocalPackage({
    manifest: replaced,
    read: (rel) => files[rel] ?? readTree(rel),
    pathExists: (rel) => !removed.includes(rel) && (rel in files || extra.includes(rel) || inTree(rel)),
  });
}

const FRONT_MATTER = /^---\n[\s\S]*?\n---\n/;
const withFrontMatter = (front) => rule.replace(FRONT_MATTER, `---\n${front}\n---\n`);

mappingCoverage(vscode, [
  ["AskUserQuestion", "`AskUserQuestion`"],
  ["subagent_type", "`subagent_type"],
  ["run_in_background", "`run_in_background: true`"],
  ["SendMessage", "`SendMessage`"],
  ["ScheduleWakeup", "`ScheduleWakeup`"],
  ["TodoWrite", "`TodoWrite`"],
  ["TaskCreate", "`TaskCreate`"],
  ["TaskUpdate", "`TaskUpdate`"],
  ["readonly", "`readonly: true`"],
  ["the `Skill` tool", "the `Skill` tool"],
  ["the `Agent` tool", "the `Agent`/`Task` tool"],
  ["`Read`", "`Read`"],
  ["`loop`", "`loop`"],
  ["/loop", "`/loop`"],
  ["plugin-dev", "`plugin-dev:skill-development`"],
  ["CLAUDE.md", "`CLAUDE.md`"],
  ["mcp__", "`mcp__`"],
  ["pstack:poteto-agent", "`pstack:poteto-agent`"],
  ["pstack:comment-sicko", "`pstack:comment-sicko`"],
  ["general-purpose", "`general-purpose`"],
  ["isolation: \"worktree\"", "`isolation: \"worktree\"`"],
  [".claude/skills", "`.claude/skills/`"],
  ["~/.claude/orchestrate", "`~/.claude/orchestrate/`"],
  ["${CLAUDE_CONFIG_DIR:-$HOME/.claude}/projects", "`${CLAUDE_CONFIG_DIR:-$HOME/.claude}/projects/`"],
]);

describe("VS Code Local agent packaging", () => {
  test("the shipped plugin is read through the Claude Code manifest and passes the check", () => {
    expect(vscode.manifest).toBe(`${PLUGIN}/.claude-plugin/plugin.json`);
    expect(() => check()).not.toThrow();
  });

  test("a .plugin/plugin.json in the plugin fails, since VS Code would read it before the Claude Code manifest", () => {
    expect(VSCODE_MANIFESTS.indexOf(".plugin/plugin.json")).toBeLessThan(VSCODE_MANIFESTS.indexOf(".claude-plugin/plugin.json"));
    expect(() => check({ extra: [`${PLUGIN}/.plugin/plugin.json`] })).toThrow(
      `${PLUGIN}/.plugin/plugin.json: VS Code reads this manifest before .claude-plugin/plugin.json`,
    );
  });

  test("a rules entry in the Claude Code manifest fails, since it replaces the rules/ directory VS Code reads by default", () => {
    expect(() => check({ manifest: { ...manifest, rules: "./other" } })).toThrow(
      `a "rules" entry replaces VS Code's default rules/ directory, which holds ${RULE}`,
    );
  });

  test("a missing routing rule fails, since Local sessions would get no routing", () => {
    expect(() => check({ removed: [RULE] })).toThrow(`${RULE} is missing, so VS Code Local sessions get no routing`);
  });

  test("a rules/pstack-routing.instructions.md beside the rule fails, since Copilot sessions in VS Code would load it", () => {
    const twin = `${PLUGIN}/rules/pstack-routing.instructions.md`;
    expect(() => check({ extra: [twin] })).toThrow(`${twin} exists, so Copilot sessions in VS Code would load the Local routing too`);
  });

  test.each([
    ["no applyTo", "name: pstack-routing\ndescription: routing"],
    ["another glob", "name: pstack-routing\ndescription: routing\napplyTo: '**/*.ts'"],
  ])("front matter with %s fails, since VS Code would list the rule instead of attaching it", (_, front) => {
    expect(() => check({ files: { [RULE]: withFrontMatter(front) } })).toThrow("front matter needs applyTo: '**'");
  });

  test("an applyTo line in the body does not count as front matter", () => {
    const text = `${withFrontMatter("name: pstack-routing\ndescription: routing")}\napplyTo: '**'\n`;
    expect(() => check({ files: { [RULE]: text } })).toThrow("front matter needs applyTo: '**'");
  });

  test.each(["`references/vscode-local-tools.md`", "`runSubagent`"])("a rule that drops %s fails", (needle) => {
    expect(rule).toContain(needle);
    expect(() => check({ files: { [RULE]: rule.replaceAll(needle, "x") } })).toThrow(`${RULE}: must name ${needle}`);
  });

  test("a rule over the byte budget fails with its size", () => {
    const padded = `${rule}${"x".repeat(VSCODE_ROUTING_BUDGET)}\n`;
    expect(() => check({ files: { [RULE]: padded } })).toThrow(`${Buffer.byteLength(padded)} bytes; Local attaches it to every request`);
  });
});

describe("the routing rule", () => {
  test("is a Markdown file that fits 3000 bytes, since Local attaches it to every request", () => {
    expect(RULE.endsWith("/rules/pstack-routing.md")).toBe(true);
    expect(Buffer.byteLength(rule)).toBeLessThanOrEqual(3000);
    expect(VSCODE_ROUTING_BUDGET).toBe(3000);
  });

  test("scopes itself to the runSubagent session before its mandate starts", () => {
    const body = rule.replace(FRONT_MATTER, "");
    const intro = body.slice(0, body.indexOf("<EXTREMELY_IMPORTANT>"));
    expect(intro).toContain("`runSubagent`");
    expect(intro).toContain("ignore it");
  });

  test("names the mapping this runtime ships, and that file exists", () => {
    expect(rule).toContain(`\`references/${vscode.mapping}\``);
    expect(inTree(vscode.tools)).toBe(true);
  });

  test("names only skills that exist, and dispatches agents by their bare names", () => {
    const direct = rule.match(/^When the intent is already specific.*$/m)[0];
    const skills = [...direct.matchAll(/`([a-z-]+)`/g)].map(([, name]) => name);
    expect(skills).toContain("architect");
    for (const name of ["poteto-mode", ...skills]) expect(inTree(`${PLUGIN}/skills/${name}/SKILL.md`)).toBe(true);
    expect(rule).toContain('agentName: "poteto-agent"');
    expect(rule).not.toContain("pstack:");
  });
});

describe("vscode-local-tools.md", () => {
  test("passes plugin agents by their bare names, and says to drop the prefix", () => {
    for (const agent of ["poteto-agent", "comment-sicko", "thermo-nuclear-review-subagent", "thermo-nuclear-code-quality-review-subagent"]) {
      expect(mapping).toContain(`agentName: "${agent}"`);
    }
    expect(mapping).not.toContain('agentName: "pstack:');
    expect(mapping).toContain("drop the `pstack:` prefix");
  });

  test("tracks tasks with manage_todo_list and falls back to the todo.md checklist", () => {
    expect(mapping).toContain("`manage_todo_list`");
    expect(mapping).toContain("`todo.md` checklist");
  });

  test("sends a Copilot session in VS Code to the Copilot mapping", () => {
    expect(mapping).toContain("[copilot-tools.md](copilot-tools.md)");
  });
});

describe("the two VS Code session types", () => {
  const copilotMapping = readTree(RUNTIMES.find((runtime) => runtime.name === "GitHub Copilot").tools);
  const setup = readTree(`${PLUGIN}/skills/setup-pstack/references/runtimes.md`);
  const sheet = mapping.match(/`(~\/\.copilot\/instructions\/[^`]+)`/)?.[1];

  test("each mapping sends a reader in the other session type to the other mapping", () => {
    expect(copilotMapping).toContain("`runSubagent`");
    expect(copilotMapping).toContain(`[${vscode.mapping}](${vscode.mapping})`);
    expect(mapping).toContain("`task`, `skill`, and `view`");
    expect(mapping).toContain("[copilot-tools.md](copilot-tools.md)");
  });

  test("setup-pstack lists the Local sheet in its table and writes it in its section, at the path the mapping names", () => {
    expect(sheet).toBe("~/.copilot/instructions/pstack-models-vscode-local.instructions.md");
    expect(setup).toContain(`| VS Code Local agent | \`${sheet}\` |`);
    expect(setup).toContain(`\`<home>/${sheet.slice(2)}\``);
  });

  test("setup-pstack tells the Local agent not to run the Copilot sheet checker on a Local sheet", () => {
    const local = setup.slice(setup.indexOf("## VS Code Local agent"), setup.indexOf("## Muse"));
    expect(local).toContain("Do not run `check-sheet.sh`");
    expect(local).toContain("pstack-list-models");
  });
});

describe("vscode-local-tools.md Model names", () => {
  const section = vscodeLocalModelNamesSection(models);

  test("names no Claude alias and ships no default model", () => {
    expect(section).not.toMatch(/`(?:opus|fable|sonnet|haiku)`/);
    expect(section).toContain("ships no default models");
    expect(section).toContain("`Model Name (vendor)`");
  });

  test("names the sheet, the runSubagent field, the refusal rule, and every skill that dispatches on a role model", () => {
    expect(section).toContain("`~/.copilot/instructions/pstack-models-vscode-local.instructions.md`");
    expect(section).toContain("`runSubagent`'s `model`");
    expect(section).toContain("rerun that call without `model`");
    expect(section).toContain("never substitute");
    for (const skill of roleSkills(models)) expect(section).toContain(`\`${skill}\``);
  });

  test("tells a reader that Claude Code's sheet does not apply", () => {
    expect(section).toContain("is Claude Code's sheet");
  });

  test("is the section the mapping file carries", () => {
    expect(mapping).toContain(section);
  });
});
