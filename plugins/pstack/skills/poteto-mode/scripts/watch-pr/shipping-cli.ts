import { readFile } from "node:fs/promises";
import { Command, CommanderError } from "commander";
import { WatchDeadline } from "./deadline.ts";
import { runJson } from "./github.ts";
import { object, parseContext } from "./landing.ts";
import {
  GhShippingService,
  cancelPending,
  inspectLanding,
  parseIntendedIssues,
  parseLandingRecord,
  type ShippingResult,
} from "./shipping.ts";

export async function main(argv: readonly string[]): Promise<number> {
  let result: ShippingResult | undefined;
  const deadline = new WatchDeadline(60, () => performance.now() / 1000);
  const service = new GhShippingService((args) => runJson(args, deadline));
  const cli = new Command("ship-pr").exitOverride();
  cli.description(
    "Inspect a landing record or cancel its pending merge mechanisms. Never merges or rewrites branches."
  );
  cli
    .command("inspect")
    .requiredOption("--repo <owner/repo>")
    .requiredOption("--pr <number>")
    .option(
      "--closes <issues>",
      "comma-separated issues the PR must close (12, #12, or owner/repo#12); an empty list means none. Refuses when closingIssuesReferences differs"
    )
    .action(async (options: { repo: string; pr: string; closes?: string }) => {
      const parts = options.repo.split("/");
      if (parts.length !== 2) throw new Error("--repo must be owner/repo");
      const context = parseContext({
        owner: parts[0],
        repo: parts[1],
        number: Number(options.pr),
      });
      result = await inspectLanding(
        service,
        context,
        options.closes === undefined
          ? undefined
          : parseIntendedIssues(options.closes, context)
      );
    });
  cli
    .command("cancel-pending")
    .requiredOption(
      "--record <file>",
      "JSON output from inspect or a successful cancellation"
    )
    .action(async (options: { record: string }) => {
      const input = object(
        JSON.parse(await readFile(options.record, "utf8")),
        "saved inspection"
      );
      if (
        input.kind !== "inspected" &&
        input.kind !== "cancelled" &&
        input.kind !== "refused"
      )
        throw new Error(
          "record must contain an inspection, a refused inspection, or a cancellation"
        );
      result = await cancelPending(service, parseLandingRecord(input.record));
    });
  try {
    await cli.parseAsync(argv, { from: "user" });
    if (!result) return 64;
  } catch (error) {
    if (error instanceof CommanderError) return error.exitCode === 0 ? 0 : 64;
    result = {
      kind: "unavailable",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return result.kind === "inspected" || result.kind === "cancelled" ? 0 : 1;
}
