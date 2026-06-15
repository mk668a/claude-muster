// Test helpers: build throwaway polyrepos under os.tmpdir(). No fs mocking — real dirs.
import { mkdtemp, mkdir, writeFile, rm, lstat, readlink, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function makeRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "cm-"));
}

export async function cleanup(root: string): Promise<void> {
  await rm(root, { recursive: true, force: true });
}

/** Create `<root>/<repo>/.claude/skills/<name>/SKILL.md`. */
export async function addSkill(root: string, repo: string, name: string, body = "# skill\n"): Promise<void> {
  const dir = join(root, repo, ".claude", "skills", name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "SKILL.md"), body, "utf8");
}

/** Create `<root>/<repo>/.claude/commands/<name>.md`. */
export async function addCommand(root: string, repo: string, name: string, body = "do a thing\n"): Promise<void> {
  const dir = join(root, repo, ".claude", "commands");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${name}.md`), body, "utf8");
}

/** Create an agent file. `agentName` goes into frontmatter `name:`; omit for no frontmatter. */
export async function addAgent(
  root: string,
  repo: string,
  fileName: string,
  agentName: string | null,
  body = "You are a helper.\n",
): Promise<void> {
  const dir = join(root, repo, ".claude", "agents");
  await mkdir(dir, { recursive: true });
  const content =
    agentName === null
      ? body
      : `---\nname: ${agentName}\ndescription: test agent\n---\n${body}`;
  await writeFile(join(dir, `${fileName}.md`), content, "utf8");
}

/** Create `<root>/<repo>/.claude/hooks/<fileName>` (extension included in fileName). */
export async function addHook(root: string, repo: string, fileName: string, body = "#!/bin/sh\necho hi\n"): Promise<void> {
  const dir = join(root, repo, ".claude", "hooks");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, fileName), body, "utf8");
}

/** Write `<root>/<repo>/.claude/settings.json` (repo "" → the root's own settings.json). */
export async function addSettings(root: string, repo: string, settings: unknown): Promise<void> {
  const dir = join(root, repo, ".claude");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "settings.json"), JSON.stringify(settings, null, 2), "utf8");
}

export async function isSymlink(path: string): Promise<boolean> {
  const stat = await lstat(path);
  return stat.isSymbolicLink();
}

export { lstat, readlink, readFile, writeFile, mkdir, rm };
