---
name: muster-dispatch
description: Use when working from a workspace root that holds several child repos and a task really belongs to ONE (or a few) of them — e.g. "fix the failing test in api", "what's web's build command", "bump the version in every service". Delegates the task to that repo's own Claude (running inside the repo, with its real skills/agents/hooks/env) via `claude-muster dispatch`, then reports the result. Prefer this over reading/editing a child repo's files directly from the root, because the child's Claude has that repo's full `.claude/` context that the root session does not.
---

# muster-dispatch

You are at a workspace root with several sibling repos, each carrying its own `.claude/`.
You do **not** have their skills/agents/hooks loaded here. Instead of doing a repo's work
yourself with half its context, hand the task to that repo's own Claude.

## How to route

1. **List the repos** you can reach:
   ```bash
   claude-muster repos
   ```
2. **Decide which repo owns the task.** Pick by what the task names (a service, a path, a
   feature). If genuinely unsure, ask the user rather than guessing.
3. **Dispatch** to that one repo and read the result:
   ```bash
   claude-muster dispatch <repo> "<the task, written as you'd ask a fresh Claude in that repo>"
   ```
   Write the task self-contained: the child starts with no memory of this conversation.
4. **Fan out** only when the SAME task applies to every repo (an audit, a survey, a sweep):
   ```bash
   claude-muster dispatch --all "<task>" --json
   ```
   Use `--json` when you'll parse/aggregate the results yourself; collect each repo's outcome
   and summarize back to the user which succeeded and which failed.

## Rules

- One task → one repo by default. Don't fan out unless it truly applies to all.
- The child runs `claude -p` on the user's own machine and wallet — it's a real, possibly
  long, possibly costly sub-session. Don't dispatch trivial questions you can answer yourself.
- A dispatch result is the child's final text. If it failed (`ok: false`), surface the error;
  don't pretend it succeeded.
- You are the orchestrator: you decide *where*, the child decides *how*. Don't try to also
  edit the child's files from here — let its Claude do that in its own context.
