// Orchestrator dispatch: the runner is injected, so these never spawn a real `claude`.
import { describe, it, expect } from "vitest";
import {
  dispatch,
  fanout,
  extractText,
  dispatchArgs,
  toTargets,
  resolveTarget,
  type ProcessRunner,
  type RunResult,
} from "../src/dispatch.js";

/** A runner that records every call and returns scripted results keyed by cwd. */
function fakeRunner(
  byCwd: Record<string, Partial<RunResult>>,
  calls: { bin: string; args: string[]; cwd: string }[] = [],
): ProcessRunner {
  return async (bin, args, cwd) => {
    calls.push({ bin, args, cwd });
    const r = byCwd[cwd] ?? { code: 0, stdout: "" };
    return { code: r.code ?? 0, stdout: r.stdout ?? "", stderr: r.stderr ?? "", timedOut: r.timedOut };
  };
}

describe("dispatchArgs", () => {
  it("requests headless JSON output", () => {
    expect(dispatchArgs("fix it")).toEqual(["-p", "fix it", "--output-format", "json"]);
  });
});

describe("extractText", () => {
  it("pulls .result out of claude -p json output", () => {
    expect(extractText(JSON.stringify({ type: "result", result: "done!" }))).toBe("done!");
  });
  it("falls back to .text", () => {
    expect(extractText(JSON.stringify({ text: "hi" }))).toBe("hi");
  });
  it("falls back to raw stdout when not JSON", () => {
    expect(extractText("plain text output")).toBe("plain text output");
  });
  it("is empty for empty stdout", () => {
    expect(extractText("   ")).toBe("");
  });
});

describe("dispatch", () => {
  it("runs claude in the target repo's dir and returns its result text", async () => {
    const calls: { bin: string; args: string[]; cwd: string }[] = [];
    const runner = fakeRunner({ "/work/api": { code: 0, stdout: JSON.stringify({ result: "lint fixed" }) } }, calls);

    const res = await dispatch({ name: "api", dir: "/work/api" }, "fix lint", { runner });

    expect(res).toEqual({ repo: "api", ok: true, text: "lint fixed", code: 0 });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.cwd).toBe("/work/api"); // ← the whole point: child runs IN its repo
    expect(calls[0]!.args).toEqual(["-p", "fix lint", "--output-format", "json"]);
  });

  it("reports failure with stderr on non-zero exit", async () => {
    const runner = fakeRunner({ "/work/api": { code: 2, stdout: "", stderr: "boom" } });
    const res = await dispatch({ name: "api", dir: "/work/api" }, "x", { runner });
    expect(res.ok).toBe(false);
    expect(res.code).toBe(2);
    expect(res.error).toBe("boom");
  });

  it("reports a timeout distinctly", async () => {
    const runner = fakeRunner({ "/work/api": { code: 143, timedOut: true } });
    const res = await dispatch({ name: "api", dir: "/work/api" }, "x", { runner });
    expect(res.ok).toBe(false);
    expect(res.error).toBe("timed out");
  });

  it("surfaces a runner throw as a failed result, not an exception", async () => {
    const runner: ProcessRunner = async () => {
      throw new Error("ENOENT: claude not found");
    };
    const res = await dispatch({ name: "api", dir: "/work/api" }, "x", { runner });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("ENOENT");
  });
});

describe("fanout", () => {
  it("dispatches the same task to every repo, preserving order", async () => {
    const runner = fakeRunner({
      "/work/api": { stdout: JSON.stringify({ result: "api ok" }) },
      "/work/web": { stdout: JSON.stringify({ result: "web ok" }) },
      "/work/cli": { code: 1, stderr: "cli failed" },
    });
    const targets = [
      { name: "api", dir: "/work/api" },
      { name: "web", dir: "/work/web" },
      { name: "cli", dir: "/work/cli" },
    ];

    const results = await fanout(targets, "what is your test command?", { runner, concurrency: 2 });

    expect(results.map((r) => r.repo)).toEqual(["api", "web", "cli"]);
    expect(results[0]).toMatchObject({ repo: "api", ok: true, text: "api ok" });
    expect(results[2]).toMatchObject({ repo: "cli", ok: false });
  });

  it("respects the concurrency cap", async () => {
    let active = 0;
    let peak = 0;
    const runner: ProcessRunner = async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return { code: 0, stdout: "", stderr: "" };
    };
    const targets = Array.from({ length: 6 }, (_, i) => ({ name: `r${i}`, dir: `/work/r${i}` }));
    await fanout(targets, "x", { runner, concurrency: 2 });
    expect(peak).toBeLessThanOrEqual(2);
  });
});

describe("toTargets / resolveTarget", () => {
  it("derives names from dir basenames", () => {
    expect(toTargets(["/work/api", "/work/web"])).toEqual([
      { name: "api", dir: "/work/api" },
      { name: "web", dir: "/work/web" },
    ]);
  });
  it("resolves a known repo and throws a helpful error otherwise", () => {
    const targets = toTargets(["/work/api", "/work/web"]);
    expect(resolveTarget(targets, "web")).toEqual({ name: "web", dir: "/work/web" });
    expect(() => resolveTarget(targets, "nope")).toThrow(/known repos: api, web/);
  });
});
