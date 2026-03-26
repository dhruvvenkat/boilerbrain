import assert from "node:assert/strict";
import test from "node:test";

import {
  applyStageUpdate,
  buildNextStepCommands,
  clampStageIndex,
  createInitialStageViews,
  getStageStatusSymbol,
} from "./helpers.ts";

test("createInitialStageViews returns the ordered pipeline stages", () => {
  const stages = createInitialStageViews();

  assert.deepEqual(
    stages.map((stage) => [stage.key, stage.label, stage.status]),
    [
      ["parsePrompt", "Parse Prompt", "pending"],
      ["generateSpec", "Generate Spec", "pending"],
      ["generateArchitecture", "Generate Architecture", "pending"],
      ["scaffoldProject", "Scaffold Project", "pending"],
      ["generateStarterCode", "Generate Starter Code", "pending"],
      ["generateStarterTests", "Generate Starter Tests", "pending"],
      ["runGeneratedTests", "Run Generated Tests", "pending"],
      ["validationChecklist", "Validation Checklist", "pending"],
    ],
  );
});

test("applyStageUpdate replaces status and persists completed output", () => {
  const stages = createInitialStageViews();
  const runningStages = applyStageUpdate(stages, {
    key: "generateSpec",
    label: "Generate Spec",
    status: "running",
  });
  const completedStages = applyStageUpdate(runningStages, {
    key: "generateSpec",
    label: "Generate Spec",
    status: "completed",
    output: "Created spec at /tmp/example/spec.json",
  });
  const rerenderedStages = applyStageUpdate(completedStages, {
    key: "generateSpec",
    label: "Generate Spec",
    status: "completed",
  });

  assert.equal(completedStages[1]?.status, "completed");
  assert.equal(
    completedStages[1]?.output,
    "Created spec at /tmp/example/spec.json",
  );
  assert.equal(
    rerenderedStages[1]?.output,
    "Created spec at /tmp/example/spec.json",
  );
});

test("clampStageIndex constrains navigation to stage bounds", () => {
  const stages = createInitialStageViews();

  assert.equal(clampStageIndex(-1, stages), 0);
  assert.equal(clampStageIndex(0, stages), 0);
  assert.equal(clampStageIndex(99, stages), stages.length - 1);
});

test("buildNextStepCommands returns the generated-project verification flow", () => {
  assert.deepEqual(buildNextStepCommands("./tmp/notes-api"), [
    "cd ./tmp/notes-api",
    "npm install",
    "npm test",
    "npm run build",
    "PORT=3001 npm start",
  ]);
  assert.equal(getStageStatusSymbol("pending"), " ");
  assert.equal(getStageStatusSymbol("running"), ">");
  assert.equal(getStageStatusSymbol("completed"), "x");
  assert.equal(getStageStatusSymbol("failed"), "!");
});
