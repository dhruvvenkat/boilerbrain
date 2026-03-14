import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildProjectSpec, generateSpec } from "./generateSpec.ts";

test("buildProjectSpec derives a PRD-aligned backend API spec", () => {
  const spec = buildProjectSpec(
    "build a todo API with built-in authentication",
  );

  assert.equal(spec.projectName, "todo-api");
  assert.equal(spec.projectType, "backend-api");
  assert.equal(spec.stack.runtime, "node");
  assert.equal(spec.stack.language, "typescript");
  assert.equal(spec.stack.apiStyle, "rest");
  assert.equal(spec.stack.testFramework, "jest");
  assert.equal(spec.domain.primaryResource, "todo");
  assert.equal(spec.domain.authenticationRequired, true);
  assert.match(spec.summary, /authentication/i);
});

test("generateSpec writes spec.json to the requested output directory", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "boilerbrain-spec-"));
  const result = await generateSpec("build a calendar API", { outputDir });
  const fileContents = await readFile(result.outputPath, "utf8");
  const writtenSpec = JSON.parse(fileContents);

  assert.equal(result.outputPath, join(outputDir, "spec.json"));
  assert.equal(writtenSpec.projectName, "calendar-api");
  assert.equal(writtenSpec.sourcePrompt, "build a calendar API");
});

test("generateSpec defaults to writing spec.json inside the src directory", async () => {
  const workingDir = await mkdtemp(join(tmpdir(), "boilerbrain-cwd-"));
  const previousCwd = process.cwd();

  process.chdir(workingDir);

  try {
    const result = await generateSpec("build a notes API");
    const fileContents = await readFile(result.outputPath, "utf8");
    const writtenSpec = JSON.parse(fileContents);

    assert.equal(result.outputPath, join(workingDir, "src", "spec.json"));
    assert.equal(writtenSpec.projectName, "notes-api");
  } finally {
    process.chdir(previousCwd);
  }
});
