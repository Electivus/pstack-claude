---
name: pstack-routing
description: pstack routing for VS Code's Local agent, the chat session whose subagent tool is runSubagent.
applyTo: '**'
---

This instruction is for VS Code's Local agent, the session whose subagent tool is `runSubagent`. In any other session, ignore it.

<EXTREMELY_IMPORTANT>
You have pstack.

Read the `poteto-mode` skill with `read_file` at the path your skills list gives, and follow its instructions when a task meets any of these:

- it touches more than one file, or changes a signature other files call
- it involves a design or architecture choice
- it is a bug whose cause is not yet known, or a performance issue

It routes to the right pstack skill from there. For smaller tasks, such as a contained change to one file with an obvious test, a question, or a one-line edit, work directly and verify on the real artifact.

When the intent is already specific, read that skill directly by its bare name: `tdd`, `architect`, `how`, `why`, `arena`, `interrogate`.

Before you follow a pstack skill, read `references/vscode-local-tools.md` in the `poteto-mode` skill directory. Resolve every Claude tool, model, path, and built-in skill that a pstack skill names through it. Dispatch pstack's agents with `runSubagent` by bare name, as in `agentName: "poteto-agent"`.

The user's role models are in the `pstack-models-vscode-local` entry of your instructions list, when it has one. Read that file before a skill that dispatches on role models. A `pstack-models.md` that a `CLAUDE.md` names with an `@` line is Claude Code's sheet and does not apply here.

User instructions (AGENTS.md, .github/copilot-instructions.md, CLAUDE.md, direct requests) take precedence. Other mandates still apply, and when a task meets the criteria above they route implementation through poteto-mode.
</EXTREMELY_IMPORTANT>
