// Minimal leveled logging. No external logger.
//   info()    → stdout (the federation summary — the primary UX output, matches README hero)
//   warn()    → stderr, "warning:" prefix (collisions, missing targets — non-fatal)
//   error()   → stderr, "claude-muster:" prefix (fatal, paired with a non-zero exit)
//   verbose() → stdout, only when --verbose is set

let verboseEnabled = false;

export function setVerbose(on: boolean): void {
  verboseEnabled = on;
}

export function info(message: string): void {
  process.stdout.write(`${message}\n`);
}

export function warn(message: string): void {
  process.stderr.write(`warning: ${message}\n`);
}

export function error(message: string): void {
  process.stderr.write(`claude-muster: ${message}\n`);
}

export function verbose(message: string): void {
  if (verboseEnabled) process.stdout.write(`${message}\n`);
}
