import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

function runCli(args: string[]): Promise<{
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

test("boilerbrain CLI runs the pipeline into the requested output directory", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "boilerbrain-cli-"));
  const result = await runCli([
    "--out",
    outputDir,
    "build a notes API with authentication",
  ]);
  const generatedAppFile = await readFile(join(outputDir, "src", "app.ts"), "utf8");
  const generatedChecklist = await readFile(
    join(outputDir, "validation-checklist.md"),
    "utf8",
  );

  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /Output directory:/);
  assert.match(result.stdout, /\[8\/8\] Validation Checklist/);
  assert.match(generatedAppFile, /handleAuthRoute/);
  assert.match(
    generatedChecklist,
    /Generated project dependencies are not installed/,
  );
});

test("boilerbrain CLI prints usage and exits non-zero when the prompt is missing", async () => {
  const result = await runCli([]);

  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /A natural-language prompt is required/);
  assert.match(result.stderr, /Usage:/);
});

test("boilerbrain CLI prints help without running the pipeline", async () => {
  const result = await runCli(["--help"]);

  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /Usage:/);
  assert.match(result.stdout, /--output-dir/);
});
