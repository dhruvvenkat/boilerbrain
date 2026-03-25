import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runPipeline } from "./runPipeline.ts";

test("runPipeline writes the architecture, scaffold, starter code, generated tests, test-run status, and checklist to the requested directory", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "boilerbrain-pipeline-"));
  const result = await runPipeline("build a notes API with authentication", {
    outputDir,
  });
  const architectureFileContents = await readFile(
    join(outputDir, "architecture.json"),
    "utf8",
  );
  const writtenArchitecture = JSON.parse(architectureFileContents);
  const generatedAppFile = await readFile(join(outputDir, "src", "app.ts"), "utf8");
  const generatedAuthTestFile = await readFile(
    join(outputDir, "tests", "auth.test.ts"),
    "utf8",
  );
  const validationChecklistFile = await readFile(
    join(outputDir, "validation-checklist.md"),
    "utf8",
  );
  const generatedPackageJson = JSON.parse(
    await readFile(join(outputDir, "package.json"), "utf8"),
  );
  const architectureStage = result.stages.find(
    (stage) => stage.key === "generateArchitecture",
  );
  const scaffoldStage = result.stages.find(
    (stage) => stage.key === "scaffoldProject",
  );
  const starterCodeStage = result.stages.find(
    (stage) => stage.key === "generateStarterCode",
  );
  const starterTestsStage = result.stages.find(
    (stage) => stage.key === "generateStarterTests",
  );
  const runGeneratedTestsStage = result.stages.find(
    (stage) => stage.key === "runGeneratedTests",
  );
  const validationChecklistStage = result.stages.find(
    (stage) => stage.key === "validationChecklist",
  );

  assert.ok(architectureStage);
  assert.ok(scaffoldStage);
  assert.ok(starterCodeStage);
  assert.ok(starterTestsStage);
  assert.ok(runGeneratedTestsStage);
  assert.ok(validationChecklistStage);
  assert.match(architectureStage.output, /Created architecture at/);
  assert.doesNotMatch(architectureStage.output, /Placeholder/);
  assert.match(scaffoldStage.output, /Scaffolded project at/);
  assert.doesNotMatch(scaffoldStage.output, /Placeholder/);
  assert.match(starterCodeStage.output, /Generated starter code at/);
  assert.doesNotMatch(starterCodeStage.output, /Placeholder/);
  assert.match(starterTestsStage.output, /Generated starter tests at/);
  assert.doesNotMatch(starterTestsStage.output, /Placeholder/);
  assert.match(runGeneratedTestsStage.output, /Generated test execution status: skipped/);
  assert.doesNotMatch(runGeneratedTestsStage.output, /Placeholder/);
  assert.match(validationChecklistStage.output, /Created validation checklist at/);
  assert.doesNotMatch(validationChecklistStage.output, /Placeholder/);
  assert.equal(writtenArchitecture.projectName, "notes-api");
  assert.equal(writtenArchitecture.apiPlan.resource.collectionPath, "/notes");
  assert.equal(
    writtenArchitecture.crossCuttingConcerns.authentication.required,
    true,
  );
  assert.match(generatedAppFile, /handleAuthRoute/);
  assert.match(generatedAuthTestFile, /POST \/auth\/login returns the dev token/);
  assert.equal(generatedPackageJson.name, "notes-api");
  assert.match(validationChecklistFile, /Run generated tests: Generated project dependencies are not installed/);
});
