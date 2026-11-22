import { afterEach, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../plugins/pstack/skills/poteto-mode/scripts/codex-seat.mjs", import.meta.url));
const made = [];
afterEach(() => { for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const posix = process.platform === "win32" ? test.skip : test;

// A fake `codex` first on PATH. It records its argv and stdin, writes FAKE_ANSWER
// to the file after -o, and exits with FAKE_EXIT.
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "pstack-codex-seat-"));
  made.push(root);
  const bin = join(root, "bin");
  mkdirSync(bin);
  const record = join(root, "record.json");
  const fake = join(bin, "codex");
  writeFileSync(
    fake,
    `#!${process.execPath}
const fs = require("node:fs");
const argv = process.argv.slice(2);
fs.writeFileSync(process.env.FAKE_RECORD, JSON.stringify({ argv, stdin: fs.readFileSync(0, "utf8") }));
const out = argv[argv.indexOf("-o") + 1];
fs.writeFileSync(out, process.env.FAKE_ANSWER ?? "");
console.log("progress line");
process.exit(Number(process.env.FAKE_EXIT ?? 0));
`,
  );
  chmodSync(fake, 0o755);
  const prompt = join(root, "prompt.md");
  writeFileSync(prompt, "Read worker.md before anything else.\nJudge this.\n");
  const out = join(root, "out.md");
  const run = (seat, { flags = [], env = {}, path = bin, omit = [], script = cli } = {}) => {
    const base = { "--cd": root, "--prompt": prompt, "--out": out };
    const args = [script, seat];
    for (const [flag, value] of Object.entries(base)) if (!omit.includes(flag)) args.push(flag, value);
    args.push(...flags);
    const result = spawnSync(process.execPath, args, {
      encoding: "utf8",
      env: { PATH: path, FAKE_RECORD: record, FAKE_ANSWER: "the answer", ...env },
    });
    const called = existsSync(record);
    return { ...result, called, seen: called ? JSON.parse(readFileSync(record, "utf8")) : null };
  };
  return { root, out, prompt, run };
}
const after = (argv, flag) => argv[argv.indexOf(flag) + 1];

posix("runs read-only by default, with the seat's answer in --out", () => {
  const { run, out, root } = fixture();
  const result = run("codex");
  expect(result.status).toBe(0);
  expect(result.stdout).toBe(`codex seat ok: ${out}\n`);
  expect(readFileSync(out, "utf8")).toBe("the answer");
  expect(result.seen.argv[0]).toBe("exec");
  expect(after(result.seen.argv, "-s")).toBe("read-only");
  expect(after(result.seen.argv, "-C")).toBe(root);
  expect(after(result.seen.argv, "-o")).toBe(out);
  expect(result.seen.argv).toContain("--skip-git-repo-check");
  expect(after(result.seen.argv, "--color")).toBe("never");
  expect(readFileSync(`${out}.log`, "utf8")).toContain("progress line");
});

// The plugin cache or a worktree under /tmp can reach the script through a
// symlink, which node leaves in argv[1].
posix("runs when its path crosses a symlink", () => {
  const { run, root, out } = fixture();
  const linked = join(root, "linked");
  symlinkSync(join(cli, ".."), linked);
  const result = run("codex", { script: join(linked, "codex-seat.mjs") });
  expect(result.status).toBe(0);
  expect(result.stdout).toBe(`codex seat ok: ${out}\n`);
  expect(result.called).toBe(true);
});

posix("--out on the prompt file exits 2 and keeps the prompt", () => {
  const { run, prompt } = fixture();
  const before = readFileSync(prompt, "utf8");
  const result = run("codex", { flags: ["--out", prompt] });
  expect(result.status).toBe(2);
  expect(result.called).toBe(false);
  expect(readFileSync(prompt, "utf8")).toBe(before);
});

posix("--write gives workspace-write", () => {
  const result = fixture().run("codex", { flags: ["--write"] });
  expect(result.status).toBe(0);
  expect(after(result.seen.argv, "-s")).toBe("workspace-write");
});

posix("a seat without --network or --add-dir asks for neither", () => {
  const result = fixture().run("codex", { flags: ["--write"] });
  expect(result.status).toBe(0);
  expect(result.seen.argv).not.toContain("--add-dir");
  expect(result.seen.argv).not.toContain("--disable");
  expect(result.seen.argv.join(" ")).not.toContain("network_access");
});

posix("--network turns on network access and turns off Codex's network proxy", () => {
  const result = fixture().run("codex", { flags: ["--write", "--network"] });
  expect(result.status).toBe(0);
  expect(after(result.seen.argv, "-s")).toBe("workspace-write");
  expect(result.seen.argv).toContain("sandbox_workspace_write.network_access=true");
  expect(after(result.seen.argv, "--disable")).toBe("network_proxy");
});

posix("each --add-dir reaches codex as a writable root", () => {
  const result = fixture().run("codex", { flags: ["--write", "--add-dir", "/a", "--add-dir", "/b"] });
  expect(result.status).toBe(0);
  const dirs = result.seen.argv.flatMap((arg, i, argv) => (arg === "--add-dir" ? [argv[i + 1]] : []));
  expect(dirs).toEqual(["/a", "/b"]);
});

posix.each([[["--network"]], [["--add-dir", "/a"]]])("%p without --write exits 2 and never runs codex", (flags) => {
  const result = fixture().run("codex", { flags });
  expect(result.status).toBe(2);
  expect(result.called).toBe(false);
});

posix("codex/<model> @high passes the model and the effort", () => {
  const result = fixture().run("codex/some-model.5 @high");
  expect(result.status).toBe(0);
  expect(after(result.seen.argv, "-m")).toBe("some-model.5");
  expect(after(result.seen.argv, "-c")).toBe('model_reasoning_effort="high"');
});

posix("bare codex passes neither a model nor an effort", () => {
  const { argv } = fixture().run("codex").seen;
  expect(argv).not.toContain("-m");
  expect(argv).not.toContain("-c");
});

posix("codex @xhigh passes the effort and no model", () => {
  const { argv } = fixture().run("codex @xhigh").seen;
  expect(argv).not.toContain("-m");
  expect(after(argv, "-c")).toBe('model_reasoning_effort="xhigh"');
});

posix("the prompt file reaches codex on stdin", () => {
  const { run, prompt } = fixture();
  expect(run("codex").seen.stdin).toBe(readFileSync(prompt, "utf8"));
});

posix("codex's non-zero exit code passes through", () => {
  const { run, out } = fixture();
  const result = run("codex", { env: { FAKE_EXIT: "7" } });
  expect(result.status).toBe(7);
  expect(result.stderr).toBe(`codex seat failed: exit 7, log ${out}.log\n`);
  expect(result.stdout).not.toContain("codex seat ok");
});

posix("exit 0 with an empty --out file is a failure", () => {
  const { run, out } = fixture();
  const result = run("codex", { env: { FAKE_ANSWER: "" } });
  expect(result.status).toBe(1);
  expect(result.stderr).toBe(`codex seat failed: exit 1, log ${out}.log\n`);
  expect(result.stdout).not.toContain("codex seat ok");
});

posix("no codex on PATH exits 127", () => {
  const { run, root } = fixture();
  const empty = join(root, "empty");
  mkdirSync(empty);
  const result = run("codex", { path: empty });
  expect(result.status).toBe(127);
  expect(result.stderr).toBe("codex seat unavailable: codex is not on PATH\n");
});

for (const seat of ["opus", "codex/", "codex/x @bogus", "codex/X", "codex @max extra", "gpt"]) {
  posix(`malformed seat ${JSON.stringify(seat)} exits 2 and never runs codex`, () => {
    const result = fixture().run(seat);
    expect(result.status).toBe(2);
    expect(result.stderr.trim().split("\n")).toHaveLength(1);
    expect(result.called).toBe(false);
  });
}

for (const flag of ["--cd", "--prompt", "--out"]) {
  posix(`a missing ${flag} exits 2 and never runs codex`, () => {
    const result = fixture().run("codex", { omit: [flag] });
    expect(result.status).toBe(2);
    expect(result.called).toBe(false);
  });
}

posix("an unknown flag exits 2 and never runs codex", () => {
  const result = fixture().run("codex", { flags: ["--bogus"] });
  expect(result.status).toBe(2);
  expect(result.called).toBe(false);
});
