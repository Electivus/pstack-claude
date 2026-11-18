## What and why

<!-- One bullet per change: what changed and why. The diff already shows how. One concern per PR. -->

-

## Linked issue

<!-- Write "Fixes #N" only if this PR delivers everything the issue asks for, because merging closes the issue. Otherwise write "Part of #N" or "Related to #N". -->

## Test run

<!-- Paste the commands you ran and their pass/fail counts, for example "bun test tests/: 1204 pass, 0 fail". Name any check you skipped and why. A PR with no test run here will be closed. -->

```text

```

## Checklist

- [ ] I ran `bun install --frozen-lockfile`, `bun tools/generate.mjs`, and `bun test tests/`, and committed the generator's output.
- [ ] `bun tools/generate.mjs --check` exits 0.
- [ ] I changed model defaults only in `plugins/pstack/models.json`, and every Pi model ID is in Pi's catalog for that provider.
- [ ] If `bun tools/check-release.mjs origin/main` reports a shipped path, I ran `bun tools/release.mjs` and committed `VERSION`, `CHANGES.md`, and the manifests it wrote.
- [ ] If this touches `plugins/pstack/pi/`, `pi-tools.md`, `plugins/pstack/hooks/`, `copilot-tools.md`, or `setup-pstack`, I ran the runtime checks that [CONTRIBUTING.md](https://github.com/Electivus/pstack-claude/blob/main/CONTRIBUTING.md#before-you-open-a-pr) lists for those paths.
