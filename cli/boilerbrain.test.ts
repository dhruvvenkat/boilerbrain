import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

import { runBoilerbrainCli } from "./boilerbrain.ts";

function createBufferConsole(): {
  stdout: string;
  stderr: string;
  stdoutLogger: Pick<Console, "log">;
  stderrLogger: Pick<Console, "error">;
} {
  const buffer = {
    stdout: "",
    stderr: "",
  };

  return {
    get stdout() {
      return buffer.stdout;
    },
    get stderr() {
      return buffer.stderr;
    },
    stdoutLogger: {
      log(message: string) {
        buffer.stdout += `${message}\n`;
      },
    },
    stderrLogger: {
      error(message: string) {
        buffer.stderr += `${message}\n`;
      },
    },
  };
}

function runCliProgram(args: string[]): Promise<{
  exitCode: number | null;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["cli/boilerbrain.ts", ...args], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolve({
        exitCode,
        stdout,
        stderr,
      });
    });
  });
}

test("boilerbrain CLI launches the TUI by default", async () => {
  const calls: Array<{ prompt?: string; outputDir?: string }> = [];
  const capture = createBufferConsole();

  await runBoilerbrainCli(
    ["--out", "/tmp/generated", "build a notes API"],
    {
      runBoilerbrainTui: async (options) => {
        calls.push(options);
      },
      stdout: capture.stdoutLogger,
      stderr: capture.stderrLogger,
      getCurrentWorkingDirectory: () => "/tmp/default",
    },
  );

  assert.deepEqual(calls, [
    {
      prompt: "build a notes API",
      outputDir: "/tmp/generated",
    },
  ]);
  assert.equal(capture.stdout.trim(), "");
  assert.equal(capture.stderr.trim(), "");
});

test("boilerbrain CLI preserves the plain pipeline path", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "boilerbrain-cli-"));
  const capture = createBufferConsole();

  await runBoilerbrainCli(
    ["--plain", "--out", outputDir, "build a notes API with authentication"],
    {
      stdout: capture.stdoutLogger,
      stderr: capture.stderrLogger,
      getCurrentWorkingDirectory: () => outputDir,
    },
  );

  const generatedAppFile = await readFile(join(outputDir, "src", "app.ts"), "utf8");
  const generatedChecklist = await readFile(
    join(outputDir, "validation-checklist.md"),
    "utf8",
  );

  assert.match(capture.stdout, /Output directory:/);
  assert.match(capture.stdout, /\[8\/8\] Validation Checklist/);
  assert.match(generatedAppFile, /handleAuthRoute/);
  assert.match(
    generatedChecklist,
    /Generated project dependencies are not installed/,
  );
});

test("boilerbrain CLI prints usage and exits cleanly when help is requested", async () => {
  const calls: Array<{ prompt?: string; outputDir?: string }> = [];
  const capture = createBufferConsole();

  await runBoilerbrainCli(["--help"], {
    runBoilerbrainTui: async (options) => {
      calls.push(options);
    },
    stdout: capture.stdoutLogger,
    stderr: capture.stderrLogger,
  });

  assert.deepEqual(calls, []);
  assert.match(capture.stdout, /boilerbrain --plain/);
});

test("boilerbrain CLI executes when run as a program", async () => {
  const result = await runCliProgram(["--help"]);

  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /Usage:/);
  assert.match(result.stdout, /boilerbrain --plain/);
  assert.equal(result.stderr.trim(), "");
});
