import { describe, expect, it } from "bun:test";
import { parsePrNumber } from "./types.ts";
import {
  GhShippingService,
  cancelPending,
  inspectLanding,
  parseIntendedIssues,
  parseLandingRecord,
  refusals,
  type LandingRecord,
  type ShippingService,
} from "./shipping.ts";
import { fakeGitHub } from "./shipping.test-helper.ts";

const context = { owner: "owner", repo: "repo", number: parsePrNumber(1) };
const empty: LandingRecord = {
  revision: {
    context,
    headRefOid: "head",
    baseRefName: "main",
    baseRefOid: "base",
  },
  pullRequestId: "pr-id",
  state: "OPEN",
  pending: { autoMerge: false, queueEntryId: null },
  mergeCommitOid: null,
};

function fixture(pending: LandingRecord["pending"]) {
  let current: LandingRecord = { ...empty, pending };
  const mutations: string[] = [];
  const service: ShippingService = {
    async inspect() {
      return current;
    },
    async readContent() {
      return { title: "Title", body: "", closingIssues: [] };
    },
    async disableAutoMerge(id) {
      expect(id).toBe("pr-id");
      mutations.push("disable");
      current = {
        ...current,
        pending: { ...current.pending, autoMerge: false },
      };
    },
    async dequeue(id) {
      expect(id).toBe("pr-id");
      mutations.push("dequeue");
      current = {
        ...current,
        pending: { ...current.pending, queueEntryId: null },
      };
    },
  };
  return {
    service,
    mutations,
    read: () => current,
    set: (value: LandingRecord) => {
      current = value;
    },
  };
}

describe("pending merge cancellation", () => {
  for (const pending of [
    { autoMerge: false, queueEntryId: null },
    { autoMerge: true, queueEntryId: null },
    { autoMerge: false, queueEntryId: "queue-id" },
    { autoMerge: true, queueEntryId: "queue-id" },
  ]) {
    it(`removes ${JSON.stringify(pending)} and reads back a stable open record`, async () => {
      const f = fixture(pending);
      const expected = f.read();
      expect(await cancelPending(f.service, expected)).toEqual({
        kind: "cancelled",
        record: empty,
      });
      expect(f.read().pending).toEqual({
        autoMerge: false,
        queueEntryId: null,
      });
      expect(f.mutations).toEqual([
        ...(pending.autoMerge ? ["disable"] : []),
        ...(pending.queueEntryId ? ["dequeue"] : []),
      ]);
      expect(await cancelPending(f.service, expected)).toEqual({
        kind: "cancelled",
        record: empty,
      });
    });
  }

  it("does not dequeue when disabling auto-merge also removes queue membership", async () => {
    const f = fixture({ autoMerge: true, queueEntryId: "queue-id" });
    const expected = f.read();
    f.service.disableAutoMerge = async () => {
      f.set(empty);
    };
    expect(await cancelPending(f.service, expected)).toEqual({
      kind: "cancelled",
      record: empty,
    });
    expect(f.mutations).toEqual([]);
  });

  for (const change of [
    { revision: { ...empty.revision, headRefOid: "changed" } },
    { revision: { ...empty.revision, baseRefName: "release" } },
    { revision: { ...empty.revision, baseRefOid: "advanced" } },
    { pullRequestId: "different-pr" },
  ]) {
    it(`refuses a stale record before mutation: ${JSON.stringify(change)}`, async () => {
      const f = fixture({ autoMerge: true, queueEntryId: "queue-id" });
      const expected = f.read();
      f.set({ ...expected, ...change });
      expect(await cancelPending(f.service, expected)).toMatchObject({
        kind: "changed",
      });
      expect(f.mutations).toEqual([]);
      expect(f.read().pending).toEqual(expected.pending);
    });
  }

  it("stops if the base moves during cancellation without dequeuing the changed PR", async () => {
    const f = fixture({ autoMerge: true, queueEntryId: "queue-id" });
    const expected = f.read();
    const disable = f.service.disableAutoMerge;
    f.service.disableAutoMerge = async (id) => {
      await disable(id);
      f.set({
        ...f.read(),
        revision: { ...empty.revision, baseRefOid: "advanced" },
      });
    };
    expect(await cancelPending(f.service, expected)).toMatchObject({
      kind: "changed",
    });
    expect(f.mutations).toEqual(["disable"]);
    expect(f.read().pending.queueEntryId).toBe("queue-id");
  });

  it("reports a merge during cancellation instead of permission to rewrite", async () => {
    const f = fixture({ autoMerge: false, queueEntryId: "queue-id" });
    const expected = f.read();
    f.service.dequeue = async () => {
      f.set({ ...empty, state: "MERGED", mergeCommitOid: "merged" });
    };
    expect(await cancelPending(f.service, expected)).toMatchObject({
      kind: "not-open",
      record: { state: "MERGED" },
    });
  });

  it("refuses rearmed pending state on readback", async () => {
    const f = fixture({ autoMerge: false, queueEntryId: "queue-id" });
    const expected = f.read();
    f.service.dequeue = async () => {
      f.set({ ...empty, pending: { autoMerge: true, queueEntryId: null } });
    };
    expect(await cancelPending(f.service, expected)).toMatchObject({
      kind: "still-pending",
    });
  });

  it("reports an unavailable readback and does not continue mutating", async () => {
    const f = fixture({ autoMerge: true, queueEntryId: "queue-id" });
    const expected = f.read();
    let reads = 0;
    f.service.inspect = async () => {
      if (++reads > 1) throw new Error("offline");
      return f.read();
    };
    expect(await cancelPending(f.service, expected)).toEqual({
      kind: "unavailable",
      detail: "offline",
    });
    expect(f.mutations).toEqual(["disable"]);
  });
});

const raw = {
  id: "pr-id",
  state: "OPEN",
  headRefOid: "head",
  baseRefName: "main",
  baseRef: { target: { oid: "base" } },
  autoMergeRequest: null,
  mergeQueueEntry: null,
  mergeCommit: null,
};
const response = (pullRequest: unknown) => ({
  data: { repository: { pullRequest } },
});

describe("shipping GitHub boundary", () => {
  it("reads the current base target instead of the PR's stored base OID", async () => {
    let query = "";
    const service = new GhShippingService(async (args) => {
      query = args.find((arg) => arg.startsWith("query=")) ?? "";
      return response(raw);
    });
    expect(await service.inspect(context)).toMatchObject({
      revision: { baseRefOid: "base" },
    });
    expect(query).toContain("baseRef { target { oid } }");
  });

  it("parses the complete record and distinguishes queue-only pending state", async () => {
    const service = new GhShippingService(async () =>
      response({ ...raw, mergeQueueEntry: { id: "queued" } })
    );
    expect(await service.inspect(context)).toEqual({
      ...empty,
      pending: { autoMerge: false, queueEntryId: "queued" },
    });
  });

  for (const field of [
    "baseRef",
    "autoMergeRequest",
    "mergeQueueEntry",
    "mergeCommit",
  ]) {
    it(`treats missing ${field} as unavailable, never absent`, async () => {
      const missing = Object.fromEntries(
        Object.entries(raw).filter(([name]) => name !== field)
      );
      const service = new GhShippingService(async () => response(missing));
      expect(await inspectLanding(service, context)).toMatchObject({
        kind: "unavailable",
      });
    });
  }

  it("rejects partial GraphQL data when errors exist", async () => {
    const service = new GhShippingService(async () => ({
      ...response(raw),
      errors: [{ message: "denied" }],
    }));
    expect(await inspectLanding(service, context)).toMatchObject({
      kind: "unavailable",
    });
  });

  it("uses separate mutations for both pending mechanisms", async () => {
    const pullRequest = {
      ...raw,
      autoMergeRequest: { enabledAt: "now" },
      mergeQueueEntry: { id: "queue" },
    };
    const service = new GhShippingService(async (args) =>
      fakeGitHub(pullRequest, args)
    );
    const expected = await service.inspect(context);
    expect(await cancelPending(service, expected)).toEqual({
      kind: "cancelled",
      record: empty,
    });
  });

  it("stops before dequeue when the current base moves during readback", async () => {
    const reads = [
      {
        ...raw,
        baseRef: { target: { oid: "base" } },
        autoMergeRequest: { enabledAt: "now" },
        mergeQueueEntry: { id: "queue" },
      },
      {
        ...raw,
        baseRef: { target: { oid: "base" } },
        autoMergeRequest: { enabledAt: "now" },
        mergeQueueEntry: { id: "queue" },
      },
      {
        ...raw,
        baseRef: { target: { oid: "advanced" } },
        autoMergeRequest: null,
        mergeQueueEntry: { id: "queue" },
      },
      {
        ...raw,
        baseRef: { target: { oid: "advanced" } },
        autoMergeRequest: null,
        mergeQueueEntry: null,
      },
    ];
    const mutations: string[] = [];
    const service = new GhShippingService(async (args) => {
      const query = args.find((arg) => arg.startsWith("query=")) ?? "";
      if (query.includes("disablePullRequestAutoMerge")) {
        mutations.push("disable");
        return { data: { disablePullRequestAutoMerge: {} } };
      }
      if (query.includes("dequeuePullRequest")) {
        mutations.push("dequeue");
        return { data: { dequeuePullRequest: {} } };
      }
      const pullRequest = reads.shift();
      if (!pullRequest) throw new Error("unexpected inspection");
      return response(pullRequest);
    });
    const expected = await service.inspect(context);

    expect(await cancelPending(service, expected)).toMatchObject({
      kind: "changed",
      expected: { revision: { baseRefOid: "base" } },
      observed: { revision: { baseRefOid: "advanced" } },
    });
    expect(mutations).toEqual(["disable"]);
  });

  it("treats a null base ref as unavailable for an open PR", async () => {
    const service = new GhShippingService(async () =>
      response({ ...raw, baseRef: null, baseRefOid: "stored-base" })
    );
    expect(await inspectLanding(service, context)).toMatchObject({
      kind: "unavailable",
    });
  });

  it("rejects malformed saved context before it can select a PR", () => {
    expect(() =>
      parseLandingRecord({
        ...empty,
        revision: { ...empty.revision, context: { ...context, number: -1 } },
      })
    ).toThrow();
  });
});

describe("shipping validation detail", () => {
  for (const [name, pullRequest, detail] of [
    [
      "an unknown state",
      { ...raw, state: "DRAFT" },
      "missing or invalid PR state",
    ],
    [
      "an empty base commit",
      { ...raw, baseRef: { target: { oid: "" } } },
      "baseRef.target.oid must be a non-empty string",
    ],
    [
      "a malformed queue entry",
      { ...raw, mergeQueueEntry: { id: 1 } },
      "queue entry id must be a non-empty string",
    ],
  ] as const)
    it(`names ${name} in the unavailable detail`, async () => {
      const service = new GhShippingService(async () => response(pullRequest));
      expect(await inspectLanding(service, context)).toEqual({
        kind: "unavailable",
        detail,
      });
    });

  it("names a missing autoMerge state in a saved record", () => {
    expect(() =>
      parseLandingRecord({ ...empty, pending: { queueEntryId: null } })
    ).toThrow("missing autoMerge state");
  });
});

describe("closing issues and hint lines", () => {
  const content = {
    title: "Title",
    body: "Fixes #8",
    closingIssues: ["owner/repo#8"],
  };

  it("normalizes the intended issues to sorted, unique owner/repo#number", () => {
    expect(parseIntendedIssues("9, #8,8,Other/Repo#2", context)).toEqual([
      "other/repo#2",
      "owner/repo#8",
      "owner/repo#9",
    ]);
    expect(parseIntendedIssues("", context)).toEqual([]);
    expect(() => parseIntendedIssues("8,x", context)).toThrow(
      "--closes entry x"
    );
  });

  it("rejects a repo-qualified entry with no # before the number", () => {
    for (const bad of [
      "Electivus/pstack-claude89",
      "Electivus/pstack-claude8,9",
    ])
      expect(() => parseIntendedIssues(bad, context)).toThrow("--closes entry");
  });

  it("checks closing issues only when an intended set is given", () => {
    expect(refusals(content, undefined)).toEqual([]);
    expect(refusals(content, ["owner/repo#8"])).toEqual([]);
    expect(refusals(content, [])).toEqual([
      { rule: "closing-issues", expected: [], observed: ["owner/repo#8"] },
    ]);
  });

  it("flags a line that starts with hint: in the body or title, not one that only contains it", () => {
    expect(
      refusals({ ...content, body: "see the hint: above" }, undefined)
    ).toEqual([]);
    expect(
      refusals({ ...content, body: "a\r\nhint: x\r\nb" }, undefined)
    ).toEqual([{ rule: "hint-line", field: "body", line: "hint: x" }]);
    expect(refusals({ ...content, title: "hint: x" }, undefined)).toMatchObject(
      [{ rule: "hint-line", field: "title" }]
    );
  });

  it("refuses an inspection before it returns the record as inspected", async () => {
    const f = fixture({ autoMerge: false, queueEntryId: null });
    expect(await inspectLanding(f.service, context, [])).toEqual({
      kind: "inspected",
      record: empty,
    });
    expect(await inspectLanding(f.service, context, ["owner/repo#8"])).toEqual({
      kind: "refused",
      record: empty,
      refusals: [
        { rule: "closing-issues", expected: ["owner/repo#8"], observed: [] },
      ],
    });
  });

  it("reads closing issues and text through GraphQL and refuses a partial page", async () => {
    const page = (totalCount: number) => ({
      title: "T",
      body: "",
      closingIssuesReferences: {
        totalCount,
        nodes: [{ number: 8, repository: { nameWithOwner: "Owner/Repo" } }],
      },
    });
    const ok = new GhShippingService(async () => response(page(1)));
    expect(await ok.readContent(context)).toEqual({
      title: "T",
      body: "",
      closingIssues: ["owner/repo#8"],
    });
    const partial = new GhShippingService(async () => response(page(2)));
    await expect(partial.readContent(context)).rejects.toThrow("more issues");
  });
});
