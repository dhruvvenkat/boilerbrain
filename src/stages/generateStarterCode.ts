import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, normalize, relative } from "node:path";

import type { ProjectArchitecture } from "./generateArchitecture.ts";
import type { ProjectSpec } from "./generateSpec.ts";

export interface GenerateStarterCodeOptions {
  outputDir?: string;
}

export interface GenerateStarterCodeResult {
  projectRoot: string;
  filesWritten: string[];
  filesSkipped: string[];
  projectFilesCreated: string[];
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

interface CodeGenerationTargets {
  appPath: string;
  serverPath: string;
  healthRoutePath: string;
  resourceRoutePath: string;
  servicePath: string;
  typePath: string;
  authRoutePath?: string;
  authMiddlewarePath?: string;
}

interface ResourceCodeMetadata {
  collectionPath: string;
  routeImportStem: string;
  routeHandlerName: string;
  serviceImportStem: string;
  serviceClassName: string;
  serviceVariableName: string;
  typeImportStem: string;
  typeName: string;
  createInputName: string;
  updateInputName: string;
  recordTypeName: string;
}

interface WriteGeneratedFileResult {
  status: "written" | "skipped";
  created: boolean;
}

type PathKind = "missing" | "file" | "directory";

const PROJECT_LEVEL_FILES = new Set([
  "package.json",
  "tsconfig.json",
  "jest.config.cjs",
  ".gitignore",
]);

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

function toCamelCase(value: string): string {
  const pascalCase = toPascalCase(value);

  if (!pascalCase) {
    return "resource";
  }

  return pascalCase.charAt(0).toLowerCase() + pascalCase.slice(1);
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
      `generateStarterCode only supports the v1 backend stack (backend-api, Node.js, TypeScript, REST, Jest, node:http, routes-services-types). Unsupported values: ${unsupportedValues.join(", ")}.`,
    );
  }
}

function resolveProjectPath(projectRoot: string, relativePath: string): string {
  const normalizedPath = normalize(relativePath);

  if (!normalizedPath || normalizedPath === ".") {
    throw new Error("Generated file paths must be non-empty relative paths.");
  }

  if (isAbsolute(normalizedPath)) {
    throw new Error(`Generated file paths must be relative: ${relativePath}`);
  }

  const absolutePath = join(projectRoot, normalizedPath);
  const relativeToRoot = relative(projectRoot, absolutePath);

  if (
    relativeToRoot === "" ||
    relativeToRoot.startsWith("..") ||
    isAbsolute(relativeToRoot)
  ) {
    throw new Error(`Generated file path escapes the project root: ${relativePath}`);
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

function buildCodeGenerationTargets(
  architecture: ProjectArchitecture,
): CodeGenerationTargets {
  const authRequired = architecture.crossCuttingConcerns.authentication.required;

  return {
    appPath: findSingleScaffoldFile(
      architecture,
      "app",
      (path) => path === "src/app.ts",
    ),
    serverPath: findSingleScaffoldFile(
      architecture,
      "server",
      (path) => path === "src/server.ts",
    ),
    healthRoutePath: findSingleScaffoldFile(
      architecture,
      "health route",
      (path) => path === "src/routes/health.ts",
    ),
    resourceRoutePath: findSingleScaffoldFile(
      architecture,
      "resource route",
      (path) =>
        path.startsWith("src/routes/") &&
        path !== "src/routes/health.ts" &&
        path !== "src/routes/auth.ts",
    ),
    servicePath: findSingleScaffoldFile(
      architecture,
      "resource service",
      (path) => path.startsWith("src/services/") && path.endsWith(".ts"),
    ),
    typePath: findSingleScaffoldFile(
      architecture,
      "resource types",
      (path) => path.startsWith("src/types/") && path.endsWith(".ts"),
    ),
    ...(authRequired
      ? {
          authRoutePath: findSingleScaffoldFile(
            architecture,
            "auth route",
            (path) => path === "src/routes/auth.ts",
          ),
          authMiddlewarePath: findSingleScaffoldFile(
            architecture,
            "auth middleware",
            (path) => path === "src/middleware/auth.ts",
          ),
        }
      : {}),
  };
}

function buildResourceCodeMetadata(
  architecture: ProjectArchitecture,
  targets: CodeGenerationTargets,
): ResourceCodeMetadata {
  const typeStem = basename(targets.typePath, ".ts");
  const serviceStem = basename(targets.servicePath, ".ts");
  const routeStem = basename(targets.resourceRoutePath, ".ts");
  const typeName = toPascalCase(typeStem) || "Resource";
  const serviceClassName = toPascalCase(serviceStem) || "ResourceService";
  const routeHandlerName = `handle${toPascalCase(routeStem) || "Resources"}Route`;

  return {
    collectionPath: architecture.apiPlan.resource.collectionPath,
    routeImportStem: routeStem,
    routeHandlerName,
    serviceImportStem: serviceStem,
    serviceClassName,
    serviceVariableName: toCamelCase(serviceClassName),
    typeImportStem: typeStem,
    typeName,
    createInputName: `Create${typeName}Input`,
    updateInputName: `Update${typeName}Input`,
    recordTypeName: `${typeName}Record`,
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
      `Cannot write generated file "${relativePath}" because a directory already exists at that path.`,
    );
  }

  if (pathKind === "file") {
    const existingContents = await readFile(outputPath, "utf8");

    if (existingContents.trim().length > 0) {
      return {
        status: "skipped",
        created: false,
      };
    }
  }

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, contents, "utf8");

  return {
    status: "written",
    created: pathKind === "missing",
  };
}

function createPackageJsonContents(spec: ProjectSpec): string {
  return `${JSON.stringify(
    {
      name: spec.projectName,
      version: "0.1.0",
      private: true,
      main: "dist/server.js",
      scripts: {
        build: "tsc --project tsconfig.json",
        start: "node dist/server.js",
        test: "jest --runInBand",
      },
      devDependencies: {
        "@types/jest": "^29.5.14",
        "@types/node": "^25.5.0",
        jest: "^29.7.0",
        "ts-jest": "^29.2.5",
        typescript: "^5.9.3",
      },
    },
    null,
    2,
  )}\n`;
}

function createTsconfigContents(): string {
  return `${JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        module: "CommonJS",
        moduleResolution: "Node",
        outDir: "dist",
        rootDir: ".",
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        types: ["node", "jest"],
      },
      include: ["src/**/*.ts", "tests/**/*.ts"],
    },
    null,
    2,
  )}\n`;
}

function createJestConfigContents(): string {
  return `module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  testMatch: ["**/*.test.ts"],
  moduleFileExtensions: ["ts", "js", "json"],
};
`;
}

function createGitignoreContents(): string {
  return `node_modules/
dist/
coverage/
`;
}

function createAppFileContents(
  metadata: ResourceCodeMetadata,
  authRequired: boolean,
): string {
  return `import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { handleHealthRoute } from "./routes/health";
import { ${metadata.routeHandlerName} } from "./routes/${metadata.routeImportStem}";
import { ${metadata.serviceClassName} } from "./services/${metadata.serviceImportStem}";
${authRequired ? 'import { handleAuthRoute } from "./routes/auth";\n' : ""}function sendJson(
  response: ServerResponse,
  statusCode: number,
  payload: unknown,
): void {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

export function createApp() {
  const ${metadata.serviceVariableName} = new ${metadata.serviceClassName}();

  return createServer((request, response) => {
    void handleRequest(request, response, ${metadata.serviceVariableName});
  });
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  ${metadata.serviceVariableName}: ${metadata.serviceClassName},
): Promise<void> {
  try {
    if (handleHealthRoute(request, response)) {
      return;
    }

${authRequired ? `    if (await handleAuthRoute(request, response)) {
      return;
    }

` : ""}    if (await ${metadata.routeHandlerName}(request, response, ${metadata.serviceVariableName})) {
      return;
    }

    sendJson(response, 404, {
      error: "Route not found.",
    });
  } catch (error) {
    console.error("Unhandled request error:", error);

    if (!response.headersSent) {
      sendJson(response, 500, {
        error: "Internal server error.",
      });
      return;
    }

    response.end();
  }
}
`;
}

function createServerFileContents(): string {
  return `import { createApp } from "./app";

const port = Number(process.env.PORT ?? "3000");
const app = createApp();

app.listen(port, () => {
  console.log(\`Server listening on port \${port}\`);
});
`;
}

function createHealthRouteContents(): string {
  return `import type { IncomingMessage, ServerResponse } from "node:http";

function sendJson(
  response: ServerResponse,
  statusCode: number,
  payload: unknown,
): void {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

export function handleHealthRoute(
  request: IncomingMessage,
  response: ServerResponse,
): boolean {
  const url = new URL(request.url ?? "/", "http://localhost");

  if (request.method !== "GET" || url.pathname !== "/health") {
    return false;
  }

  sendJson(response, 200, {
    status: "ok",
  });
  return true;
}
`;
}

function createTypeFileContents(metadata: ResourceCodeMetadata): string {
  return `export type ${metadata.recordTypeName} = {
  id: string;
} & Record<string, unknown>;

export type ${metadata.createInputName} = Record<string, unknown>;

export type ${metadata.updateInputName} = Record<string, unknown>;
`;
}

function createServiceFileContents(metadata: ResourceCodeMetadata): string {
  return `import type {
  ${metadata.createInputName},
  ${metadata.recordTypeName},
  ${metadata.updateInputName},
} from "../types/${metadata.typeImportStem}";

export class ${metadata.serviceClassName} {
  // Keep persistence in memory for the MVP so the starter stays database-agnostic.
  private readonly items = new Map<string, ${metadata.recordTypeName}>();

  list(): ${metadata.recordTypeName}[] {
    return Array.from(this.items.values());
  }

  getById(id: string): ${metadata.recordTypeName} | undefined {
    return this.items.get(id);
  }

  create(input: ${metadata.createInputName}): ${metadata.recordTypeName} {
    const record: ${metadata.recordTypeName} = {
      id: this.createId(),
      ...input,
    };

    this.items.set(record.id, record);
    return record;
  }

  update(
    id: string,
    input: ${metadata.updateInputName},
  ): ${metadata.recordTypeName} | undefined {
    const existingRecord = this.items.get(id);

    if (!existingRecord) {
      return undefined;
    }

    const updatedRecord: ${metadata.recordTypeName} = {
      ...existingRecord,
      ...input,
      id,
    };

    this.items.set(id, updatedRecord);
    return updatedRecord;
  }

  delete(id: string): boolean {
    return this.items.delete(id);
  }

  private createId(): string {
    return \`\${Date.now()}-\${Math.random().toString(36).slice(2, 8)}\`;
  }
}
`;
}

function createResourceRouteContents(
  metadata: ResourceCodeMetadata,
  authRequired: boolean,
): string {
  return `import type { IncomingMessage, ServerResponse } from "node:http";

import { ${metadata.serviceClassName} } from "../services/${metadata.serviceImportStem}";
${authRequired ? 'import { requireAuth } from "../middleware/auth";\n' : ""}import type {
  ${metadata.createInputName},
  ${metadata.updateInputName},
} from "../types/${metadata.typeImportStem}";

const COLLECTION_PATH = "${metadata.collectionPath}";
const ITEM_PATH_PREFIX = \`\${COLLECTION_PATH}/\`;

function sendJson(
  response: ServerResponse,
  statusCode: number,
  payload: unknown,
): void {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

async function readJsonBody(
  request: IncomingMessage,
): Promise<Record<string, unknown>> {
  const chunks: string[] = [];

  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
  }

  if (chunks.length === 0) {
    return {};
  }

  const rawBody = chunks.join("").trim();

  if (!rawBody) {
    return {};
  }

  const parsedBody = JSON.parse(rawBody);

  if (
    !parsedBody ||
    Array.isArray(parsedBody) ||
    typeof parsedBody !== "object"
  ) {
    throw new Error("Request body must be a JSON object.");
  }

  return parsedBody as Record<string, unknown>;
}

function getItemId(pathname: string): string | null {
  if (!pathname.startsWith(ITEM_PATH_PREFIX)) {
    return null;
  }

  const id = pathname.slice(ITEM_PATH_PREFIX.length);

  if (!id || id.includes("/")) {
    return null;
  }

  return decodeURIComponent(id);
}

export async function ${metadata.routeHandlerName}(
  request: IncomingMessage,
  response: ServerResponse,
  ${metadata.serviceVariableName}: ${metadata.serviceClassName},
): Promise<boolean> {
  const url = new URL(request.url ?? "/", "http://localhost");
  const { pathname } = url;
  const itemId = getItemId(pathname);

  if (pathname !== COLLECTION_PATH && itemId === null) {
    return false;
  }

${authRequired ? `  const authCheck = requireAuth(request);

  if (!authCheck.authorized) {
    sendJson(response, authCheck.statusCode, authCheck.body);
    return true;
  }

` : ""}  if (pathname === COLLECTION_PATH) {
    switch (request.method) {
      case "GET":
        sendJson(response, 200, {
          items: ${metadata.serviceVariableName}.list(),
        });
        return true;
      case "POST":
        try {
          const payload = await readJsonBody(request);
          const record = ${metadata.serviceVariableName}.create(
            payload as ${metadata.createInputName},
          );

          sendJson(response, 201, {
            item: record,
          });
        } catch (error) {
          sendJson(response, 400, {
            error:
              error instanceof Error ? error.message : "Invalid request body.",
          });
        }

        return true;
      default:
        sendJson(response, 405, {
          error: \`Method \${request.method ?? "UNKNOWN"} not allowed on \${COLLECTION_PATH}.\`,
        });
        return true;
    }
  }

  if (itemId === null) {
    return false;
  }

  switch (request.method) {
    case "GET": {
      const record = ${metadata.serviceVariableName}.getById(itemId);

      if (!record) {
        sendJson(response, 404, {
          error: "Resource not found.",
        });
        return true;
      }

      sendJson(response, 200, {
        item: record,
      });
      return true;
    }
    case "PUT":
      try {
        const payload = await readJsonBody(request);
        const updatedRecord = ${metadata.serviceVariableName}.update(
          itemId,
          payload as ${metadata.updateInputName},
        );

        if (!updatedRecord) {
          sendJson(response, 404, {
            error: "Resource not found.",
          });
          return true;
        }

        sendJson(response, 200, {
          item: updatedRecord,
        });
      } catch (error) {
        sendJson(response, 400, {
          error:
            error instanceof Error ? error.message : "Invalid request body.",
        });
      }

      return true;
    case "DELETE": {
      const deleted = ${metadata.serviceVariableName}.delete(itemId);

      if (!deleted) {
        sendJson(response, 404, {
          error: "Resource not found.",
        });
        return true;
      }

      sendJson(response, 200, {
        deleted: true,
      });
      return true;
    }
    default:
      sendJson(response, 405, {
        error: \`Method \${request.method ?? "UNKNOWN"} not allowed on \${pathname}.\`,
      });
      return true;
  }
}
`;
}

function createAuthRouteContents(): string {
  return `import type { IncomingMessage, ServerResponse } from "node:http";

import { DEV_AUTH_TOKEN } from "../middleware/auth";

function sendJson(
  response: ServerResponse,
  statusCode: number,
  payload: unknown,
): void {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

export async function handleAuthRoute(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<boolean> {
  const url = new URL(request.url ?? "/", "http://localhost");

  if (url.pathname !== "/auth/login") {
    return false;
  }

  if (request.method !== "POST") {
    sendJson(response, 405, {
      error: "Method not allowed.",
    });
    return true;
  }

  sendJson(response, 200, {
    token: DEV_AUTH_TOKEN,
  });
  return true;
}
`;
}

function createAuthMiddlewareContents(): string {
  return `import type { IncomingMessage } from "node:http";

export const DEV_AUTH_TOKEN = "dev-token";

export type AuthCheckResult =
  | { authorized: true }
  | {
      authorized: false;
      statusCode: 401;
      body: { error: string };
    };

export function requireAuth(request: IncomingMessage): AuthCheckResult {
  const authorizationHeader = request.headers.authorization;

  if (!authorizationHeader) {
    return {
      authorized: false,
      statusCode: 401,
      body: {
        error: "Missing Authorization header.",
      },
    };
  }

  if (authorizationHeader !== \`Bearer \${DEV_AUTH_TOKEN}\`) {
    return {
      authorized: false,
      statusCode: 401,
      body: {
        error: "Invalid bearer token.",
      },
    };
  }

  return {
    authorized: true,
  };
}
`;
}

export async function generateStarterCode(
  spec: ProjectSpec,
  architecture: ProjectArchitecture,
  options: GenerateStarterCodeOptions = {},
): Promise<GenerateStarterCodeResult> {
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
  const projectFilesCreated: string[] = [];
  const targets = buildCodeGenerationTargets(architecture);
  const metadata = buildResourceCodeMetadata(architecture, targets);

  const filesToGenerate = new Map<string, string>([
    ["package.json", createPackageJsonContents(spec)],
    ["tsconfig.json", createTsconfigContents()],
    ["jest.config.cjs", createJestConfigContents()],
    [".gitignore", createGitignoreContents()],
    [targets.appPath, createAppFileContents(metadata, authRequired)],
    [targets.serverPath, createServerFileContents()],
    [targets.healthRoutePath, createHealthRouteContents()],
    [targets.typePath, createTypeFileContents(metadata)],
    [targets.servicePath, createServiceFileContents(metadata)],
    [
      targets.resourceRoutePath,
      createResourceRouteContents(metadata, authRequired),
    ],
  ]);

  if (authRequired) {
    if (!targets.authRoutePath || !targets.authMiddlewarePath) {
      throw new Error(
        "Authentication was required, but the scaffold plan did not include auth route and middleware files.",
      );
    }

    filesToGenerate.set(targets.authRoutePath, createAuthRouteContents());
    filesToGenerate.set(
      targets.authMiddlewarePath,
      createAuthMiddlewareContents(),
    );
  }

  for (const [relativePath, contents] of filesToGenerate) {
    const result = await writeGeneratedFile(projectRoot, relativePath, contents);

    if (result.status === "written") {
      filesWritten.push(relativePath);

      if (result.created && PROJECT_LEVEL_FILES.has(relativePath)) {
        projectFilesCreated.push(relativePath);
      }

      continue;
    }

    filesSkipped.push(relativePath);
  }

  return {
    projectRoot,
    filesWritten,
    filesSkipped,
    projectFilesCreated,
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
