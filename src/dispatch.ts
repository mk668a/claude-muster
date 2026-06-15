// Orchestrator core (B-light): send a task to a child repo's Claude, running IN that repo.
//
// The parent session decides WHICH repo a task belongs to and calls dispatch(); we launch
// `claude -p "<task>"` with cwd = the child repo, so the child gets its own cwd, env, skills,
// agents, hooks, and permissions natively. That sidesteps the federation issues (#1 cwd/path,
// #2 cross-fire, #3 agent staleness, #4 env collision, #5 portability) by construction — nothing
// is copied or merged; each child is just the real thing.
//
// claude-muster never calls an LLM itself. It shells out to the user's local `claude` CLI, which
// runs on the user's own auth and wallet. Pure routing + process supervision.
import { spawn } from "node:child_process";
import { basename } from "node:path";

/** A child repo we can dispatch to. */
export interface DispatchTarget {
  /** Repo name (the namespace prefix used everywhere else) — what the user types. */
  name: string;
  /** Absolute repo directory; `claude -p` runs with this as cwd. */
  dir: string;
}

export interface DispatchOptions {
  /** Kill the child after this many ms (default: no timeout). */
  timeoutMs?: number;
  /** Override the binary (default "claude"). Tests inject a fake. */
  bin?: string;
  /** Max concurrent children for fanout (default: 4). */
  concurrency?: number;
  /** Injectable process runner — defaults to spawning `claude`. Tests pass a fake. */
  runner?: ProcessRunner;
}

/** Raw result of running a single child process. */
export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
  /** Set when the run was killed by the timeout. */
  timedOut?: boolean;
}

/** Runs one child claude and resolves with its captured output. Never rejects on non-zero exit. */
export type ProcessRunner = (
  bin: string,
  args: string[],
  cwd: string,
  timeoutMs: number | undefined,
) => Promise<RunResult>;

/** Structured outcome the parent session reads to monitor a dispatch. */
export interface DispatchResult {
  repo: string;
  ok: boolean;
  /** The child's final assistant text (parsed from `--output-format json`, else raw stdout). */
  text: string;
  code: number;
  error?: string;
}

/** Args we hand to `claude` for a headless, structured, single-shot run. */
export function dispatchArgs(task: string): string[] {
  return ["-p", task, "--output-format", "json"];
}

/** Send one task to one repo's Claude. Resolves with a structured result; never throws on child failure. */
export async function dispatch(
  target: DispatchTarget,
  task: string,
  opts: DispatchOptions = {},
): Promise<DispatchResult> {
  const run = opts.runner ?? spawnRunner;
  const bin = opts.bin ?? "claude";
  let result: RunResult;
  try {
    result = await run(bin, dispatchArgs(task), target.dir, opts.timeoutMs);
  } catch (err) {
    return { repo: target.name, ok: false, text: "", code: -1, error: (err as Error).message };
  }
  if (result.timedOut) {
    return { repo: target.name, ok: false, text: "", code: result.code, error: "timed out" };
  }
  if (result.code !== 0) {
    return {
      repo: target.name,
      ok: false,
      text: extractText(result.stdout),
      code: result.code,
      error: result.stderr.trim() || `claude exited with code ${result.code}`,
    };
  }
  return { repo: target.name, ok: true, text: extractText(result.stdout), code: 0 };
}

/** Dispatch the SAME task to many repos, bounded-concurrency. Order of results matches `targets`. */
export async function fanout(
  targets: DispatchTarget[],
  task: string,
  opts: DispatchOptions = {},
): Promise<DispatchResult[]> {
  const limit = Math.max(1, opts.concurrency ?? 4);
  const results = new Array<DispatchResult>(targets.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (true) {
      const i = next++;
      if (i >= targets.length) return;
      results[i] = await dispatch(targets[i]!, task, opts);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, targets.length) }, worker));
  return results;
}

/**
 * Pull the final assistant text out of `claude -p --output-format json` stdout.
 * That format emits a single JSON object with a `result` field. If parsing fails (older CLI,
 * plain-text output, partial stream), fall back to the raw stdout so nothing is silently lost.
 */
export function extractText(stdout: string): string {
  const trimmed = stdout.trim();
  if (!trimmed) return "";
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (typeof parsed.result === "string") return parsed.result;
    if (typeof parsed.text === "string") return parsed.text;
  } catch {
    // not JSON — fall through to raw
  }
  return trimmed;
}

/** Default runner: spawn `claude`, capture stdout/stderr, enforce an optional timeout. */
const spawnRunner: ProcessRunner = (bin, args, cwd, timeoutMs) =>
  new Promise<RunResult>((resolve) => {
    const child = spawn(bin, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let timer: NodeJS.Timeout | undefined;
    if (timeoutMs && timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
      }, timeoutMs);
    }
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      // ENOENT etc. → surface as a non-zero result rather than throwing.
      resolve({ code: -1, stdout, stderr: stderr || err.message, timedOut });
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code: code ?? 0, stdout, stderr, timedOut });
    });
  });

/** Turn discovered repo dirs into dispatch targets (name = basename, the namespace prefix). */
export function toTargets(repoDirs: string[]): DispatchTarget[] {
  return repoDirs.map((dir) => ({ name: basename(dir), dir }));
}

/** Resolve a repo name against discovered targets. Throws a clear message if not found. */
export function resolveTarget(targets: DispatchTarget[], name: string): DispatchTarget {
  const match = targets.find((t) => t.name === name);
  if (!match) {
    const known = targets.map((t) => t.name).join(", ") || "(none found)";
    throw new Error(`no child repo named "${name}" — known repos: ${known}`);
  }
  return match;
}
