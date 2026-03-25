import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildProjectArchitecture } from "./generateArchitecture.ts";
import { buildProjectSpec, type ProjectSpec } from "./generateSpec.ts";
import { generateStarterCode } from "./generateStarterCode.ts";
import { generateStarterTests } from "./generateTests.ts";
import { scaffoldProject } from "./scaffoldProject.ts";

test("generateStarterTests writes resource and health Jest tests for a public API", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "boilerbrain-starter-tests-"));
  const spec = buildProjectSpec("build a calendar API");
  const architecture = buildProjectArchitecture(spec);

  await scaffoldProject(spec, architecture, { outputDir });
  await generateStarterCode(spec, architecture, { outputDir });

  const result = await generateStarterTests(spec, architecture, { outputDir });
  const resourceTestContents = await readFile(
    join(outputDir, "tests", "calendar.test.ts"),
    "utf8",
  );
  const healthTestContents = await readFile(
    join(outputDir, "tests", "health.test.ts"),
    "utf8",
  );

  assert.equal(result.projectRoot, outputDir);
  assert.deepEqual(result.testFilesGenerated, [
    "tests/calendar.test.ts",
    "tests/health.test.ts",
  ]);
  assert.equal(result.filesSkipped.length, 0);
  assert.match(resourceTestContents, /describe\("CalendarService"/);
  assert.match(resourceTestContents, /const COLLECTION_PATH = "\/calendars"/);
  assert.match(resourceTestContents, /createApp/);
  assert.match(healthTestContents, /GET \/health returns a healthy JSON payload/);
});

test("generateStarterTests includes auth coverage when authentication is required", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "boilerbrain-auth-tests-"));
  const spec = buildProjectSpec("build a todo API with built-in authentication");
  const architecture = buildProjectArchitecture(spec);

  await scaffoldProject(spec, architecture, { outputDir });
  await generateStarterCode(spec, architecture, { outputDir });

  const result = await generateStarterTests(spec, architecture, { outputDir });
  const resourceTestContents = await readFile(
    join(outputDir, "tests", "todo.test.ts"),
    "utf8",
  );
  const authTestContents = await readFile(
    join(outputDir, "tests", "auth.test.ts"),
    "utf8",
  );

  assert.ok(result.filesWritten.includes("tests/auth.test.ts"));
  assert.match(resourceTestContents, /Bearer dev-token/);
  assert.match(authTestContents, /POST \/auth\/login returns the dev token/);
  assert.match(authTestContents, /Missing Authorization header\./);
  assert.match(authTestContents, /Invalid bearer token\./);
});

test("generateStarterTests writes into empty test files and skips non-empty files", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "boilerbrain-skip-tests-"));
  const spec = buildProjectSpec("build a notes API");
  const architecture = buildProjectArchitecture(spec);

  await scaffoldProject(spec, architecture, { outputDir });
  await generateStarterCode(spec, architecture, { outputDir });
  await writeFile(
    join(outputDir, "tests", "health.test.ts"),
    "existing health test\n",
    "utf8",
  );
  await writeFile(join(outputDir, "tests", "notes.test.ts"), "   \n", "utf8");

  const result = await generateStarterTests(spec, architecture, { outputDir });
  const healthTestContents = await readFile(
    join(outputDir, "tests", "health.test.ts"),
    "utf8",
  );
  const resourceTestContents = await readFile(
    join(outputDir, "tests", "notes.test.ts"),
    "utf8",
  );

  assert.ok(result.filesSkipped.includes("tests/health.test.ts"));
  assert.ok(result.filesWritten.includes("tests/notes.test.ts"));
  assert.equal(healthTestContents, "existing health test\n");
  assert.match(resourceTestContents, /describe\("NotesService"/);
});

test("generateStarterTests fails clearly for unsupported stack values", async () => {
  const outputDir = await mkdtemp(
    join(tmpdir(), "boilerbrain-unsupported-tests-"),
  );
  const spec = buildProjectSpec("build a todo API");
  const architecture = buildProjectArchitecture(spec);
  const unsupportedSpec = {
    ...spec,
    stack: {
      ...spec.stack,
      runtime: "bun",
    },
  } as unknown as ProjectSpec;

  await scaffoldProject(spec, architecture, { outputDir });
  await generateStarterCode(spec, architecture, { outputDir });

  await assert.rejects(
    () => generateStarterTests(unsupportedSpec, architecture, { outputDir }),
    /Unsupported values: runtime=bun/,
  );
});
