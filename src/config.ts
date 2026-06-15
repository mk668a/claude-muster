// Load and validate the optional `claude-muster.json` from the root.
// Absent file ⇒ all defaults. Malformed JSON or wrong shape ⇒ CliError.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Config } from "./types.js";
import { CliError } from "./errors.js";

export const CONFIG_FILENAME = "claude-muster.json";

const DEFAULTS: Config = {
  // "**" = every repo discovered within `depth` (so bumping depth actually reaches deeper repos;
  // a single-segment "*" would silently drop nested ones). Narrow with explicit globs.
  include: ["**"],
  exclude: [],
  depth: 1,
  paths: [],
};

export function defaultConfig(): Config {
  return {
    ...DEFAULTS,
    include: [...DEFAULTS.include],
    exclude: [...DEFAULTS.exclude],
    paths: [...DEFAULTS.paths],
  };
}

export async function loadConfig(root: string): Promise<Config> {
  const path = join(root, CONFIG_FILENAME);
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return defaultConfig();
    throw new CliError(`could not read ${CONFIG_FILENAME}: ${(err as Error).message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new CliError(`${CONFIG_FILENAME} is not valid JSON: ${(err as Error).message}`);
  }

  return validate(parsed);
}

function validate(parsed: unknown): Config {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new CliError(`${CONFIG_FILENAME} must be a JSON object`);
  }
  const obj = parsed as Record<string, unknown>;
  const config = defaultConfig();

  if (obj.include !== undefined) config.include = asStringArray(obj.include, "include");
  if (obj.exclude !== undefined) config.exclude = asStringArray(obj.exclude, "exclude");
  if (obj.paths !== undefined) config.paths = asStringArray(obj.paths, "paths");
  if (obj.depth !== undefined) {
    if (typeof obj.depth !== "number" || !Number.isInteger(obj.depth) || obj.depth < 1) {
      throw new CliError(`${CONFIG_FILENAME}: "depth" must be a positive integer`);
    }
    config.depth = obj.depth;
  }
  return config;
}

function asStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
    throw new CliError(`${CONFIG_FILENAME}: "${field}" must be an array of strings`);
  }
  return value as string[];
}
