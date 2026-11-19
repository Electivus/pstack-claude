import type { WatchDeadline } from "./deadline.ts";
import { WatcherQueryError, graphqlArgs, runJson } from "./github.ts";
import { object, text } from "./landing.ts";
import type * as T from "./types.ts";
import { nonEmpty } from "./types.ts";

export const REQUIRED_CHECKS_QUERY = `query PrRequiredChecks($owner: String!, $repo: String!, $pr: Int!, $after: String) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $pr) {
      baseRefName
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

const RULES_PAGE = 100;

interface RollupPage {
  readonly base: string;
  readonly required: readonly string[];
  readonly reported: readonly string[];
  readonly endCursor: string | null;
}

/** A head commit with no rollup has no required checks to name. */
export function parseRequiredPage(response: unknown): RollupPage | null {
  const pullRequest = object(
    object(
      object(object(response, "response").data, "data").repository,
      "repository"
    ).pullRequest,
    "pullRequest"
  );
  const base = text(pullRequest.baseRefName, "baseRefName");
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
  const reported: string[] = [];
  for (const raw of nodes) {
    const node = object(raw, "context node");
    const name = node.__typename === "CheckRun" ? node.name : node.context;
    if (typeof name !== "string") continue;
    reported.push(name);
    if (node.isRequired === true) required.push(name);
  }
  const page = object(contexts.pageInfo, "pageInfo");
  return {
    base,
    required,
    reported,
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

export function parseRulesetContexts(response: unknown): string[] {
  if (!Array.isArray(response)) throw missing("rules");
  if (response.length >= RULES_PAGE)
    throw new WatcherQueryError({
      kind: "missing-field",
      retryable: true,
      detail: `rules page holds ${RULES_PAGE} entries and may be truncated`,
    });
  return response.flatMap((raw) => {
    const rule = object(raw, "rule");
    if (rule.type !== "required_status_checks") return [];
    const checks = object(
      rule.parameters,
      "rule.parameters"
    ).required_status_checks;
    if (!Array.isArray(checks)) throw missing("required_status_checks");
    return checks.map((check) =>
      text(object(check, "required status check").context, "context")
    );
  });
}

/**
 * Contexts classic branch protection requires, read from the branch endpoint.
 * The protection endpoint answers 404 to a reader without admin rights.
 */
export function parseClassicContexts(response: unknown): string[] {
  const contexts = object(
    object(object(response, "branch").protection, "protection")
      .required_status_checks,
    "required_status_checks"
  ).contexts;
  if (!Array.isArray(contexts))
    throw missing("required_status_checks.contexts");
  return contexts.map((context) => text(context, "context"));
}

export async function readRequiredNames(
  readPage: (after: string | null) => Promise<unknown>,
  readRepo: (path: string) => Promise<unknown>
): Promise<ReadonlySet<string> | null> {
  const required = new Set<string>();
  const reported = new Set<string>();
  const cursors = new Set<string>();
  let base = "";
  let after: string | null = null;
  do {
    const page = parseRequiredPage(await readPage(after));
    if (page === null) return null;
    base = page.base;
    for (const name of page.required) required.add(name);
    for (const name of page.reported) reported.add(name);
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
  const branch = encodeURIComponent(base);
  const [rulesets, classic] = await Promise.all([
    readRepo(`rules/branches/${branch}?per_page=${RULES_PAGE}`).then(
      parseRulesetContexts
    ),
    readRepo(`branches/${branch}`).then(parseClassicContexts),
  ]);
  for (const name of [...rulesets, ...classic]) required.add(name);
  for (const name of required) if (!reported.has(name)) return null;
  return required.size === 0 ? null : required;
}

export function ghRequiredNames(deadline: WatchDeadline): RequiredNames {
  return (context) =>
    readRequiredNames(
      (after) => {
        const argv = graphqlArgs(REQUIRED_CHECKS_QUERY, context);
        if (after !== null) argv.push("-f", `after=${after}`);
        return runJson(argv, deadline);
      },
      (path) =>
        runJson(
          ["gh", "api", `repos/${context.owner}/${context.repo}/${path}`],
          deadline
        )
    );
}

const listedOnly =
  (lookup: RequiredNames, checks: readonly T.Check[]): RequiredNames =>
  async (context) => {
    const names = await lookup(context);
    return names !== null &&
      [...names].every((name) => checks.some((check) => check.name === name))
      ? names
      : null;
  };

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
            checks: await markAdvisory(
              fast.checks,
              context,
              listedOnly(lookup, fast.checks)
            ),
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
