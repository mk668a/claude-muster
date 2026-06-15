// Discover child repos under `root` (plus any explicit `config.paths`). A "repo" = any directory
// (within `config.depth` levels of root, or listed in `config.paths`) that contains a `.claude/`.
// The orchestrator dispatches to each of these by running `claude` inside it.
import { readdir, stat } from "node:fs/promises";
import { join, relative, resolve, sep as pathSep } from "node:path";
import picomatch from "picomatch";
import type { Config } from "./types.js";

/**
 * The set of repo directories this config can dispatch to: depth-bounded children matching
 * include/exclude, plus explicit `config.paths`. Absolute, deduped, in a stable order.
 */
export async function discoverRepos(root: string, config: Config): Promise<string[]> {
  const isMatch = picomatch(config.include.length ? config.include : ["**"], { dot: false });
  const isExcluded = config.exclude.length ? picomatch(config.exclude) : () => false;

  const repoDirs = new Set<string>();
  for (const repoDir of await findRepos(root, config.depth)) {
    const relPath = toPosix(relative(root, repoDir));
    if (isMatch(relPath) && !isExcluded(relPath)) repoDirs.add(repoDir);
  }
  // Explicit paths bypass include/exclude/depth — the user asked for them by name.
  for (const p of config.paths) {
    const dir = resolve(root, p);
    if (dir !== root && (await hasClaude(dir))) repoDirs.add(dir);
  }
  return [...repoDirs];
}

/** BFS over child directories up to `depth` levels; a repo is any dir containing `.claude/`. */
export async function findRepos(root: string, depth: number): Promise<string[]> {
  const repos: string[] = [];
  let frontier = [root];
  for (let level = 1; level <= depth; level++) {
    const next: string[] = [];
    for (const dir of frontier) {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name === ".claude" || entry.name === "node_modules")
          continue;
        const childDir = join(dir, entry.name);
        // The child itself is a repo if it has .claude/ — but never include root itself.
        if (childDir !== root && (await hasClaude(childDir))) repos.push(childDir);
        next.push(childDir);
      }
    }
    frontier = next;
  }
  return repos;
}

/** True iff `dir` contains a `.claude` DIRECTORY (a single stat — not a full readdir). */
export async function hasClaude(dir: string): Promise<boolean> {
  try {
    return (await stat(join(dir, ".claude"))).isDirectory();
  } catch {
    return false;
  }
}

function toPosix(p: string): string {
  return pathSep === "/" ? p : p.split(pathSep).join("/");
}
