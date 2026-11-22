import { describe, expect, it } from "bun:test";
import { type CliRuntime, main, parseArgs } from "./cli.ts";
import { WatchDeadline } from "./deadline.ts";
import { fakeReader } from "./fakes.test-helper.ts";
import { unsettledSuiteChecks } from "./github.ts";
import type { GitHubReader } from "./types.ts";

const silentIo = { stdout: () => {}, stderr: () => {} };

describe("positional PR number", () => {
  it("reads the number as --pr", () => {
    expect(Number(parseArgs(["1481", "--status-only"], silentIo).pr)).toBe(
      1481
    );
    expect(Number(parseArgs(["#12"], silentIo).pr)).toBe(12);
  });

  it("accepts the same number twice and refuses two different ones", () => {
    expect(Number(parseArgs(["7", "--pr", "7"], silentIo).pr)).toBe(7);
    const stderr: string[] = [];
    expect(() =>
      parseArgs(["7", "--pr", "8"], {
        stdout: () => {},
        stderr: (v) => stderr.push(v),
      })
    ).toThrow();
    expect(stderr.join("")).toContain(
      "use --pr <number> or the positional number, not both"
    );
  });

  it("refuses a second positional, naming --pr", () => {
    const stderr: string[] = [];
    expect(() =>
      parseArgs(["1", "2"], {
        stdout: () => {},
        stderr: (v) => stderr.push(v),
      })
    ).toThrow();
    expect(stderr.join("")).toContain("use --pr <number>");
  });

  it("refuses a value that is not a number", () => {
    expect(() => parseArgs(["abc"], silentIo)).toThrow();
  });

  it("resolves the pull request the way --pr does", async () => {
    const stdout: string[] = [];
    const code = await main(["33", "--status-only"], {
      reader: fakeReader(),
      deadline: new WatchDeadline(0, () => 0),
      clock: {
        now: () => 0,
        observedAt: () => "t",
        async sleep() {},
      },
      stdout: (v) => stdout.push(v),
      stderr: () => {},
    });
    expect(code).toBe(0);
    expect(JSON.parse(stdout.join("")).rows[0].context.number).toBe(33);
  });
});

describe("--expect-app", () => {
  it("collects each named app into the polling options", () => {
    expect(
      parseArgs(
        ["--expect-app", "azure-pipelines", "--expect-app", "circleci-checks"],
        silentIo
      ).polling.expectedApps
    ).toEqual(["azure-pipelines", "circleci-checks"]);
    expect(parseArgs([], silentIo).polling.expectedApps).toBeUndefined();
  });

  it("rejects a value that is not a GitHub App slug as usage", async () => {
    for (const value of ["", "Azure Pipelines", "azure_pipelines", "-azure"]) {
      const stderr: string[] = [];
      const runtime = {
        reader: fakeReader(),
        deadline: new WatchDeadline(0, () => 0),
        clock: {
          now: () => 0,
          observedAt: () => "2026-07-26T00:00:00.000Z",
          async sleep() {},
        },
        stdout: () => {},
        stderr: (text: string) => stderr.push(text),
      } satisfies CliRuntime;
      expect(await main(["--expect-app", value], runtime)).toBe(64);
      expect(stderr.join("")).toContain("a GitHub App slug");
    }
  });

  it("names the uncounted apps and the flag in the pretty READY lines", async () => {
    const reader: GitHubReader = fakeReader({
      facts: { reviewDecision: null },
    });
    reader.unsettledSuites = async (_context, head, checksRead, expectedApps) =>
      unsettledSuiteChecks(
        [
          {
            total_count: 1,
            check_suites: [
              {
                head_sha: head,
                status: "queued",
                conclusion: null,
                app: { slug: "azure-pipelines", name: "Azure Pipelines" },
                latest_check_runs_count: 0,
              },
            ],
          },
        ],
        head,
        checksRead,
        expectedApps
      );
    const stdout: string[] = [];
    const runtime = {
      reader,
      deadline: new WatchDeadline(0, () => 0),
      clock: {
        now: () => 0,
        observedAt: () => "2026-07-26T00:00:00.000Z",
        async sleep() {
          throw new Error("test unexpectedly slept");
        },
      },
      stdout: (text: string) => stdout.push(text),
      stderr: () => {},
    } satisfies CliRuntime;
    expect(
      await main(
        ["--owner", "owner", "--repo", "repo", "--pr", "1", "--pretty"],
        runtime
      )
    ).toBe(0);
    expect(stdout.join("")).toContain(
      "\nqueuedWithoutRuns=Azure Pipelines (azure-pipelines)\nnote=these apps queued a check suite and started no runs, so they were not counted; if one runs CI for this repository, rerun with --expect-app <slug>\n"
    );
  });
});
