import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { loadConfig } from "../src/config.js";
import { CliError } from "../src/errors.js";
import { makeRoot, cleanup } from "./helpers.js";

describe("loadConfig", () => {
  let root: string;
  beforeEach(async () => {
    root = await makeRoot();
  });
  afterEach(async () => {
    await cleanup(root);
  });

  it("returns defaults when no config file is present", async () => {
    const config = await loadConfig(root);
    expect(config).toEqual({ include: ["**"], exclude: [], depth: 1, paths: [] });
  });

  it("merges overrides over defaults", async () => {
    await writeFile(
      join(root, "claude-muster.json"),
      JSON.stringify({ include: ["webapp", "api/*"], depth: 2 }),
      "utf8",
    );
    const config = await loadConfig(root);
    expect(config.include).toEqual(["webapp", "api/*"]);
    expect(config.depth).toBe(2);
    expect(config.exclude).toEqual([]);
  });

  it("throws CliError on malformed JSON", async () => {
    await writeFile(join(root, "claude-muster.json"), "{ not json", "utf8");
    await expect(loadConfig(root)).rejects.toBeInstanceOf(CliError);
  });

  it("throws CliError on a bad depth", async () => {
    await writeFile(join(root, "claude-muster.json"), JSON.stringify({ depth: 0 }), "utf8");
    await expect(loadConfig(root)).rejects.toBeInstanceOf(CliError);
  });
});
