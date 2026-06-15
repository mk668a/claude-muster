// Typed, user-facing error. cli.ts catches this at the top level, prints
// `claude-muster: <message>` to stderr, and exits with `exitCode`.
// Anything that is NOT a CliError is an internal bug and surfaces with a stack.
export class CliError extends Error {
  constructor(
    message: string,
    readonly exitCode = 1,
  ) {
    super(message);
    this.name = "CliError";
  }
}
