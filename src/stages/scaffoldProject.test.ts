import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildProjectArchitecture } from "./generateArchitecture.ts";
import { buildProjectSpec, type ProjectSpec } from "./generateSpec.ts";
import { scaffoldProject } from "./scaffoldProject.ts";

test("scaffoldProject creates the planned backend scaffold for a public API", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "boilerbrain-scaffold-"));
  const spec = buildProjectSpec("build a calendar API");
  const architecture = buildProjectArchitecture(spec);
  const result = await scaffoldProject(spec, architecture, { outputDir });

  assert.equal(result.projectRoot, outputDir);
  assert.deepEqual(result.directoriesCreated, [
    "src",
    "tests",
    "src/routes",
    "src/services",
    "src/types",
  ]);
  assert.equal(result.filesSkipped.length, 0);
  assert.ok(result.filesCreated.includes("src/app.ts"));
  assert.ok(result.filesCreated.includes("src/routes/calendars.ts"));
  assert.equal(await readFile(join(outputDir, "src", "app.ts"), "utf8"), "");
  assert.equal(
    await readFile(join(outputDir, "tests", "calendar.test.ts"), "utf8"),
    "",
  );
});

test("scaffoldProject adds auth-specific files when authentication is required", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "boilerbrain-scaffold-auth-"));
  const spec = buildProjectSpec("build a todo API with built-in authentication");
  const architecture = buildProjectArchitecture(spec);
  const result = await scaffoldProject(spec, architecture, { outputDir });

  assert.ok(result.directoriesCreated.includes("src/middleware"));
  assert.ok(result.filesCreated.includes("src/routes/auth.ts"));
  assert.ok(result.filesCreated.includes("src/middleware/auth.ts"));
  assert.ok(result.filesCreated.includes("tests/auth.test.ts"));
  assert.equal(
    await readFile(join(outputDir, "src", "middleware", "auth.ts"), "utf8"),
    "",
  );
});

test("scaffoldProject skips existing files without overwriting them", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "boilerbrain-scaffold-skip-"));
  const spec = buildProjectSpec("build a notes API");
  const architecture = buildProjectArchitecture(spec);

  await mkdir(join(outputDir, "src"), { recursive: true });
  await writeFile(
    join(outputDir, "src", "app.ts"),
    "existing app contents\n",
    "utf8",
  );

  const result = await scaffoldProject(spec, architecture, { outputDir });

  assert.ok(result.filesSkipped.includes("src/app.ts"));
  assert.equal(
    await readFile(join(outputDir, "src", "app.ts"), "utf8"),
    "existing app contents\n",
  );
  assert.ok(result.filesCreated.includes("src/server.ts"));
});

test("scaffoldProject fails when a planned file path is already a directory", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "boilerbrain-scaffold-conflict-"));
  const spec = buildProjectSpec("build a calendar API");
  const architecture = buildProjectArchitecture(spec);

  await mkdir(join(outputDir, "src", "app.ts"), { recursive: true });

  await assert.rejects(
    () => scaffoldProject(spec, architecture, { outputDir }),
    /Cannot create scaffold file "src\/app\.ts" because a directory already exists at that path\./,
  );
});

test("scaffoldProject fails clearly for unsupported stack values", async () => {
  const outputDir = await mkdtemp(
    join(tmpdir(), "boilerbrain-scaffold-unsupported-"),
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

  await assert.rejects(
    () => scaffoldProject(unsupportedSpec, architecture, { outputDir }),
    /Unsupported values: runtime=bun/,
  );
});
