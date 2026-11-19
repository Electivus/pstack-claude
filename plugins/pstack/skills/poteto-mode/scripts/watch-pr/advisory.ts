import type { WatchDeadline } from "./deadline.ts";
import { WatcherQueryError, graphqlArgs, runJson } from "./github.ts";
import { object } from "./landing.ts";
import type * as T from "./types.ts";
import { nonEmpty } from "./types.ts";

export const REQUIRED_CHECKS_QUERY = `query PrRequiredChecks($owner: String!, $repo: String!, $pr: Int!, $after: String) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $pr) {
      commits(last: 1) {
        nodes {
          commit {
            statusCheckRollup {
              contexts(first: 100, after: $after) {
                pageInfo { hasNextPage endCursor }
                nodes {
                  __typename
                  ... on CheckRun { name isRequired(pullRequestNumber: $pr) }
                  ... on StatusContext { context isRequired(pullRequestNumber: $pr) }
                }
              }
            }
          }
        }
      }
    }
  }
}`;

export type RequiredNames = (
  context: T.PrContext
) => Promise<ReadonlySet<string> | null>;

interface RequiredPage {
  readonly required: readonly string[];
  readonly endCursor: string | null;
}

/** A head commit with no rollup has no required checks to name. */
export function parseRequiredPage(response: unknown): RequiredPage | null {
  const pullRequest = object(
    object(
      object(object(response, "response").data, "data").repository,
      "repository"
    ).pullRequest,
    "pullRequest"
  );
  const commits = object(pullRequest.commits, "commits").nodes;
  if (!Array.isArray(commits) || commits.length === 0) return null;
  const commit = object(
    object(commits[commits.length - 1], "commit node").commit,
    "commit"
  );
  if (commit.statusCheckRollup === null) return null;
  const contexts = object(
    object(commit.statusCheckRollup, "statusCheckRollup").contexts,
    "contexts"
  );
  const nodes = contexts.nodes;
  if (!Array.isArray(nodes)) throw missing("contexts.nodes");
  const required: string[] = [];
  for (const raw of nodes) {
    const node = object(raw, "context node");
    const name = node.__typename === "CheckRun" ? node.name : node.context;
    if (node.isRequired === true && typeof name === "string")
      required.push(name);
  }
  const page = object(contexts.pageInfo, "pageInfo");
  return {
    required,
    endCursor:
      page.hasNextPage === true && typeof page.endCursor === "string"
        ? page.endCursor
        : null,
  };
}

function missing(path: string): WatcherQueryError {
  return new WatcherQueryError({
    kind: "missing-field",
    retryable: true,
    detail: `${path} must be a list`,
  });
}

/**
 * The names GitHub requires for this PR, or null when none are required or the
 * head has no rollup. Null cannot tell "no branch protection" from "unreadable",
 * so callers treat it as "every check is required".
 */
export async function readRequiredNames(
  readPage: (after: string | null) => Promise<unknown>
): Promise<ReadonlySet<string> | null> {
  const names = new Set<string>();
  const cursors = new Set<string>();
  let after: string | null = null;
  do {
    const page = parseRequiredPage(await readPage(after));
    if (page === null) return null;
    for (const name of page.required) names.add(name);
    after = page.endCursor;
    if (after !== null) {
      if (cursors.has(after))
        throw new WatcherQueryError({
          kind: "missing-field",
          retryable: true,
          detail: "required-check cursor did not advance",
        });
      cursors.add(after);
    }
  } while (after !== null);
  return names.size === 0 ? null : names;
}

export function ghRequiredNames(deadline: WatchDeadline): RequiredNames {
  return (context) =>
    readRequiredNames((after) => {
      const argv = graphqlArgs(REQUIRED_CHECKS_QUERY, context);
      if (after !== null) argv.push("-f", `after=${after}`);
      return runJson(argv, deadline);
    });
}

async function markAdvisory(
  checks: readonly T.Check[],
  context: T.PrContext,
  lookup: RequiredNames
): Promise<readonly T.Check[]> {
  if (!checks.some((check) => check.kind === "pending")) return checks;
  let required: ReadonlySet<string> | null;
  try {
    required = await lookup(context);
  } catch (error) {
    if (error instanceof WatcherQueryError) return checks;
    throw error;
  }
  if (required === null || required.size === 0) return checks;
  const names = required;
  return checks.map((check) =>
    check.kind === "pending" && !names.has(check.name)
      ? { ...check, advisory: true }
      : check
  );
}

/** Tags each pending check the base branch does not require. */
export function advisoryReader(
  inner: T.GitHubReader,
  lookup: RequiredNames
): T.GitHubReader {
  return {
    originRepo: () => inner.originRepo(),
    currentPr: (pr) => inner.currentPr(pr),
    pullRequest: (context) => inner.pullRequest(context),
    openPullRequests: (repository) => inner.openPullRequests(repository),
    defaultBranch: (repository) => inner.defaultBranch(repository),
    reviewThreadPage: (context, after) =>
      inner.reviewThreadPage(context, after),
    commitRollups: (context) => inner.commitRollups(context),
    async checksFastPath(context) {
      const fast = await inner.checksFastPath(context);
      return fast.kind === "checks"
        ? {
            kind: "checks",
            checks: await markAdvisory(fast.checks, context, lookup),
          }
        : fast;
    },
    async checkRollupPage(context, after) {
      const page = await inner.checkRollupPage(context, after);
      return page.kind === "contexts"
        ? {
            ...page,
            checks: await markAdvisory(page.checks, context, lookup),
          }
        : page;
    },
  };
}

export function pendingWait(pending: T.NonEmpty<T.PendingCheck>): T.WaitReason {
  return pending.every((check) => check.advisory === true)
    ? { kind: "advisory-pending", pending }
    : { kind: "pending-checks", pending };
}

export const isAdvisoryWait = (reason: T.WaitReason | null): boolean =>
  reason?.kind === "advisory-pending";

export const advisoryOnly = (pending: readonly T.PendingCheck[]): boolean =>
  nonEmpty(pending) !== null && pending.every((c) => c.advisory === true);

export const advisoryLine = (pending: readonly T.PendingCheck[]): string =>
  `required checks green; only advisory statuses pending: ${pending.map((check) => check.name).join(", ")}`;
