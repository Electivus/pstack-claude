import { describe, expect, it } from "bun:test";
import { main, parseArgs } from "./cli.ts";
import { fakeReader } from "./fakes.test-helper.ts";
import { WatchDeadline } from "./deadline.ts";

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
