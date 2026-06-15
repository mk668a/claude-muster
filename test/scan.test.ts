import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { basename } from "node:path";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { discoverRepos, hasClaude } from "../src/scan.js";
import { defaultConfig } from "../src/config.js";
import { makeRoot, cleanup, addSkill } from "./helpers.js";

describe("discoverRepos", () => {
  let root: string;
  beforeEach(async () => {
    root = await makeRoot();
  });
  afterEach(async () => {
    await cleanup(root);
  });

  it("finds direct children that have a .claude/ (depth 1)", async () => {
    await addSkill(root, "api", "lint");
    await addSkill(root, "web", "deploy");
    await mkdir(join(root, "not-a-repo"), { recursive: true }); // no .claude/ → ignored

    const repos = (await discoverRepos(root, defaultConfig())).map((d) => basename(d)).sort();
    expect(repos).toEqual(["api", "web"]);
  });

  it("ignores nested repos beyond depth, reaches them when depth is raised", async () => {
    await addSkill(root, "services/inner", "x"); // two levels down

    const shallow = await discoverRepos(root, { ...defaultConfig(), depth: 1 });
    expect(shallow).toEqual([]);

    const deep = (await discoverRepos(root, { ...defaultConfig(), depth: 2 })).map((d) => basename(d));
    expect(deep).toEqual(["inner"]);
  });

  it("honors include/exclude globs", async () => {
    await addSkill(root, "api", "x");
    await addSkill(root, "web", "x");
    await addSkill(root, "legacy-thing", "x");

    const included = (await discoverRepos(root, { ...defaultConfig(), include: ["api", "web"] }))
      .map((d) => basename(d))
      .sort();
    expect(included).toEqual(["api", "web"]);

    const excluded = (await discoverRepos(root, { ...defaultConfig(), exclude: ["legacy-*"] }))
      .map((d) => basename(d))
      .sort();
    expect(excluded).toEqual(["api", "web"]);
  });

  it("hasClaude is true only for a real .claude directory", async () => {
    await addSkill(root, "api", "x");
    expect(await hasClaude(join(root, "api"))).toBe(true);
    expect(await hasClaude(join(root, "nope"))).toBe(false);
  });
});
