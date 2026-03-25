import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildProjectSpec } from "./generateSpec.ts";
import {
  buildProjectArchitecture,
  generateArchitecture,
} from "./generateArchitecture.ts";

test("buildProjectArchitecture creates a PRD-aligned architecture plan", () => {
  const spec = buildProjectSpec(
    "build a todo API with built-in authentication",
  );
  const architecture = buildProjectArchitecture(spec);

  assert.equal(architecture.projectName, "todo-api");
  assert.equal(architecture.architectureStyle, spec.architecture.style);
  assert.equal(
    architecture.stack.serverFramework,
    spec.architecture.serverFramework,
  );
  assert.equal(architecture.apiPlan.resource.collectionPath, "/todos");
  assert.equal(architecture.crossCuttingConcerns.authentication.required, true);
  assert.ok(
    architecture.scaffoldPlan.directories.some(
      (directory) => directory.path === "src/routes",
    ),
  );
  assert.ok(
    architecture.scaffoldPlan.files.some(
      (file) => file.path === "src/services/todoService.ts",
    ),
  );
  assert.ok(
    architecture.majorDecisions.every(
      (decision) => decision.alternatives.length > 0,
    ),
  );
});

test("generateArchitecture writes architecture.json to the requested output directory", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "boilerbrain-architecture-"));
  const spec = buildProjectSpec("build a calendar API");
  const result = await generateArchitecture(spec, { outputDir });
  const fileContents = await readFile(result.outputPath, "utf8");
  const writtenArchitecture = JSON.parse(fileContents);

  assert.equal(result.outputPath, join(outputDir, "architecture.json"));
  assert.equal(writtenArchitecture.projectName, "calendar-api");
  assert.equal(writtenArchitecture.architectureStyle, spec.architecture.style);
  assert.equal(
    writtenArchitecture.stack.serverFramework,
    spec.architecture.serverFramework,
  );
  assert.equal(writtenArchitecture.apiPlan.resource.collectionPath, "/calendars");
  assert.equal(
    writtenArchitecture.crossCuttingConcerns.authentication.required,
    false,
  );
});
