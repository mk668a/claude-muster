// Install the bundled routing skill into a workspace's `.claude/skills/`, so the Claude you run
// at the root knows it can delegate per-repo work via `claude-muster dispatch`. Optionally also
// install a SessionStart hook (`--hook`) that briefs the root Claude on the available repos the
// moment a session starts. Both are reversible: `uninstall` removes exactly what we placed.
import { cp, mkdir, rm, lstat, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { CliError } from "./errors.js";

export const SKILL_NAME = "muster-dispatch";

/** The hook command we register. Also the marker `uninstall` matches on to remove only our entry. */
export const HOOK_COMMAND = "claude-muster repos --context";

type Json = Record<string, unknown>;

/** Absolute path to the bundled skill template, resolved from this module's location. */
function templateDir(): string {
  // Built: dist/cli.js → ../templates/muster-dispatch.  Dev (tsx): src/install.ts → ../templates/...
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "templates", SKILL_NAME);
}

function settingsPath(root: string): string {
  return join(root, ".claude", "settings.json");
}

export interface InstallResult {
  /** Where the skill was written. */
  path: string;
  /** True if a skill of this name was already there and we overwrote it (only with force). */
  overwrote: boolean;
  /** Set when `--hook` was requested: whether we added the hook or it was already present. */
  hook?: "added" | "present";
}

export async function install(
  root: string,
  opts: { force?: boolean; hook?: boolean } = {},
): Promise<InstallResult> {
  const src = templateDir();
  if (!(await isDir(src))) {
    throw new CliError(`bundled skill template missing at ${src} — is the package built/published correctly?`);
  }
  const dest = join(root, ".claude", "skills", SKILL_NAME);
  const existed = await exists(dest);
  if (existed && !opts.force) {
    throw new CliError(`"${SKILL_NAME}" is already installed at ${dest} — re-run with --force to overwrite`);
  }
  if (existed) await rm(dest, { recursive: true, force: true });
  await mkdir(dirname(dest), { recursive: true });
  await cp(src, dest, { recursive: true });

  const result: InstallResult = { path: dest, overwrote: existed };
  if (opts.hook) result.hook = await installHook(root);
  return result;
}

/** Remove the installed skill AND any hook we registered. Returns what was actually removed. */
export async function uninstall(root: string): Promise<{ skill: boolean; hook: boolean }> {
  const dest = join(root, ".claude", "skills", SKILL_NAME);
  let skill = false;
  if (await exists(dest)) {
    await rm(dest, { recursive: true, force: true });
    skill = true;
  }
  const hook = await uninstallHook(root);
  return { skill, hook };
}

// --- SessionStart hook (opt-in) --------------------------------------------

/** Add our SessionStart hook to `.claude/settings.json`, non-destructively and idempotently. */
export async function installHook(root: string): Promise<"added" | "present"> {
  const path = settingsPath(root);
  const settings = (await readSettings(path)) ?? {};
  const hooks = isObject(settings.hooks) ? (settings.hooks as Json) : (settings.hooks = {});
  const list = Array.isArray(hooks.SessionStart) ? (hooks.SessionStart as unknown[]) : (hooks.SessionStart = []);

  if (list.some(groupHasOurCommand)) return "present";
  list.push({ hooks: [{ type: "command", command: HOOK_COMMAND }] });
  await writeSettings(path, settings);
  return "added";
}

/** Remove only the hook entry we added; prune empties; delete the file if nothing else remains. */
export async function uninstallHook(root: string): Promise<boolean> {
  const path = settingsPath(root);
  const settings = await readSettings(path);
  if (!settings || !isObject(settings.hooks)) return false;
  const hooks = settings.hooks as Json;
  if (!Array.isArray(hooks.SessionStart)) return false;

  let removed = false;
  const groups = (hooks.SessionStart as unknown[])
    .map((group) => {
      if (!isObject(group) || !Array.isArray(group.hooks)) return group;
      const before = group.hooks.length;
      const filtered = (group.hooks as unknown[]).filter((h) => !isOurCommand(h));
      if (filtered.length !== before) removed = true;
      group.hooks = filtered;
      return group;
    })
    // Drop groups that are now empty (only if they're our shape — an empty `hooks` array).
    .filter((group) => !(isObject(group) && Array.isArray(group.hooks) && group.hooks.length === 0));

  if (!removed) return false;

  if (groups.length === 0) delete hooks.SessionStart;
  else hooks.SessionStart = groups;
  if (isEmpty(hooks)) delete settings.hooks;

  if (isEmpty(settings)) await rm(path, { force: true });
  else await writeSettings(path, settings);
  return true;
}

/** The SessionStart additionalContext payload that `claude-muster repos --context` emits. */
export function sessionStartPayload(repoNames: string[]): string {
  const context =
    repoNames.length === 0
      ? "This is a claude-muster workspace, but no child repos with a .claude/ were found here."
      : `This is a claude-muster workspace. You can delegate per-repo work to these child repos, ` +
        `each of which has its own .claude/ tooling: ${repoNames.join(", ")}. ` +
        `To hand a task to one, run \`claude-muster dispatch <repo> "<task>"\`; the muster-dispatch ` +
        `skill explains when and how. Prefer delegating over doing a repo's work yourself from here.`;
  return JSON.stringify({
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: context },
  });
}

function groupHasOurCommand(group: unknown): boolean {
  return isObject(group) && Array.isArray(group.hooks) && group.hooks.some(isOurCommand);
}

function isOurCommand(hook: unknown): boolean {
  return isObject(hook) && typeof hook.command === "string" && hook.command.includes(HOOK_COMMAND);
}

// --- settings I/O -----------------------------------------------------------

async function readSettings(path: string): Promise<Json | null> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new CliError(`could not read ${path}: ${(err as Error).message}`);
  }
  try {
    const parsed = JSON.parse(raw);
    if (!isObject(parsed)) throw new Error("not a JSON object");
    return parsed;
  } catch (err) {
    throw new CliError(`${path} is not valid settings JSON: ${(err as Error).message}`);
  }
}

async function writeSettings(path: string, settings: Json): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}

// --- helpers ----------------------------------------------------------------

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEmpty(obj: Json): boolean {
  return Object.keys(obj).length === 0;
}

async function isDir(p: string): Promise<boolean> {
  try {
    return (await lstat(p)).isDirectory();
  } catch {
    return false;
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    await lstat(p);
    return true;
  } catch {
    return false;
  }
}
