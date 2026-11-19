import { describe, expect, it } from "bun:test";
import {
  advisoryReader,
  parseRequiredPage,
  parseRulesetContexts,
  readRequiredNames,
} from "./advisory.ts";
import { WatchDeadline } from "./deadline.ts";
import {
  failedCheck,
  fakeReader,
  passingCheck,
  pendingCheck,
} from "./fakes.test-helper.ts";
import {
  classifyPr,
  readSnapshot,
  runSimple,
  selectTierMajorStackDecision,
} from "./policy.ts";
import { renderJson, renderPretty } from "./render.ts";
import type { Check, PollingOptions, PrContext } from "./types.ts";
import { parsePrNumber } from "./types.ts";

const context: PrContext = {
  owner: "owner",
  repo: "repo",
  number: parsePrNumber(1),
};
const advisory = (name: string): Check => ({
  ...pendingCheck(name),
  advisory: true,
});
const polling: PollingOptions = {
  interval: 10,
  sweepInterval: 300,
  timeout: 0,
  maxQueryErrors: 5,
  allowDraft: false,
};
const snapshot = (
  checks: readonly Check[],
  facts: Parameters<typeof fakeReader>[0] = {}
) =>
  readSnapshot({
    reader: fakeReader({ ...facts, fastPath: { kind: "checks", checks } }),
    context,
    pendingHistory: "include",
    allowDraft: false,
  });

describe("advisoryReader", () => {
  it("marks a pending check that is not required and leaves a required one alone", async () => {
    const reader = advisoryReader(
      fakeReader({
        fastPath: {
          kind: "checks",
          checks: [
            passingCheck("build"),
            pendingCheck("test"),
            pendingCheck("codex"),
          ],
        },
      }),
      async () => new Set(["build", "test"])
    );
    const fast = await reader.checksFastPath(context);
    expect(fast.kind === "checks" && fast.checks).toEqual([
      passingCheck("build"),
      pendingCheck("test"),
      advisory("codex"),
    ]);
  });

  it("marks rollup pages the same way", async () => {
    const reader = advisoryReader(
      fakeReader({
        rollupPages: [
          {
            kind: "contexts",
            checks: [pendingCheck("codex")],
            endCursor: null,
          },
        ],
      }),
      async () => new Set(["build"])
    );
    expect(await reader.checkRollupPage(context, null)).toEqual({
      kind: "contexts",
      checks: [advisory("codex")],
      endCursor: null,
    });
  });

  it("treats every pending check as required when requiredness is unknown or names a check gh pr checks did not list", async () => {
    for (const lookup of [
      async () => null,
      async () => new Set<string>(),
      async () => new Set(["build"]),
    ]) {
      const reader = advisoryReader(
        fakeReader({
          fastPath: { kind: "checks", checks: [pendingCheck("codex")] },
        }),
        lookup
      );
      const fast = await reader.checksFastPath(context);
      expect(fast.kind === "checks" && fast.checks).toEqual([
        pendingCheck("codex"),
      ]);
    }
  });

  it("does not look up requiredness when nothing is pending", async () => {
    let lookups = 0;
    const reader = advisoryReader(
      fakeReader({
        fastPath: {
          kind: "checks",
          checks: [passingCheck(), failedCheck("x")],
        },
      }),
      async () => {
        lookups += 1;
        return new Set<string>();
      }
    );
    await reader.checksFastPath(context);
    expect(lookups).toBe(0);
  });
});

const rulesetRule = (contexts: readonly string[]) => ({
  type: "required_status_checks",
  parameters: {
    required_status_checks: contexts.map((context) => ({ context })),
  },
});
const protection =
  (rulesets: readonly string[], classic: readonly string[]) =>
  async (path: string) =>
    path.startsWith("rules/branches/main?")
      ? [rulesetRule(rulesets)]
      : { protection: { required_status_checks: { contexts: classic } } };

describe("readRequiredNames", () => {
  const node = (name: string, isRequired: boolean) => ({
    __typename: "CheckRun",
    name,
    isRequired,
  });
  const page = (nodes: unknown[], endCursor: string | null) => ({
    data: {
      repository: {
        pullRequest: {
          baseRefName: "main",
          commits: {
            nodes: [
              {
                commit: {
                  statusCheckRollup: {
                    contexts: {
                      pageInfo: {
                        hasNextPage: endCursor !== null,
                        endCursor,
                      },
                      nodes,
                    },
                  },
                },
              },
            ],
          },
        },
      },
    },
  });

  it("reads required names for CheckRun and StatusContext nodes", () => {
    expect(
      parseRequiredPage(
        page(
          [
            node("build", true),
            node("codex", false),
            {
              __typename: "StatusContext",
              context: "legacy",
              isRequired: true,
            },
          ],
          null
        )
      )
    ).toEqual({
      base: "main",
      required: ["build", "legacy"],
      reported: ["build", "codex", "legacy"],
      endCursor: null,
    });
  });

  it("pages through every context", async () => {
    const pages = [
      page([node("a", true)], "c1"),
      page([node("b", true), node("c", false)], null),
    ];
    const cursors: (string | null)[] = [];
    const names = await readRequiredNames(
      async (after) => {
        cursors.push(after);
        return pages[cursors.length - 1];
      },
      protection([], [])
    );
    expect([...(names ?? [])].sort()).toEqual(["a", "b"]);
    expect(cursors).toEqual([null, "c1"]);
  });

  it("returns null when the head has no rollup", async () => {
    const empty = {
      data: {
        repository: {
          pullRequest: {
            baseRefName: "main",
            commits: { nodes: [{ commit: { statusCheckRollup: null } }] },
          },
        },
      },
    };
    expect(
      await readRequiredNames(async () => empty, protection([], []))
    ).toBeNull();
  });

  it("adds the contexts rulesets and classic protection require", async () => {
    const rollup = page(
      [node("build", true), node("gate", false), node("lint", false)],
      null
    );
    const names = await readRequiredNames(
      async () => rollup,
      protection(["gate"], ["lint"])
    );
    expect([...(names ?? [])].sort()).toEqual(["build", "gate", "lint"]);
  });

  it("returns null while a required context has not reported", async () => {
    const rollup = page([node("build", true), node("codex", false)], null);
    for (const [rulesets, classic] of [
      [["gate"], []],
      [[], ["gate"]],
    ])
      expect(
        await readRequiredNames(
          async () => rollup,
          protection(rulesets, classic)
        )
      ).toBeNull();
  });

  it("reads required_status_checks rules, gives up on rules gating on unnamed checks, and refuses a full page", () => {
    expect(
      parseRulesetContexts([
        { type: "deletion" },
        rulesetRule(["gate", "lint"]),
      ])
    ).toEqual(["gate", "lint"]);
    expect(
      parseRulesetContexts([
        rulesetRule(["gate"]),
        { type: "code_scanning", parameters: { code_scanning_tools: [] } },
      ])
    ).toBeNull();
    expect(() =>
      parseRulesetContexts(Array.from({ length: 100 }, () => rulesetRule([])))
    ).toThrow("may be truncated");
  });
});

describe("advisory wait", () => {
  it("names the advisory statuses when every pending check is advisory", async () => {
    const row = await snapshot([passingCheck("build"), advisory("codex")]);
    expect(classifyPr(row)).toMatchObject({
      kind: "waiting",
      reason: { kind: "advisory-pending", pending: [{ name: "codex" }] },
    });
  });

  it("keeps a required pending check as a pending-checks wait", async () => {
    const row = await snapshot([pendingCheck("build"), advisory("codex")]);
    expect(classifyPr(row)).toMatchObject({
      reason: { kind: "pending-checks", pending: [{}, {}] },
    });
  });

  it("reports a branch-protection block at once instead of waiting on an advisory status", async () => {
    const row = await snapshot([advisory("codex")], {
      facts: { mergeStateStatus: "BLOCKED" },
      commitRollups: [{ oid: "head", state: "PENDING" }],
    });
    expect(classifyPr(row)).toMatchObject({
      kind: "blocker",
      blocker: { kind: "merge-gate", reason: "merge-blocked" },
    });
  });

  it("still defers a branch-protection block while a required check is pending", async () => {
    const row = await snapshot([pendingCheck("build")], {
      facts: { mergeStateStatus: "BLOCKED" },
      commitRollups: [{ oid: "head", state: "PENDING" }],
    });
    expect(classifyPr(row)).toMatchObject({ kind: "waiting" });
  });

  it("lets a required wait upstack outrank an advisory wait at the bottom", async () => {
    const bottom = await snapshot([advisory("codex")]);
    const top = await readSnapshot({
      reader: fakeReader({
        current: { ...context, number: parsePrNumber(2) },
        fastPath: { kind: "checks", checks: [pendingCheck("build")] },
      }),
      context: { ...context, number: parsePrNumber(2) },
      pendingHistory: "include",
      allowDraft: false,
    });
    expect(selectTierMajorStackDecision([bottom, top])).toMatchObject({
      kind: "waiting",
      frontier: { number: 2 },
      reason: { kind: "pending-checks" },
    });
  });

  it("times out with exit 5 and the advisory-only pending set, not READY", async () => {
    let now = 0;
    const verdict = await runSimple({
      dependencies: {
        reader: fakeReader({
          fastPath: {
            kind: "checks",
            checks: [passingCheck("build"), advisory("codex")],
          },
        }),
        clock: {
          now: () => now,
          observedAt: () => "2026-07-26T00:00:00.000Z",
          sleep: async (seconds) => {
            now += seconds;
          },
        },
        emit: () => {},
        deadline: new WatchDeadline(25, () => now),
      },
      contexts: [context],
      mode: "single",
      statusOnly: false,
      options: { ...polling, timeout: 25 },
    });
    expect(verdict).toMatchObject({
      kind: "TIMEOUT",
      exitCode: 5,
      reason: { kind: "advisory-pending", pending: [{ name: "codex" }] },
    });
    expect(renderPretty(verdict)).toBe(
      "TIMEOUT: required checks green; only advisory statuses pending: codex\n"
    );
    expect(JSON.parse(renderJson(verdict)).reason.kind).toBe(
      "advisory-pending"
    );
  });

  it("words the WAITING line and status cell for advisory-only pending", async () => {
    const row = await snapshot([advisory("codex"), advisory("sonar")]);
    const decision = classifyPr(row);
    if (decision.kind !== "waiting") throw new Error("expected a wait");
    expect(
      renderPretty({
        schemaVersion: 1,
        sequence: 1,
        observedAt: "t",
        mode: "single",
        kind: "WAITING",
        terminal: false,
        frontier: decision.frontier,
        reason: decision.reason,
      })
    ).toBe(
      "WAITING: frontier=#1; required checks green; only advisory statuses pending: codex, sonar\n"
    );
    expect(
      renderPretty({
        schemaVersion: 1,
        sequence: 1,
        observedAt: "t",
        mode: "stack",
        kind: "STATUS",
        terminal: false,
        reason: "poll",
        rows: [row],
      })
    ).toContain("required green, 2 advisory pending");
  });
});
