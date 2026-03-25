import { dirname, basename, isAbsolute, join, normalize, relative } from "node:path";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";

import type { ProjectArchitecture } from "./generateArchitecture.ts";
import type { ProjectSpec } from "./generateSpec.ts";

export interface GenerateStarterTestsOptions {
  outputDir?: string;
}

export interface GenerateStarterTestsResult {
  projectRoot: string;
  filesWritten: string[];
  filesSkipped: string[];
  testFilesGenerated: string[];
  stack: {
    projectType: ProjectSpec["projectType"];
    runtime: ProjectSpec["stack"]["runtime"];
    language: ProjectSpec["stack"]["language"];
    apiStyle: ProjectSpec["stack"]["apiStyle"];
    testFramework: ProjectSpec["stack"]["testFramework"];
    serverFramework: ProjectArchitecture["stack"]["serverFramework"];
    architectureStyle: ProjectArchitecture["architectureStyle"];
    moduleLayout: ProjectSpec["architecture"]["moduleLayout"];
  };
}

interface TestGenerationTargets {
  resourceTestPath: string;
  healthTestPath: string;
  servicePath: string;
  authTestPath?: string;
}

interface TestCodeMetadata {
  collectionPath: string;
  serviceImportStem: string;
  serviceClassName: string;
}

interface WriteGeneratedFileResult {
  status: "written" | "skipped";
}

type PathKind = "missing" | "file" | "directory";

async function getPathKind(path: string): Promise<PathKind> {
  try {
    const stats = await stat(path);
    return stats.isDirectory() ? "directory" : "file";
  } catch {
    return "missing";
  }
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function toPascalCase(value: string): string {
  return normalizeWhitespace(value)
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join("");
}

function validateSupportedStack(
  spec: ProjectSpec,
  architecture: ProjectArchitecture,
): void {
  const unsupportedValues: string[] = [];

  if (spec.projectType !== "backend-api") {
    unsupportedValues.push(`projectType=${spec.projectType}`);
  }

  if (spec.stack.runtime !== "node") {
    unsupportedValues.push(`runtime=${spec.stack.runtime}`);
  }

  if (spec.stack.language !== "typescript") {
    unsupportedValues.push(`language=${spec.stack.language}`);
  }

  if (spec.stack.apiStyle !== "rest") {
    unsupportedValues.push(`apiStyle=${spec.stack.apiStyle}`);
  }

  if (spec.stack.testFramework !== "jest") {
    unsupportedValues.push(`testFramework=${spec.stack.testFramework}`);
  }

  if (spec.architecture.style !== "layered-rest-api") {
    unsupportedValues.push(`architectureStyle=${spec.architecture.style}`);
  }

  if (architecture.architectureStyle !== "layered-rest-api") {
    unsupportedValues.push(
      `architectureOutputStyle=${architecture.architectureStyle}`,
    );
  }

  if (spec.architecture.serverFramework !== "node:http") {
    unsupportedValues.push(
      `serverFramework=${spec.architecture.serverFramework}`,
    );
  }

  if (architecture.stack.serverFramework !== "node:http") {
    unsupportedValues.push(
      `architectureOutputServerFramework=${architecture.stack.serverFramework}`,
    );
  }

  if (spec.architecture.moduleLayout !== "routes-services-types") {
    unsupportedValues.push(`moduleLayout=${spec.architecture.moduleLayout}`);
  }

  if (unsupportedValues.length > 0) {
    throw new Error(
      `generateStarterTests only supports the v1 backend stack (backend-api, Node.js, TypeScript, REST, Jest, node:http, routes-services-types). Unsupported values: ${unsupportedValues.join(", ")}.`,
    );
  }
}

function resolveProjectPath(projectRoot: string, relativePath: string): string {
  const normalizedPath = normalize(relativePath);

  if (!normalizedPath || normalizedPath === ".") {
    throw new Error("Generated test paths must be non-empty relative paths.");
  }

  if (isAbsolute(normalizedPath)) {
    throw new Error(`Generated test paths must be relative: ${relativePath}`);
  }

  const absolutePath = join(projectRoot, normalizedPath);
  const relativeToRoot = relative(projectRoot, absolutePath);

  if (
    relativeToRoot === "" ||
    relativeToRoot.startsWith("..") ||
    isAbsolute(relativeToRoot)
  ) {
    throw new Error(`Generated test path escapes the project root: ${relativePath}`);
  }

  return absolutePath;
}

function findSingleScaffoldFile(
  architecture: ProjectArchitecture,
  label: string,
  predicate: (path: string) => boolean,
): string {
  const matches = architecture.scaffoldPlan.files
    .map((file) => file.path)
    .filter(predicate);

  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one scaffold file for ${label}, but found ${matches.length}.`,
    );
  }

  return matches[0];
}

function buildTestGenerationTargets(
  architecture: ProjectArchitecture,
): TestGenerationTargets {
  const authRequired = architecture.crossCuttingConcerns.authentication.required;

  return {
    resourceTestPath: findSingleScaffoldFile(
      architecture,
      "resource tests",
      (path) =>
        path.startsWith("tests/") &&
        path !== "tests/health.test.ts" &&
        path !== "tests/auth.test.ts",
    ),
    healthTestPath: findSingleScaffoldFile(
      architecture,
      "health tests",
      (path) => path === "tests/health.test.ts",
    ),
    servicePath: findSingleScaffoldFile(
      architecture,
      "resource service",
      (path) => path.startsWith("src/services/") && path.endsWith(".ts"),
    ),
    ...(authRequired
      ? {
          authTestPath: findSingleScaffoldFile(
            architecture,
            "auth tests",
            (path) => path === "tests/auth.test.ts",
          ),
        }
      : {}),
  };
}

function buildTestCodeMetadata(
  architecture: ProjectArchitecture,
  targets: TestGenerationTargets,
): TestCodeMetadata {
  const serviceImportStem = basename(targets.servicePath, ".ts");
  const serviceClassName = toPascalCase(serviceImportStem) || "ResourceService";

  return {
    collectionPath: architecture.apiPlan.resource.collectionPath,
    serviceImportStem,
    serviceClassName,
  };
}

async function writeGeneratedFile(
  projectRoot: string,
  relativePath: string,
  contents: string,
): Promise<WriteGeneratedFileResult> {
  const outputPath = resolveProjectPath(projectRoot, relativePath);
  const pathKind = await getPathKind(outputPath);

  if (pathKind === "directory") {
    throw new Error(
      `Cannot write generated test file "${relativePath}" because a directory already exists at that path.`,
    );
  }

  if (pathKind === "file") {
    const existingContents = await readFile(outputPath, "utf8");

    if (existingContents.trim().length > 0) {
      return {
        status: "skipped",
      };
    }
  }

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, contents, "utf8");

  return {
    status: "written",
  };
}

function createHttpTestHelpersContents(): string {
  return `import { request } from "node:http";
import type { AddressInfo } from "node:net";

import { createApp } from "../src/app";

interface JsonResponse {
  statusCode: number;
  body: unknown;
}

async function startTestServer(): Promise<{
  server: ReturnType<typeof createApp>;
  baseUrl: string;
}> {
  const server = createApp();

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Expected the test server to bind to an ephemeral port.");
  }

  return {
    server,
    baseUrl: \`http://127.0.0.1:\${(address as AddressInfo).port}\`,
  };
}

async function stopTestServer(server: ReturnType<typeof createApp>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function requestJson(
  baseUrl: string,
  path: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: Record<string, unknown>;
  } = {},
): Promise<JsonResponse> {
  const url = new URL(path, baseUrl);
  const requestBody = options.body ? JSON.stringify(options.body) : undefined;

  return await new Promise<JsonResponse>((resolve, reject) => {
    const clientRequest = request(
      url,
      {
        method: options.method ?? "GET",
        headers: {
          ...(requestBody
            ? {
                "Content-Type": "application/json",
              }
            : {}),
          ...(options.headers ?? {}),
        },
      },
      (response) => {
        let rawBody = "";

        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          rawBody += chunk;
        });
        response.on("end", () => {
          resolve({
            statusCode: response.statusCode ?? 0,
            body: rawBody ? JSON.parse(rawBody) : null,
          });
        });
      },
    );

    clientRequest.on("error", reject);

    if (requestBody) {
      clientRequest.write(requestBody);
    }

    clientRequest.end();
  });
}
`;
}

function createResourceTestContents(
  metadata: TestCodeMetadata,
  authRequired: boolean,
): string {
  return `import { ${metadata.serviceClassName} } from "../src/services/${metadata.serviceImportStem}";

${createHttpTestHelpersContents()}
const COLLECTION_PATH = "${metadata.collectionPath}";
const DEFAULT_HEADERS${authRequired ? ' = { Authorization: "Bearer dev-token" }' : " = {}"} as Record<string, string>;

describe("${metadata.serviceClassName}", () => {
  let service: ${metadata.serviceClassName};

  beforeEach(() => {
    service = new ${metadata.serviceClassName}();
  });

  test("list starts empty", () => {
    expect(service.list()).toEqual([]);
  });

  test("create assigns an id and stores the record", () => {
    const createdRecord = service.create({
      title: "first record",
    });

    expect(createdRecord.id).toEqual(expect.any(String));
    expect(service.getById(createdRecord.id)).toEqual(createdRecord);
  });

  test("update mutates an existing record without changing its id", () => {
    const createdRecord = service.create({
      title: "before update",
    });

    const updatedRecord = service.update(createdRecord.id, {
      title: "after update",
    });

    expect(updatedRecord).toEqual({
      ...createdRecord,
      title: "after update",
    });
  });

  test("delete returns true for existing records and false once removed", () => {
    const createdRecord = service.create({
      title: "to delete",
    });

    expect(service.delete(createdRecord.id)).toBe(true);
    expect(service.delete(createdRecord.id)).toBe(false);
  });
});

describe(\`HTTP routes for \${COLLECTION_PATH}\`, () => {
  let server: ReturnType<typeof createApp>;
  let baseUrl: string;

  beforeEach(async () => {
    ({ server, baseUrl } = await startTestServer());
  });

  afterEach(async () => {
    await stopTestServer(server);
  });

  test("GET collection returns 200 and an items array", async () => {
    const response = await requestJson(baseUrl, COLLECTION_PATH, {
      headers: DEFAULT_HEADERS,
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      items: [],
    });
  });

  test("POST collection creates a record and GET item returns it", async () => {
    const createResponse = await requestJson(baseUrl, COLLECTION_PATH, {
      method: "POST",
      headers: DEFAULT_HEADERS,
      body: {
        title: "created through HTTP",
      },
    });

    expect(createResponse.statusCode).toBe(201);

    const createdItem = (createResponse.body as { item: { id: string } }).item;
    const fetchResponse = await requestJson(
      baseUrl,
      \`\${COLLECTION_PATH}/\${createdItem.id}\`,
      {
        headers: DEFAULT_HEADERS,
      },
    );

    expect(fetchResponse.statusCode).toBe(200);
    expect(fetchResponse.body).toEqual({
      item: expect.objectContaining({
        id: createdItem.id,
        title: "created through HTTP",
      }),
    });
  });

  test("PUT item updates an existing record", async () => {
    const createResponse = await requestJson(baseUrl, COLLECTION_PATH, {
      method: "POST",
      headers: DEFAULT_HEADERS,
      body: {
        title: "before update",
      },
    });
    const createdItem = (createResponse.body as { item: { id: string } }).item;

    const updateResponse = await requestJson(
      baseUrl,
      \`\${COLLECTION_PATH}/\${createdItem.id}\`,
      {
        method: "PUT",
        headers: DEFAULT_HEADERS,
        body: {
          title: "after update",
        },
      },
    );

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.body).toEqual({
      item: expect.objectContaining({
        id: createdItem.id,
        title: "after update",
      }),
    });
  });

  test("DELETE item removes an existing record", async () => {
    const createResponse = await requestJson(baseUrl, COLLECTION_PATH, {
      method: "POST",
      headers: DEFAULT_HEADERS,
      body: {
        title: "to delete",
      },
    });
    const createdItem = (createResponse.body as { item: { id: string } }).item;

    const deleteResponse = await requestJson(
      baseUrl,
      \`\${COLLECTION_PATH}/\${createdItem.id}\`,
      {
        method: "DELETE",
        headers: DEFAULT_HEADERS,
      },
    );

    expect(deleteResponse.statusCode).toBe(200);
    expect(deleteResponse.body).toEqual({
      deleted: true,
    });
  });

  test("missing records return 404", async () => {
    const response = await requestJson(baseUrl, \`\${COLLECTION_PATH}/missing-id\`, {
      headers: DEFAULT_HEADERS,
    });

    expect(response.statusCode).toBe(404);
    expect(response.body).toEqual({
      error: "Resource not found.",
    });
  });

  test("unsupported methods return 405", async () => {
    const response = await requestJson(baseUrl, COLLECTION_PATH, {
      method: "PATCH",
      headers: DEFAULT_HEADERS,
    });

    expect(response.statusCode).toBe(405);
    expect(response.body).toEqual({
      error: \`Method PATCH not allowed on \${COLLECTION_PATH}.\`,
    });
  });
});
`;
}

function createHealthTestContents(): string {
  return `${createHttpTestHelpersContents()}
describe("health route", () => {
  let server: ReturnType<typeof createApp>;
  let baseUrl: string;

  beforeEach(async () => {
    ({ server, baseUrl } = await startTestServer());
  });

  afterEach(async () => {
    await stopTestServer(server);
  });

  test("GET /health returns a healthy JSON payload", async () => {
    const response = await requestJson(baseUrl, "/health");

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      status: "ok",
    });
  });
});
`;
}

function createAuthTestContents(metadata: TestCodeMetadata): string {
  return `${createHttpTestHelpersContents()}
const COLLECTION_PATH = "${metadata.collectionPath}";

describe("authentication flow", () => {
  let server: ReturnType<typeof createApp>;
  let baseUrl: string;

  beforeEach(async () => {
    ({ server, baseUrl } = await startTestServer());
  });

  afterEach(async () => {
    await stopTestServer(server);
  });

  test("POST /auth/login returns the dev token", async () => {
    const response = await requestJson(baseUrl, "/auth/login", {
      method: "POST",
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      token: "dev-token",
    });
  });

  test("protected routes require an authorization header", async () => {
    const response = await requestJson(baseUrl, COLLECTION_PATH);

    expect(response.statusCode).toBe(401);
    expect(response.body).toEqual({
      error: "Missing Authorization header.",
    });
  });

  test("protected routes reject invalid bearer tokens", async () => {
    const response = await requestJson(baseUrl, COLLECTION_PATH, {
      headers: {
        Authorization: "Bearer wrong-token",
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.body).toEqual({
      error: "Invalid bearer token.",
    });
  });

  test("protected routes accept the dev token", async () => {
    const response = await requestJson(baseUrl, COLLECTION_PATH, {
      headers: {
        Authorization: "Bearer dev-token",
      },
    });

    expect(response.statusCode).toBe(200);
  });
});
`;
}

export async function generateStarterTests(
  spec: ProjectSpec,
  architecture: ProjectArchitecture,
  options: GenerateStarterTestsOptions = {},
): Promise<GenerateStarterTestsResult> {
  validateSupportedStack(spec, architecture);

  if (spec.projectName !== architecture.projectName) {
    throw new Error(
      `Spec project name "${spec.projectName}" does not match architecture project name "${architecture.projectName}".`,
    );
  }

  const projectRoot = options.outputDir ?? process.cwd();
  const authRequired = architecture.crossCuttingConcerns.authentication.required;
  const filesWritten: string[] = [];
  const filesSkipped: string[] = [];
  const testFilesGenerated: string[] = [];
  const targets = buildTestGenerationTargets(architecture);
  const metadata = buildTestCodeMetadata(architecture, targets);

  const filesToGenerate = new Map<string, string>([
    [
      targets.resourceTestPath,
      createResourceTestContents(metadata, authRequired),
    ],
    [targets.healthTestPath, createHealthTestContents()],
  ]);

  if (authRequired) {
    if (!targets.authTestPath) {
      throw new Error(
        "Authentication was required, but the scaffold plan did not include an auth test file.",
      );
    }

    filesToGenerate.set(targets.authTestPath, createAuthTestContents(metadata));
  }

  for (const [relativePath, contents] of filesToGenerate) {
    const result = await writeGeneratedFile(projectRoot, relativePath, contents);

    if (result.status === "written") {
      filesWritten.push(relativePath);
      testFilesGenerated.push(relativePath);
      continue;
    }

    filesSkipped.push(relativePath);
  }

  return {
    projectRoot,
    filesWritten,
    filesSkipped,
    testFilesGenerated,
    stack: {
      projectType: spec.projectType,
      runtime: spec.stack.runtime,
      language: spec.stack.language,
      apiStyle: spec.stack.apiStyle,
      testFramework: spec.stack.testFramework,
      serverFramework: architecture.stack.serverFramework,
      architectureStyle: architecture.architectureStyle,
      moduleLayout: spec.architecture.moduleLayout,
    },
  };
}
