import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runPipeline } from "./runPipeline.ts";

test("runPipeline writes architecture.json and reports the generated architecture stage", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "boilerbrain-pipeline-"));
  const result = await runPipeline("build a notes API with authentication", {
    outputDir,
  });
  const architectureFileContents = await readFile(
    join(outputDir, "architecture.json"),
    "utf8",
  );
  const writtenArchitecture = JSON.parse(architectureFileContents);
  const architectureStage = result.stages.find(
    (stage) => stage.key === "generateArchitecture",
  );

  assert.ok(architectureStage);
  assert.match(architectureStage.output, /Created architecture at/);
  assert.doesNotMatch(architectureStage.output, /Placeholder/);
  assert.equal(writtenArchitecture.projectName, "notes-api");
  assert.equal(writtenArchitecture.apiPlan.resource.collectionPath, "/notes");
  assert.equal(
    writtenArchitecture.crossCuttingConcerns.authentication.required,
    true,
  );
});
