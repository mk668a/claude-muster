// Shared types for claude-muster. Pure declarations — no logic lives here.

export interface Config {
  /** Globs matched against each child repo path relative to root. Default `["**"]` (all discovered). */
  include: string[];
  /** Globs to exclude. Default `[]`. */
  exclude: string[];
  /** How deep to scan for child `.claude/` dirs. Default `1` (direct children). */
  depth: number;
  /** Extra repo paths (absolute, or relative to root) to include regardless of depth/include. Default `[]`. */
  paths: string[];
}
