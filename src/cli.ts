// Entry point: parse args, route to repos / dispatch / install / uninstall.
// Top-level catch turns a CliError into `claude-muster: <msg>` + its exit code; any other
// error is an internal bug and surfaces with a stack.
import { parseArgs } from "node:util";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { loadConfig } from "./config.js";
import { discoverRepos } from "./scan.js";
import { dispatch, fanout, toTargets, resolveTarget, type DispatchResult } from "./dispatch.js";
import { install, uninstall, sessionStartPayload } from "./install.js";
import { setVerbose, info } from "./log.js";
import { error as logError } from "./log.js";
import { CliError } from "./errors.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

const HELP = `claude-muster — orchestrate every repo's Claude from one root

Each sibling repo has its own .claude/ (skills, agents, hooks, settings). Instead of dragging
all that into one session, claude-muster runs each repo's own Claude INSIDE that repo and lets
the Claude at your root delegate work to it.

Usage:
  claude-muster repos                      List the child repos you can dispatch to
  claude-muster dispatch <repo> "<task>"   Run \`claude -p "<task>"\` inside that repo
  claude-muster dispatch --all "<task>"    Fan the same task out to every repo
  claude-muster install                    Add the routing skill to ./.claude so your root
                                           Claude knows how to delegate (re-run with --force)
  claude-muster install --hook             Also add a SessionStart hook that briefs your root
                                           Claude on the available repos at session start
  claude-muster uninstall                  Remove the routing skill and any hook we added

Options:
  --root <dir>     Workspace root to scan (default: cwd)
  --depth <n>      How deep to look for child .claude/ dirs (default: 1)
  --path <dir>     Also include this repo (absolute or relative); repeatable
  --all            Dispatch the task to every repo (with \`dispatch\`)
  --json           Emit results as JSON (for the parent session to parse)
  --timeout <ms>   Kill a dispatched child after this many ms
  --hook           Also install the SessionStart hook (with \`install\`)
  --force          Overwrite an existing skill (with \`install\`)
  --verbose        Verbose logging
  -h, --help       Show this help
  -v, --version    Show version

claude-muster never calls an LLM. \`dispatch\` launches your local \`claude\` CLI, which runs on
your own auth and wallet. Everything happens on your machine.
`;

const SUBCOMMANDS = new Set(["repos", "dispatch", "install", "uninstall"]);

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      all: { type: "boolean", default: false },
      json: { type: "boolean", default: false },
      context: { type: "boolean", default: false },
      hook: { type: "boolean", default: false },
      force: { type: "boolean", default: false },
      verbose: { type: "boolean", default: false },
      root: { type: "string" },
      depth: { type: "string" },
      path: { type: "string", multiple: true },
      timeout: { type: "string" },
      help: { type: "boolean", short: "h", default: false },
      version: { type: "boolean", short: "v", default: false },
    },
  });

  if (values.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (values.version) {
    process.stdout.write(`${pkg.version}\n`);
    return 0;
  }

  setVerbose(values.verbose);

  // No verb → list repos (the useful "what can I orchestrate here?" default).
  const verb = positionals[0] ?? "repos";
  if (!SUBCOMMANDS.has(verb)) {
    throw new CliError(`unknown command "${verb}" — run \`claude-muster --help\``);
  }
  return runSubcommand(verb, positionals.slice(1), values);
}

interface CliValues {
  depth?: string;
  path?: string[];
  root?: string;
  timeout?: string;
  all?: boolean;
  json?: boolean;
  context?: boolean;
  hook?: boolean;
  force?: boolean;
}

async function runSubcommand(verb: string, args: string[], values: CliValues): Promise<number> {
  const root = resolve(values.root ?? process.cwd());

  if (verb === "install") {
    const res = await install(root, { force: values.force, hook: values.hook });
    info(`installed the muster-dispatch skill → ${res.path}${res.overwrote ? " (overwrote existing)" : ""}`);
    if (res.hook === "added") info(`installed the SessionStart hook → ${root}/.claude/settings.json`);
    else if (res.hook === "present") info(`SessionStart hook was already present — left it as is`);
    info(`now run \`claude\` from ${root} — it can route tasks to your repos with \`claude-muster dispatch\`.`);
    return 0;
  }
  if (verb === "uninstall") {
    const { skill, hook } = await uninstall(root);
    const removed = [skill && "skill", hook && "SessionStart hook"].filter(Boolean).join(" + ");
    info(removed ? `removed the muster-dispatch ${removed}` : "nothing to remove — muster was not installed here");
    return 0;
  }

  // repos / dispatch both need repo discovery.
  const config = await loadConfig(root);
  if (values.depth !== undefined) {
    const depth = Number(values.depth);
    if (!Number.isInteger(depth) || depth < 1) {
      throw new CliError(`--depth must be a positive integer (got "${values.depth}")`);
    }
    config.depth = depth;
  }
  if (values.path) config.paths = [...config.paths, ...values.path];

  const targets = toTargets(await discoverRepos(root, config));

  if (verb === "repos") {
    if (values.context) {
      // Emitted by the SessionStart hook — Claude Code injects this as additionalContext.
      process.stdout.write(`${sessionStartPayload(targets.map((t) => t.name))}\n`);
      return 0;
    }
    if (values.json) {
      process.stdout.write(`${JSON.stringify(targets, null, 2)}\n`);
      return 0;
    }
    if (targets.length === 0) {
      info("no child repos with a .claude/ found");
      return 0;
    }
    info(`\n  ${targets.length} repo${targets.length === 1 ? "" : "s"} you can dispatch to:\n`);
    for (const t of targets) info(`  ${t.name}`);
    info("");
    return 0;
  }

  // verb === "dispatch"
  const timeoutMs = parseTimeout(values.timeout);
  if (values.all) {
    const [task] = args;
    if (!task) throw new CliError(`dispatch --all needs a task: claude-muster dispatch --all "<task>"`);
    if (targets.length === 0) throw new CliError("no child repos to dispatch to");
    return reportDispatch(await fanout(targets, task, { timeoutMs }), values.json ?? false);
  }
  const [repo, task] = args;
  if (!repo || !task) {
    throw new CliError(`usage: claude-muster dispatch <repo> "<task>"  (or: dispatch --all "<task>")`);
  }
  let target;
  try {
    target = resolveTarget(targets, repo);
  } catch (err) {
    throw new CliError((err as Error).message);
  }
  return reportDispatch([await dispatch(target, task, { timeoutMs })], values.json ?? false);
}

function parseTimeout(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const ms = Number(raw);
  if (!Number.isInteger(ms) || ms <= 0) {
    throw new CliError(`--timeout must be a positive integer in ms (got "${raw}")`);
  }
  return ms;
}

/** Print dispatch results (human or --json) and return 0 iff every child succeeded. */
function reportDispatch(results: DispatchResult[], json: boolean): number {
  if (json) {
    process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
  } else {
    for (const r of results) {
      info(`\n  [${r.repo}] ${r.ok ? "ok" : `FAILED — ${r.error}`}`);
      if (r.text) info(`\n${r.text}`);
    }
    info("");
  }
  return results.every((r) => r.ok) ? 0 : 1;
}

main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    if (err instanceof CliError) {
      logError(err.message);
      process.exit(err.exitCode);
    }
    throw err;
  });
