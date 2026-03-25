import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildProjectArchitecture } from "./generateArchitecture.ts";
import { buildProjectSpec, type ProjectSpec } from "./generateSpec.ts";
import {
  generateStarterCode,
} from "./generateStarterCode.ts";
import { scaffoldProject } from "./scaffoldProject.ts";

test("generateStarterCode writes runnable project files and backend source code", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "boilerbrain-starter-code-"));
  const spec = buildProjectSpec("build a calendar API");
  const architecture = buildProjectArchitecture(spec);

  await scaffoldProject(spec, architecture, { outputDir });

  const result = await generateStarterCode(spec, architecture, { outputDir });
  const packageJsonContents = await readFile(join(outputDir, "package.json"), "utf8");
  const packageJson = JSON.parse(packageJsonContents);
  const appContents = await readFile(join(outputDir, "src", "app.ts"), "utf8");
  const routeContents = await readFile(
    join(outputDir, "src", "routes", "calendars.ts"),
    "utf8",
  );
  const serviceContents = await readFile(
    join(outputDir, "src", "services", "calendarService.ts"),
    "utf8",
  );
  const healthTestContents = await readFile(
    join(outputDir, "tests", "health.test.ts"),
    "utf8",
  );

  assert.equal(result.projectRoot, outputDir);
  assert.deepEqual(result.projectFilesCreated, [
    "package.json",
    "tsconfig.json",
    "jest.config.cjs",
    ".gitignore",
  ]);
  assert.equal(result.filesSkipped.length, 0);
  assert.ok(result.filesWritten.includes("src/app.ts"));
  assert.ok(result.filesWritten.includes("src/routes/calendars.ts"));
  assert.equal(packageJson.name, "calendar-api");
  assert.equal(packageJson.scripts.build, "tsc --project tsconfig.json");
  assert.equal(packageJson.scripts.test, "jest --runInBand");
  assert.match(appContents, /export function createApp/);
  assert.match(appContents, /handleCalendarsRoute/);
  assert.match(routeContents, /const COLLECTION_PATH = "\/calendars"/);
  assert.match(serviceContents, /database-agnostic/);
  assert.equal(healthTestContents, "");
});

test("generateStarterCode includes auth route and middleware when authentication is required", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "boilerbrain-starter-auth-"));
  const spec = buildProjectSpec("build a todo API with built-in authentication");
  const architecture = buildProjectArchitecture(spec);

  await scaffoldProject(spec, architecture, { outputDir });

  const result = await generateStarterCode(spec, architecture, { outputDir });
  const appContents = await readFile(join(outputDir, "src", "app.ts"), "utf8");
  const routeContents = await readFile(
    join(outputDir, "src", "routes", "todos.ts"),
    "utf8",
  );
  const authRouteContents = await readFile(
    join(outputDir, "src", "routes", "auth.ts"),
    "utf8",
  );
  const authMiddlewareContents = await readFile(
    join(outputDir, "src", "middleware", "auth.ts"),
    "utf8",
  );

  assert.ok(result.filesWritten.includes("src/routes/auth.ts"));
  assert.ok(result.filesWritten.includes("src/middleware/auth.ts"));
  assert.match(appContents, /handleAuthRoute/);
  assert.match(routeContents, /requireAuth/);
  assert.match(authRouteContents, /\/auth\/login/);
  assert.match(authMiddlewareContents, /DEV_AUTH_TOKEN = "dev-token"/);
});

test("generateStarterCode writes into empty files and skips non-empty files", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "boilerbrain-starter-skip-"));
  const spec = buildProjectSpec("build a notes API");
  const architecture = buildProjectArchitecture(spec);

  await scaffoldProject(spec, architecture, { outputDir });
  await writeFile(join(outputDir, "src", "app.ts"), "existing app contents\n", "utf8");
  await writeFile(join(outputDir, "src", "server.ts"), "   \n", "utf8");
  await writeFile(
    join(outputDir, "package.json"),
    '{"name":"custom-project"}\n',
    "utf8",
  );

  const result = await generateStarterCode(spec, architecture, { outputDir });
  const appContents = await readFile(join(outputDir, "src", "app.ts"), "utf8");
  const serverContents = await readFile(join(outputDir, "src", "server.ts"), "utf8");
  const packageJsonContents = await readFile(join(outputDir, "package.json"), "utf8");

  assert.ok(result.filesSkipped.includes("src/app.ts"));
  assert.ok(result.filesSkipped.includes("package.json"));
  assert.ok(result.filesWritten.includes("src/server.ts"));
  assert.equal(appContents, "existing app contents\n");
  assert.match(serverContents, /Server listening on port/);
  assert.equal(packageJsonContents, '{"name":"custom-project"}\n');
});

test("generateStarterCode fails clearly for unsupported stack values", async () => {
  const outputDir = await mkdtemp(
    join(tmpdir(), "boilerbrain-starter-unsupported-"),
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

  await assert.rejects(
    () => generateStarterCode(unsupportedSpec, architecture, { outputDir }),
    /Unsupported values: runtime=bun/,
  );
});
