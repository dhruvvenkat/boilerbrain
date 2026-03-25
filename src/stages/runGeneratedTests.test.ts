import assert from "node:assert/strict";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildProjectArchitecture } from "./generateArchitecture.ts";
import { buildProjectSpec, type ProjectSpec } from "./generateSpec.ts";
import { generateStarterCode } from "./generateStarterCode.ts";
import { generateStarterTests } from "./generateTests.ts";
import { runGeneratedTests } from "./runGeneratedTests.ts";
import { scaffoldProject } from "./scaffoldProject.ts";

async function setupGeneratedProject(prompt: string): Promise<{
  outputDir: string;
  spec: ReturnType<typeof buildProjectSpec>;
  architecture: ReturnType<typeof buildProjectArchitecture>;
}> {
  const outputDir = await mkdtemp(join(tmpdir(), "boilerbrain-run-tests-"));
  const spec = buildProjectSpec(prompt);
  const architecture = buildProjectArchitecture(spec);

  await scaffoldProject(spec, architecture, { outputDir });
  await generateStarterCode(spec, architecture, { outputDir });
  await generateStarterTests(spec, architecture, { outputDir });

  return {
    outputDir,
    spec,
    architecture,
  };
}

test("runGeneratedTests skips execution when generated dependencies are not installed", async () => {
  const { outputDir, spec, architecture } = await setupGeneratedProject(
    "build a calendar API",
  );
  const result = await runGeneratedTests(spec, architecture, { outputDir });

  assert.equal(result.status, "skipped");
  assert.equal(result.exitCode, null);
  assert.match(result.reason ?? "", /npm install/);
});

test("runGeneratedTests reports a passing Jest run when the command succeeds", async () => {
  const { outputDir, spec, architecture } = await setupGeneratedProject(
    "build a notes API",
  );
  const calls: Array<{ projectRoot: string; command: string; args: string[] }> =
    [];

  await mkdir(join(outputDir, "node_modules"), { recursive: true });

  const result = await runGeneratedTests(spec, architecture, {
    outputDir,
    commandRunner: async (projectRoot, command, args) => {
      calls.push({
        projectRoot,
        command,
        args,
      });

      return {
        exitCode: 0,
        stdout: "PASS tests/notes.test.ts",
        stderr: "",
      };
    },
  });

  assert.equal(result.status, "passed");
  assert.equal(result.exitCode, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.projectRoot, outputDir);
  assert.equal(calls[0]?.command, "npm");
  assert.deepEqual(calls[0]?.args, ["test"]);
});

test("runGeneratedTests reports failure details when the generated Jest suite fails", async () => {
  const { outputDir, spec, architecture } = await setupGeneratedProject(
    "build a todo API with built-in authentication",
  );

  await mkdir(join(outputDir, "node_modules"), { recursive: true });

  const result = await runGeneratedTests(spec, architecture, {
    outputDir,
    commandRunner: async () => ({
      exitCode: 1,
      stdout: "",
      stderr: "FAIL tests/auth.test.ts",
    }),
  });

  assert.equal(result.status, "failed");
  assert.equal(result.exitCode, 1);
  assert.match(result.reason ?? "", /non-zero status/);
  assert.match(result.stderr, /FAIL tests\/auth.test\.ts/);
});

test("runGeneratedTests fails clearly for unsupported stack values", async () => {
  const { outputDir, spec, architecture } = await setupGeneratedProject(
    "build a todo API",
  );
  const unsupportedSpec = {
    ...spec,
    stack: {
      ...spec.stack,
      runtime: "bun",
    },
  } as unknown as ProjectSpec;

  await assert.rejects(
    () => runGeneratedTests(unsupportedSpec, architecture, { outputDir }),
    /Unsupported values: runtime=bun/,
  );
});
