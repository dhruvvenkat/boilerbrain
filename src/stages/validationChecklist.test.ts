import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildProjectArchitecture } from "./generateArchitecture.ts";
import { buildProjectSpec } from "./generateSpec.ts";
import { generateStarterCode } from "./generateStarterCode.ts";
import { generateStarterTests } from "./generateTests.ts";
import { runGeneratedTests } from "./runGeneratedTests.ts";
import { scaffoldProject } from "./scaffoldProject.ts";
import { generateValidationChecklist } from "./validationChecklist.ts";

test("generateValidationChecklist writes a checklist file that summarizes the run", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "boilerbrain-checklist-"));
  const spec = buildProjectSpec("build a notes API with authentication");
  const architecture = buildProjectArchitecture(spec);
  const scaffoldResult = await scaffoldProject(spec, architecture, { outputDir });
  const starterCodeResult = await generateStarterCode(spec, architecture, {
    outputDir,
  });
  const starterTestsResult = await generateStarterTests(spec, architecture, {
    outputDir,
  });
  const runGeneratedTestsResult = await runGeneratedTests(spec, architecture, {
    outputDir,
  });
  const result = await generateValidationChecklist(
    spec,
    architecture,
    scaffoldResult,
    starterCodeResult,
    starterTestsResult,
    runGeneratedTestsResult,
    {
      outputDir,
    },
  );
  const checklistContents = await readFile(result.outputPath, "utf8");

  assert.equal(result.outputPath, join(outputDir, "validation-checklist.md"));
  assert.match(checklistContents, /# Validation Checklist/);
  assert.match(checklistContents, /Project: notes-api/);
  assert.match(checklistContents, /Authentication: enabled/);
  assert.match(checklistContents, /Run generated tests: Generated project dependencies are not installed/);
  assert.match(checklistContents, /npm install/);
  assert.match(checklistContents, /Which data persistence approach should the generated project assume\?/);
});
