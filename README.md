# claude-muster

<p align="center">
  <img src="./assets/header.jpg" alt="claude-muster — orchestrate every agent, from one root" width="100%">
</p>

English · [日本語](./README.ja.md) · [中文](./README.zh-CN.md) · [한국어](./README.ko.md) · [Español](./README.es.md) · [Français](./README.fr.md)

**Orchestrate every agent. From one root.**

Work across all your repos from one Claude session by letting each repo's own Claude do its own work, in its own folder, with its own skills, agents, hooks, and settings intact.

## The situation

Say your work lives in one folder full of separate git repos:

```
~/work/
├── webapp/    → has .claude/skills/deploy, .claude/commands/release
├── api/       → has .claude/skills/lint, .claude/agents/db-reviewer, .claude/hooks/pre-commit
└── mobile/    → has .claude/commands/build
```

Each repo carries its own `.claude/`: the skills, agents, commands, hooks, and settings its team wrote.

Open Claude Code **inside `api/`** and you get all of api's tooling. Good. But open it **in `~/work/`** to work across all three at once and that tooling vanishes, because Claude Code reads `.claude/` from the current folder and the folders above it, never the folders below.

The obvious fix is to drag everything up: copy or symlink each repo's `.claude/` into `~/work/.claude/`. That works for skills, but it quietly breaks the rest. A hook written to run inside `api/` now runs from `~/work/` with the wrong working directory. One repo's `deny` permission silently blocks every other repo. Two repos that both set `API_URL` collide into one value. Agents have to be copied, so they drift out of date. You spend your time babysitting a merged `.claude/` instead of working.

## What claude-muster does

It takes the opposite approach. Instead of pulling every repo's tooling *up* into one session, it leaves each repo's `.claude/` exactly where it is and runs **that repo's own Claude inside that repo**. The Claude at your root becomes an orchestrator: it decides which repo a task belongs to, hands the task off, and reads back the result.

```console
$ cd ~/work
$ claude-muster repos

  3 repos you can dispatch to:

  webapp
  api
  mobile

$ claude-muster dispatch api "fix the failing test in handler.ts"

  [api] ok

  Found it: handler.ts called the old two-arg `parse()`. Updated the call and the test passes.
```

The child ran `claude` **inside `api/`**, so it had api's real working directory, environment, skills, agents, hooks, and permissions, exactly as if you'd opened Claude there yourself. Nothing was copied. Nothing was merged. There is nothing to drift or clean up.

Better still, install the routing skill and your root Claude learns to do this on its own:

```console
$ claude-muster install     # adds a small skill to ~/work/.claude/

$ claude
> fix the failing test in api and tell me what web's build command is

  (Claude dispatches to api, dispatches to web, and reports both back)
```

Want your root Claude to know about its repos the instant a session starts, without waiting for the skill to kick in? Add `--hook`:

```console
$ claude-muster install --hook    # also registers a SessionStart hook in ~/work/.claude/settings.json
```

Now every session here opens with a one-line briefing of which repos it can dispatch to. It is the only thing claude-muster writes to your `settings.json`, and `uninstall` takes it back out exactly.

That's the whole tool. **claude-muster never calls an LLM itself.** `dispatch` launches your local `claude` CLI, which runs on your own auth and your own wallet. claude-muster just decides where to send work and collects what comes back.

## Install

> **Not on npm yet.** For now, clone and build it. A published `npx claude-muster` is planned.

```bash
git clone https://github.com/mk668a/claude-muster
cd claude-muster
npm install && npm run build
npm link            # makes `claude-muster` available everywhere
```

Then run it from any workspace root:

```bash
cd ~/work
claude-muster repos
```

Node 18+. You also need the `claude` CLI on your `PATH` (that is what `dispatch` runs).

Prefer not to `npm link`? Call the built file directly: `node /path/to/claude-muster/dist/cli.js`.

### Removing claude-muster from your machine

Note the difference: `claude-muster uninstall` removes the routing skill from one workspace, **not** the tool. To uninstall the tool itself, undo the `npm link` and delete the clone:

```bash
npm rm -g claude-muster        # or: npm unlink -g claude-muster (undoes `npm link`)
rm -rf /path/to/claude-muster  # the folder you cloned
```

If you skipped `npm link` and ran `node .../dist/cli.js` directly, just delete the clone.

## Usage

```bash
claude-muster repos                      # list the child repos you can dispatch to
claude-muster dispatch <repo> "<task>"   # run `claude -p "<task>"` inside that repo
claude-muster dispatch --all "<task>"    # fan the same task out to every repo
claude-muster install                    # add the routing skill so your root Claude can delegate
claude-muster install --hook             # also brief your root Claude on its repos at session start
claude-muster uninstall                  # remove the skill (and any --hook entry) from this root
claude-muster --version                  # print the installed version (short form: -v)
```

To undo an install, run `claude-muster uninstall` from the same root you installed at. It removes the `muster-dispatch` skill and, if you used `--hook`, takes the SessionStart entry back out of `settings.json`, deleting the file if nothing else is left in it. It only ever removes what claude-muster added.

To check which version you have, run `claude-muster --version` (or `claude-muster -v`).

Useful flags:

```bash
--root <dir>     # workspace root to scan (default: cwd)
--json           # emit dispatch / repos results as JSON, for the parent session to parse
--timeout <ms>   # kill a dispatched child if it runs too long
--depth <n>      # how deep to look for child .claude/ dirs (default: 1)
--path <dir>     # also include a repo that lives elsewhere on this machine; repeatable
--force          # overwrite an existing skill (with `install`)
-v, --version    # print the version
-h, --help       # show all commands and flags
```

### Dispatch one repo, or fan out to all

`dispatch <repo> "<task>"` sends one self-contained task to one repo. Write the task as you would to a fresh Claude opened in that repo, because that is exactly what it is: the child starts with no memory of your root conversation.

`dispatch --all "<task>"` sends the same task to every repo in parallel and collects the results. It is built for surveys and sweeps: *"what is your test command?"*, *"is there a TODO about auth anywhere?"*, *"bump the version to 2.0"*. Pair it with `--json` when you want to aggregate the answers yourself.

### Optional config

By default every sibling repo with a `.claude/` is included. Drop a `claude-muster.json` in the root to narrow it down:

```jsonc
{
  "include": ["webapp", "api/*", "services/**"],  // which repos to target (globs, relative to root)
  "exclude": ["legacy-*"],                          // repos to skip
  "depth": 2,                                        // how many folders deep to look (default: 1)
  "paths": ["../shared-tools", "/abs/path/to/repo"]  // extra repos anywhere on this machine (also: --path)
}
```

## How it works

Claude Code reads each repo's `.claude/` from the repo's own folder and the folders above it. claude-muster never fights that. It just starts `claude` with the child repo as the working directory:

| Step | What happens |
|---|---|
| **discover** | Walk the root for sibling directories that contain a `.claude/` (respecting `claude-muster.json`). |
| **decide** | The Claude at your root (or you on the command line) picks which repo a task belongs to. |
| **dispatch** | Run `claude -p "<task>" --output-format json` with `cwd` set to that repo. |
| **collect** | Parse the child's final result and hand it back to the orchestrator. |

Because the child is a real `claude` process rooted in its own repo, every problem the copy-it-all approach creates simply does not arise:

- **Working directory is correct.** Hooks and scripts run from the repo they were written for.
- **No cross-firing.** Each repo's hooks and permissions apply only to that repo's session, never to the others.
- **Nothing goes stale.** Agents are read live from the repo, never copied.
- **No environment collisions.** Each child process has its own environment.
- **Nothing to clean up.** No symlinks, no merged settings, no manifest. `install` adds one skill and `uninstall` removes it.

## Why it's safe to rely on

- **claude-muster never calls an LLM.** It runs your local `claude` CLI, on your auth and your wallet. No API keys, no network of its own, no telemetry.
- **It changes almost nothing on disk.** `dispatch` and `repos` only read your folders to discover repos. The only thing it ever writes is the routing skill from `install`, and `uninstall` takes it back.
- **Each child is the real thing.** Dispatching to `api` is the same as opening Claude in `api/` yourself, so there are no surprises about which tooling is in effect.

## What it doesn't do (yet)

- **Persistent child sessions.** Each `dispatch` is a fresh, single-shot `claude -p` run, so a child does not remember the previous task you sent it. Long-lived warm sessions per repo are a planned follow-up.
- **Repos on other machines.** Anywhere on your local filesystem works (see `paths`), but remote or networked repos do not.
- **Deciding for you when it's ambiguous.** If a task could belong to several repos, the orchestrator should ask rather than guess. The routing skill is written to do that.

## Your account, your terms

`dispatch` runs your own locally-installed `claude` CLI under your own Anthropic account (a Claude subscription or an API key). claude-muster never supplies, stores, or shares credentials, and it uses Claude Code's documented headless mode (`claude -p`). You are responsible for complying with [Anthropic's terms and usage policies](https://www.anthropic.com/legal/aup) for your own plan.

One practical note: `dispatch --all` starts several `claude` processes at once, which can hit Anthropic's rate limits if you fan out widely. Keep concurrency reasonable.

## License

MIT.
