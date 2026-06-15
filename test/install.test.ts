import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import {
  install,
  uninstall,
  installHook,
  uninstallHook,
  sessionStartPayload,
  SKILL_NAME,
  HOOK_COMMAND,
} from "../src/install.js";
import { CliError } from "../src/errors.js";
import { makeRoot, cleanup } from "./helpers.js";

async function readSettings(root: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await readFile(join(root, ".claude", "settings.json"), "utf8"));
  } catch {
    return null;
  }
}

describe("install / uninstall", () => {
  let root: string;
  beforeEach(async () => {
    root = await makeRoot();
  });
  afterEach(async () => {
    await cleanup(root);
  });

  it("copies the bundled routing skill into .claude/skills/", async () => {
    const res = await install(root);
    expect(res.overwrote).toBe(false);
    const skill = await readFile(join(root, ".claude", "skills", SKILL_NAME, "SKILL.md"), "utf8");
    expect(skill).toContain(`name: ${SKILL_NAME}`);
  });

  it("refuses to overwrite without --force, succeeds with it", async () => {
    await install(root);
    await expect(install(root)).rejects.toBeInstanceOf(CliError);
    const res = await install(root, { force: true });
    expect(res.overwrote).toBe(true);
  });

  it("uninstall removes the skill, and reports when nothing was there", async () => {
    expect(await uninstall(root)).toEqual({ skill: false, hook: false });
    await install(root);
    expect(await uninstall(root)).toEqual({ skill: true, hook: false });
    expect(await uninstall(root)).toEqual({ skill: false, hook: false });
  });
});

describe("SessionStart hook (opt-in)", () => {
  let root: string;
  beforeEach(async () => {
    root = await makeRoot();
  });
  afterEach(async () => {
    await cleanup(root);
  });

  it("install --hook adds a SessionStart hook running our command", async () => {
    const res = await install(root, { hook: true });
    expect(res.hook).toBe("added");
    const settings = await readSettings(root);
    const group = (settings!.hooks as any).SessionStart[0];
    expect(group.hooks[0].command).toBe(HOOK_COMMAND);
  });

  it("installHook is idempotent", async () => {
    expect(await installHook(root)).toBe("added");
    expect(await installHook(root)).toBe("present");
    const settings = await readSettings(root);
    expect((settings!.hooks as any).SessionStart).toHaveLength(1); // not duplicated
  });

  it("uninstall removes the hook and deletes a settings file that becomes empty", async () => {
    await install(root, { hook: true });
    expect(await uninstall(root)).toEqual({ skill: true, hook: true });
    expect(await readSettings(root)).toBeNull(); // file deleted, since nothing else was in it
  });

  it("preserves the user's own settings and hooks when removing ours", async () => {
    await mkdir(join(root, ".claude"), { recursive: true });
    await writeFile(
      join(root, ".claude", "settings.json"),
      JSON.stringify({
        env: { FOO: "bar" },
        hooks: { SessionStart: [{ hooks: [{ type: "command", command: "echo mine" }] }] },
      }),
      "utf8",
    );
    await installHook(root);
    expect(await uninstallHook(root)).toBe(true);

    const settings = await readSettings(root);
    expect(settings!.env).toEqual({ FOO: "bar" }); // untouched
    const groups = (settings!.hooks as any).SessionStart;
    expect(groups).toHaveLength(1);
    expect(groups[0].hooks[0].command).toBe("echo mine"); // the user's hook survives
  });

  it("uninstallHook is a no-op when no hook is present", async () => {
    expect(await uninstallHook(root)).toBe(false);
  });
});

describe("sessionStartPayload", () => {
  it("emits SessionStart additionalContext naming the repos", () => {
    const out = JSON.parse(sessionStartPayload(["api", "web"]));
    expect(out.hookSpecificOutput.hookEventName).toBe("SessionStart");
    expect(out.hookSpecificOutput.additionalContext).toContain("api, web");
    expect(out.hookSpecificOutput.additionalContext).toContain("claude-muster dispatch");
  });
  it("handles an empty workspace", () => {
    const out = JSON.parse(sessionStartPayload([]));
    expect(out.hookSpecificOutput.additionalContext).toContain("no child repos");
  });
});
