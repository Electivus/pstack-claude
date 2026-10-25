import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseValue, stateKey } from "../plugins/pstack/skills/statechart/scripts/lib.mjs";

const scripts = join(import.meta.dir, "../plugins/pstack/skills/statechart/scripts");

describe("statechart keeps TLA+ strings intact", () => {
  test("parseValue decodes string escapes, so distinct strings keep distinct state keys", () => {
    expect(parseValue(String.raw`"\n"`)).toBe("\n");
    expect(parseValue(String.raw`"a\tb\rc\fd"`)).toBe("a\tb\rc\fd");
    expect(parseValue(String.raw`"say \"hi\" \\ bye"`)).toBe('say "hi" \\ bye');
    expect(stateKey({ x: parseValue(String.raw`"\n"`) })).not.toBe(stateKey({ x: parseValue('"n"') }));
  });

  test("the config TLC checks keeps whitespace and comment markers inside a string constant", () => {
    const dir = mkdtempSync(join(tmpdir(), "statechart-cfg-"));
    try {
      const seen = join(dir, "seen.cfg");
      const java = join(dir, "java");
      writeFileSync(
        java,
        '#!/bin/sh\nwhile [ $# -gt 0 ]; do\n  if [ "$1" = -config ]; then cp "$2" "$SEEN"; fi\n  shift\ndone\nexit 1\n',
      );
      chmodSync(java, 0o755);
      writeFileSync(join(dir, "tla2tools.jar"), "");
      writeFileSync(join(dir, "Pay.tla"), "---- MODULE Pay ----\n====\n");
      writeFileSync(
        join(dir, "Pay.cfg"),
        'SPECIFICATION Spec\nCONSTANT Input = "a  b \\* (* c *)"\n\\* a comment\nINVARIANT Safe\n',
      );
      writeFileSync(join(dir, "Pay.map.mjs"), "export default {};\n");
      const run = spawnSync("node", [join(scripts, "statechart.mjs"), "from-spec", "Pay.tla"], {
        cwd: dir,
        encoding: "utf8",
        env: { ...process.env, TLA2TOOLS: join(dir, "tla2tools.jar"), JAVA: java, SEEN: seen },
      });
      expect(run.status).toBe(2);
      const cfg = readFileSync(seen, "utf8");
      expect(cfg).toContain('CONSTANT Input = "a  b \\* (* c *)"\n');
      expect(cfg).not.toContain("a comment");
      expect(cfg).toContain("INVARIANT Safe\nCONSTRAINT Safe\n");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
