import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  type PipelineStageUpdate,
  runPipeline,
} from "./runPipeline.ts";

function collectStageSignatures(
  updates: PipelineStageUpdate[],
): Array<[string, string]> {
  return updates.map((update) => [update.key, update.status]);
}

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

test("runPipeline emits ordered progress updates with completion output", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "boilerbrain-pipeline-progress-"));
  const updates: PipelineStageUpdate[] = [];

  await runPipeline("build a notes API with authentication", {
    outputDir,
    onStageUpdate: (update) => {
      updates.push(update);
    },
  });

  assert.equal(updates.length, 24);
  assert.deepEqual(collectStageSignatures(updates), [
    ["parsePrompt", "pending"],
    ["parsePrompt", "running"],
    ["parsePrompt", "completed"],
    ["generateSpec", "pending"],
    ["generateSpec", "running"],
    ["generateSpec", "completed"],
    ["generateArchitecture", "pending"],
    ["generateArchitecture", "running"],
    ["generateArchitecture", "completed"],
    ["scaffoldProject", "pending"],
    ["scaffoldProject", "running"],
    ["scaffoldProject", "completed"],
    ["generateStarterCode", "pending"],
    ["generateStarterCode", "running"],
    ["generateStarterCode", "completed"],
    ["generateStarterTests", "pending"],
    ["generateStarterTests", "running"],
    ["generateStarterTests", "completed"],
    ["runGeneratedTests", "pending"],
    ["runGeneratedTests", "running"],
    ["runGeneratedTests", "completed"],
    ["validationChecklist", "pending"],
    ["validationChecklist", "running"],
    ["validationChecklist", "completed"],
  ]);
  assert.equal(updates[2]?.output, 'Accepted prompt: "build a notes API with authentication"');
  assert.match(updates[5]?.output ?? "", /Created spec at/);
  assert.match(updates[8]?.output ?? "", /Created architecture at/);
  assert.match(updates[11]?.output ?? "", /Scaffolded project at/);
  assert.match(updates[14]?.output ?? "", /Generated starter code at/);
  assert.match(updates[17]?.output ?? "", /Generated starter tests at/);
  assert.match(updates[20]?.output ?? "", /Generated test execution status: skipped/);
  assert.match(updates[23]?.output ?? "", /Created validation checklist at/);
});

test("runPipeline emits a failed update for the current stage before throwing", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "boilerbrain-pipeline-failure-"));
  const outputDir = join(rootDir, "output-target");
  const updates: PipelineStageUpdate[] = [];

  await writeFile(outputDir, "not a directory", "utf8");

  await assert.rejects(
    () =>
      runPipeline("build a notes API with authentication", {
        outputDir,
        onStageUpdate: (update) => {
          updates.push(update);
        },
      }),
  );

  assert.deepEqual(collectStageSignatures(updates), [
    ["parsePrompt", "pending"],
    ["parsePrompt", "running"],
    ["parsePrompt", "completed"],
    ["generateSpec", "pending"],
    ["generateSpec", "running"],
    ["generateSpec", "failed"],
  ]);
  assert.equal(updates[5]?.status, "failed");
  assert.equal(updates[5]?.key, "generateSpec");
  assert.equal(updates[5]?.output, undefined);
});
