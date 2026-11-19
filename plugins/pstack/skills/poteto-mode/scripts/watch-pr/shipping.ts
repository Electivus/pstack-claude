import {
  baseRefTargetOid,
  flag,
  nullableText,
  object,
  oneOf,
  text,
  parseLandingRevision,
  sameLandingRevision,
  type LandingRevision,
} from "./landing.ts";
import type { PrContext } from "./types.ts";

export interface LandingRecord {
  readonly revision: LandingRevision;
  readonly pullRequestId: string;
  readonly state: "OPEN" | "CLOSED" | "MERGED";
  readonly pending: {
    readonly autoMerge: boolean;
    readonly queueEntryId: string | null;
  };
  readonly mergeCommitOid: string | null;
}

export interface PullRequestContent {
  readonly title: string;
  readonly body: string;
  readonly closingIssues: readonly string[];
}

export type Refusal =
  | {
      readonly rule: "closing-issues";
      readonly expected: readonly string[];
      readonly observed: readonly string[];
    }
  | {
      readonly rule: "hint-line";
      readonly field: "title" | "body";
      readonly line: string;
    };

export interface ShippingService {
  inspect(context: PrContext): Promise<LandingRecord>;
  readContent(context: PrContext): Promise<PullRequestContent>;
  disableAutoMerge(pullRequestId: string): Promise<void>;
  dequeue(pullRequestId: string): Promise<void>;
}

export type ShippingResult =
  | { readonly kind: "inspected" | "cancelled"; readonly record: LandingRecord }
  | {
      readonly kind: "refused";
      readonly record: LandingRecord;
      readonly refusals: readonly Refusal[];
    }
  | {
      readonly kind: "changed";
      readonly expected: LandingRecord;
      readonly observed: LandingRecord;
    }
  | {
      readonly kind: "not-open" | "still-pending";
      readonly record: LandingRecord;
    }
  | { readonly kind: "unavailable"; readonly detail: string };

const STATES = ["OPEN", "CLOSED", "MERGED"] as const;

export function parseLandingRecord(value: unknown): LandingRecord {
  const record = object(value, "landing record");
  const pending = object(record.pending, "pending merges");
  const autoMerge = flag(pending.autoMerge, "autoMerge state");
  return {
    revision: parseLandingRevision(record.revision),
    pullRequestId: text(record.pullRequestId, "pullRequestId"),
    state: oneOf(record.state, STATES, "PR state"),
    pending: {
      autoMerge,
      queueEntryId: nullableText(pending.queueEntryId, "queueEntryId"),
    },
    mergeCommitOid: nullableText(record.mergeCommitOid, "mergeCommitOid"),
  };
}

function unavailable(error: unknown): ShippingResult {
  return {
    kind: "unavailable",
    detail: error instanceof Error ? error.message : String(error),
  };
}

export function parseIntendedIssues(
  list: string,
  context: PrContext
): readonly string[] {
  const home = `${context.owner}/${context.repo}`.toLowerCase();
  const issues = list
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "")
    .map((item) => {
      const match = /^(?:([\w.-]+\/[\w.-]+))?#?(\d+)$/.exec(item);
      if (!match?.[2])
        throw new Error(
          `--closes entry ${item} is not 12, #12, or owner/repo#12`
        );
      return `${(match[1] ?? home).toLowerCase()}#${Number(match[2])}`;
    });
  return [...new Set(issues)].sort();
}

const HINT_LINE = /^hint:/;

function hintLine(value: string): string | undefined {
  return value.split(/\r?\n/).find((line) => HINT_LINE.test(line));
}

export function refusals(
  content: PullRequestContent,
  intended: readonly string[] | undefined
): readonly Refusal[] {
  const found: Refusal[] = [];
  const observed = [...new Set(content.closingIssues)].sort();
  if (
    intended !== undefined &&
    (intended.length !== observed.length ||
      intended.some((issue, i) => issue !== observed[i]))
  )
    found.push({ rule: "closing-issues", expected: intended, observed });
  for (const field of ["title", "body"] as const) {
    const line = hintLine(content[field]);
    if (line !== undefined) found.push({ rule: "hint-line", field, line });
  }
  return found;
}

export async function inspectLanding(
  service: ShippingService,
  context: PrContext,
  intended?: readonly string[]
): Promise<ShippingResult> {
  try {
    const record = await service.inspect(context);
    const found = refusals(await service.readContent(context), intended);
    return found.length === 0
      ? { kind: "inspected", record }
      : { kind: "refused", record, refusals: found };
  } catch (error) {
    return unavailable(error);
  }
}

export async function cancelPending(
  service: ShippingService,
  expected: LandingRecord
): Promise<ShippingResult> {
  const mismatch = (record: LandingRecord): ShippingResult | null => {
    if (record.state !== "OPEN") return { kind: "not-open", record };
    if (
      record.pullRequestId !== expected.pullRequestId ||
      !sameLandingRevision(record.revision, expected.revision)
    )
      return { kind: "changed", expected, observed: record };
    return null;
  };
  if (expected.state !== "OPEN") return { kind: "not-open", record: expected };
  try {
    let record = await service.inspect(expected.revision.context);
    let refusal = mismatch(record);
    if (refusal) return refusal;
    if (record.pending.autoMerge) {
      await service.disableAutoMerge(record.pullRequestId);
      record = await service.inspect(expected.revision.context);
      refusal = mismatch(record);
      if (refusal) return refusal;
    }
    if (record.pending.queueEntryId !== null) {
      await service.dequeue(record.pullRequestId);
    }
    record = await service.inspect(expected.revision.context);
    refusal = mismatch(record);
    if (refusal) return refusal;
    if (record.pending.autoMerge || record.pending.queueEntryId !== null)
      return { kind: "still-pending", record };
    return { kind: "cancelled", record };
  } catch (error) {
    return unavailable(error);
  }
}

const INSPECT_QUERY = `query Landing($owner:String!,$repo:String!,$pr:Int!) {
  repository(owner:$owner,name:$repo) {
    pullRequest(number:$pr) {
      id state headRefOid baseRefName baseRefOid
      baseRef { target { oid } }
      autoMergeRequest { enabledAt }
      mergeQueueEntry { id }
      mergeCommit { oid }
    }
  }
}`;

const CONTENT_QUERY = `query Content($owner:String!,$repo:String!,$pr:Int!) {
  repository(owner:$owner,name:$repo) {
    pullRequest(number:$pr) {
      title body
      closingIssuesReferences(first:100) {
        totalCount
        nodes { number repository { nameWithOwner } }
      }
    }
  }
}`;

function data(value: unknown): Record<string, unknown> {
  const response = object(value, "GraphQL response");
  if (response.errors !== undefined) throw new Error("GraphQL returned errors");
  return object(response.data, "GraphQL data");
}

export class GhShippingService implements ShippingService {
  constructor(
    private readonly execute: (
      argv: readonly [string, ...string[]]
    ) => Promise<unknown>
  ) {}

  async inspect(context: PrContext): Promise<LandingRecord> {
    const response = data(
      await this.execute([
        "gh",
        "api",
        "graphql",
        "-f",
        `query=${INSPECT_QUERY}`,
        "-f",
        `owner=${context.owner}`,
        "-f",
        `repo=${context.repo}`,
        "-F",
        `pr=${context.number}`,
      ])
    );
    const fields = object(
      object(response.repository, "repository").pullRequest,
      "pullRequest"
    );
    const state = oneOf(fields.state, STATES, "PR state");
    const currentBaseOid = baseRefTargetOid(fields.baseRef);
    const autoMerge =
      fields.autoMergeRequest === null
        ? false
        : Boolean(
            text(
              object(fields.autoMergeRequest, "autoMergeRequest").enabledAt,
              "enabledAt"
            )
          );
    const queueEntryId =
      fields.mergeQueueEntry === null
        ? null
        : text(
            object(fields.mergeQueueEntry, "mergeQueueEntry").id,
            "queue entry id"
          );
    return {
      revision: {
        context,
        headRefOid: text(fields.headRefOid, "headRefOid"),
        baseRefName: text(fields.baseRefName, "baseRefName"),
        baseRefOid: text(
          state === "OPEN"
            ? currentBaseOid
            : (currentBaseOid ?? fields.baseRefOid),
          "baseRef.target.oid"
        ),
      },
      pullRequestId: text(fields.id, "pull request id"),
      state,
      pending: { autoMerge, queueEntryId },
      mergeCommitOid:
        fields.mergeCommit === null
          ? null
          : text(
              object(fields.mergeCommit, "mergeCommit").oid,
              "merge commit oid"
            ),
    };
  }

  async readContent(context: PrContext): Promise<PullRequestContent> {
    const response = data(
      await this.execute([
        "gh",
        "api",
        "graphql",
        "-f",
        `query=${CONTENT_QUERY}`,
        "-f",
        `owner=${context.owner}`,
        "-f",
        `repo=${context.repo}`,
        "-F",
        `pr=${context.number}`,
      ])
    );
    const fields = object(
      object(response.repository, "repository").pullRequest,
      "pullRequest"
    );
    const references = object(
      fields.closingIssuesReferences,
      "closingIssuesReferences"
    );
    if (!Array.isArray(references.nodes))
      throw new Error("closingIssuesReferences.nodes must be a list");
    if (references.totalCount !== references.nodes.length)
      throw new Error("closingIssuesReferences has more issues than were read");
    if (typeof fields.body !== "string") throw new Error("missing body");
    return {
      title: text(fields.title, "title"),
      body: fields.body,
      closingIssues: references.nodes.map((node: unknown) => {
        const issue = object(node, "closing issue");
        const repository = object(issue.repository, "issue repository");
        const number = issue.number;
        if (typeof number !== "number") throw new Error("missing issue number");
        return `${text(repository.nameWithOwner, "nameWithOwner").toLowerCase()}#${number}`;
      }),
    };
  }

  async disableAutoMerge(id: string): Promise<void> {
    const result = data(
      await this.execute([
        "gh",
        "api",
        "graphql",
        "-f",
        "query=mutation($id:ID!) { disablePullRequestAutoMerge(input:{pullRequestId:$id}) { clientMutationId } }",
        "-f",
        `id=${id}`,
      ])
    );
    object(result.disablePullRequestAutoMerge, "disablePullRequestAutoMerge");
  }

  async dequeue(id: string): Promise<void> {
    const result = data(
      await this.execute([
        "gh",
        "api",
        "graphql",
        "-f",
        "query=mutation($id:ID!) { dequeuePullRequest(input:{id:$id}) { clientMutationId } }",
        "-f",
        `id=${id}`,
      ])
    );
    object(result.dequeuePullRequest, "dequeuePullRequest");
  }
}
