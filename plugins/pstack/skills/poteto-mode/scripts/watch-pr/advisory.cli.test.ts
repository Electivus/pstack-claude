import { afterEach, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directories: string[] = [];
afterEach(() => {
  for (const dir of directories.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

interface Protection {
  readonly ruleset: readonly string[] | "fails";
  readonly classic: readonly string[] | "fails";
}

function watchBlockedPrWithBuildPending(
  protection: Protection,
  extra: readonly string[]
) {
  const dir = mkdtempSync(join(tmpdir(), "watch-advisory-"));
  directories.push(dir);
  const bin = join(dir, "bin");
  mkdirSync(bin);
  const gh = join(bin, "gh");
  writeFileSync(
    gh,
    `#!${process.execPath}
const args = process.argv.slice(2);
const protection = JSON.parse(process.env.WATCH_PROTECTION);
const has = (text) => args.some((arg) => arg.includes(text));
const fail = (stderr) => { console.error(stderr); process.exit(1); };
const commits = (commit) => ({ data: { repository: { pullRequest: { baseRefName: 'main', commits: { nodes: [{ commit }] } } } } });
let value;
if (has('query PullRequestFacts')) {
  value = { data: { repository: { pullRequest: { headRefOid: 'head', baseRef: { target: { oid: 'base' } }, mergeable: 'MERGEABLE', mergeStateStatus: 'BLOCKED', reviewDecision: 'APPROVED', headRefName: 'feature', baseRefName: 'main', state: 'OPEN', mergedAt: null, isDraft: false } } } };
} else if (args[0] === 'pr' && args[1] === 'checks') {
  value = [
    { name: 'cla', state: 'SUCCESS', bucket: 'pass', description: '', link: '', workflow: '' },
    { name: 'build', state: 'IN_PROGRESS', bucket: 'pending', description: '', link: '', workflow: '' },
  ];
} else if (has('query PrRequiredChecks')) {
  value = commits({ statusCheckRollup: { contexts: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [
    { __typename: 'CheckRun', name: 'cla', isRequired: true },
    { __typename: 'CheckRun', name: 'build', isRequired: false },
  ] } } });
} else if (has('query ReviewThreads')) {
  value = { data: { repository: { pullRequest: { reviewThreads: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } } } } };
} else if (has('query PrCommitStatuses')) {
  value = { data: { repository: { pullRequest: { commits: { nodes: [{ commit: { oid: 'head', statusCheckRollup: { state: 'PENDING' } } }] } } } } };
} else if (args[0] === 'api' && args[1].startsWith('repos/owner/repo/rules/branches/main')) {
  if (protection.ruleset === 'fails') fail('gh: Forbidden (HTTP 403)');
  value = [{ type: 'required_status_checks', parameters: { required_status_checks: protection.ruleset.map((context) => ({ context })) } }];
} else if (args[0] === 'api' && args[1] === 'repos/owner/repo/branches/main') {
  if (protection.classic === 'fails') fail('gh: Not Found (HTTP 404)');
  value = { name: 'main', protected: true, protection: { required_status_checks: { contexts: protection.classic } } };
} else { throw new Error('unexpected fixture command: ' + JSON.stringify(args)); }
console.log(JSON.stringify(value));
`
  );
  chmodSync(gh, 0o755);
  const entry = join(dir, "entry.ts");
  writeFileSync(
    entry,
    `import { main } from ${JSON.stringify(join(import.meta.dir, "cli.ts"))}; process.exitCode = await main(process.argv.slice(2));\n`
  );
  const result = spawnSync(
    process.execPath,
    [entry, "--owner", "owner", "--repo", "repo", "--pr", "1", ...extra],
    {
      encoding: "utf8",
      timeout: 6000,
      env: {
        PATH: `${bin}:${process.env.PATH}`,
        WATCH_PROTECTION: JSON.stringify(protection),
      },
    }
  );
  const lines = result.stdout.trim().split("\n");
  return {
    status: result.status,
    stderr: result.stderr,
    last: JSON.parse(lines[lines.length - 1] ?? "null") as unknown,
  };
}

const timedWatch = ["--interval", "0.05", "--timeout", "1"];

it("waits on a pending check while a required context has not reported", () => {
  for (const protection of [
    { ruleset: [], classic: ["cla", "gate"] },
    { ruleset: ["gate"], classic: [] },
  ]) {
    const result = watchBlockedPrWithBuildPending(protection, timedWatch);
    expect(result.stderr).toBe("");
    expect(result.last).toMatchObject({
      kind: "TIMEOUT",
      exitCode: 5,
      reason: { kind: "pending-checks", pending: [{ name: "build" }] },
    });
    expect(JSON.stringify(result.last)).not.toContain("advisory");
  }
});

it("does not label a check advisory while a required context has not reported", () => {
  const result = watchBlockedPrWithBuildPending(
    { ruleset: [], classic: ["cla", "gate"] },
    ["--status-only"]
  );
  expect(result.status).toBe(0);
  expect(JSON.stringify(result.last)).not.toContain("advisory");
});

it("counts every pending check as required when the required contexts cannot be read", () => {
  for (const protection of [
    { ruleset: "fails", classic: [] },
    { ruleset: [], classic: "fails" },
  ] as const) {
    const result = watchBlockedPrWithBuildPending(protection, timedWatch);
    expect(result.last).toMatchObject({
      kind: "TIMEOUT",
      exitCode: 5,
      reason: { kind: "pending-checks" },
    });
  }
});

it("still names the advisory set once every required context has reported", () => {
  const result = watchBlockedPrWithBuildPending(
    { ruleset: [], classic: ["cla"] },
    timedWatch
  );
  expect(result.last).toMatchObject({
    kind: "BLOCKER",
    exitCode: 6,
    blocker: { kind: "merge-gate", reason: "merge-blocked" },
  });
  const status = watchBlockedPrWithBuildPending(
    { ruleset: [], classic: ["cla"] },
    ["--status-only"]
  );
  expect(status.last).toMatchObject({
    rows: [{ ci: { pending: [{ name: "build", advisory: true }] } }],
  });
});
