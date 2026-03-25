import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { ProjectSpec } from "./generateSpec.ts";

export interface ArchitectureDecision {
  key:
    | "runtime"
    | "http_server"
    | "module_layout"
    | "persistence"
    | "testing"
    | "authentication";
  title: string;
  choice: string;
  rationale: string;
  alternatives: string[];
}

export interface ScaffoldDirectory {
  path: string;
  purpose: string;
}

export interface ScaffoldFile {
  path: string;
  purpose: string;
}

export interface StarterEndpoint {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  purpose: string;
  protected: boolean;
}

export interface ProjectArchitecture {
  version: 1;
  sourcePrompt: string;
  projectName: string;
  summary: string;
  architectureStyle: ProjectSpec["architecture"]["style"];
  stack: ProjectSpec["stack"] & {
    serverFramework: ProjectSpec["architecture"]["serverFramework"];
  };
  scaffoldPlan: {
    directories: ScaffoldDirectory[];
    files: ScaffoldFile[];
  };
  moduleBoundaries: {
    app: string;
    routes: string;
    services: string;
    tests: string;
    middleware?: string;
  };
  apiPlan: {
    healthEndpoint: StarterEndpoint;
    resource: {
      name: string | null;
      collectionPath: string;
      operations: StarterEndpoint[];
    };
  };
  crossCuttingConcerns: {
    authentication: {
      required: boolean;
      approach: string;
    };
    errorHandling: string;
    configuration: string;
    persistence: string;
  };
  majorDecisions: ArchitectureDecision[];
  implementationNotes: string[];
  openQuestions: string[];
}

export interface GenerateArchitectureOptions {
  outputDir?: string;
}

export interface GenerateArchitectureResult {
  architecture: ProjectArchitecture;
  outputPath: string;
}

interface ResourceMetadata {
  displayName: string;
  singularKebab: string;
  pluralKebab: string;
  serviceFileStem: string;
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function toKebabCase(value: string): string {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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

function pluralizeKebabSegment(value: string): string {
  if (!value) {
    return "resources";
  }

  if (value.endsWith("s")) {
    return value;
  }

  if (value.endsWith("y") && !/[aeiou]y$/.test(value)) {
    return `${value.slice(0, -1)}ies`;
  }

  if (/(ch|sh|x|z)$/.test(value)) {
    return `${value}es`;
  }

  return `${value}s`;
}

function resolveResourceMetadata(primaryResource: string | null): ResourceMetadata {
  if (!primaryResource) {
    return {
      displayName: "Primary resource",
      singularKebab: "resource",
      pluralKebab: "resources",
      serviceFileStem: "resource",
    };
  }

  const normalizedResource = normalizeWhitespace(primaryResource);
  const singularKebab = toKebabCase(normalizedResource);

  return {
    displayName: normalizedResource,
    singularKebab,
    pluralKebab: pluralizeKebabSegment(singularKebab),
    serviceFileStem: toCamelCase(normalizedResource),
  };
}

function describeServerFramework(
  serverFramework: ProjectSpec["architecture"]["serverFramework"],
): string {
  switch (serverFramework) {
    case "node:http":
      return "native Node.js HTTP modules";
  }
}

function describeArchitectureStyle(
  style: ProjectSpec["architecture"]["style"],
): string {
  switch (style) {
    case "layered-rest-api":
      return "Layered REST API architecture";
  }
}

function describeModuleLayout(
  moduleLayout: ProjectSpec["architecture"]["moduleLayout"],
): string {
  switch (moduleLayout) {
    case "routes-services-types":
      return "route/service/type separation";
  }
}

function describeTestingScope(
  testingScope: ProjectSpec["architecture"]["testingScope"],
): string {
  switch (testingScope) {
    case "service-and-http":
      return "service and HTTP coverage";
  }
}

function buildAuthenticationSummary(
  authenticationRequired: boolean,
): string {
  return authenticationRequired
    ? "protected by an authentication middleware boundary"
    : "kept public by default";
}

function buildSummary(spec: ProjectSpec, resource: ResourceMetadata): string {
  const authenticationSummary = buildAuthenticationSummary(
    spec.domain.authenticationRequired,
  );

  const language =
    spec.stack.language === "typescript" ? "TypeScript" : spec.stack.language;

  return `${describeArchitectureStyle(spec.architecture.style)} for ${resource.displayName.toLowerCase()} using ${describeServerFramework(spec.architecture.serverFramework)}, ${language}, ${describeModuleLayout(spec.architecture.moduleLayout)}, and ${specTestFrameworkLabel(spec.stack.testFramework)} with ${describeTestingScope(spec.architecture.testingScope)}, ${authenticationSummary}.`;
}

function buildScaffoldDirectories(
  moduleLayout: ProjectSpec["architecture"]["moduleLayout"],
  authenticationRequired: boolean,
): ScaffoldDirectory[] {
  const directories: ScaffoldDirectory[] = [
    {
      path: "src",
      purpose: "Application source files and runtime entrypoints.",
    },
    {
      path: "tests",
      purpose: "Generated test coverage for the starter project.",
    },
  ];

  switch (moduleLayout) {
    case "routes-services-types":
      directories.push(
        {
          path: "src/routes",
          purpose: "HTTP route handlers for health and resource endpoints.",
        },
        {
          path: "src/services",
          purpose: "Business logic kept separate from request parsing.",
        },
        {
          path: "src/types",
          purpose: "TypeScript interfaces for request and domain shapes.",
        },
      );
      break;
  }

  if (authenticationRequired) {
    directories.push({
      path: "src/middleware",
      purpose: "Authentication checks applied before protected routes.",
    });
  }

  return directories;
}

function buildScaffoldFiles(
  moduleLayout: ProjectSpec["architecture"]["moduleLayout"],
  routePattern: ProjectSpec["architecture"]["routePattern"],
  testingScope: ProjectSpec["architecture"]["testingScope"],
  testFramework: ProjectSpec["stack"]["testFramework"],
  resource: ResourceMetadata,
  authenticationRequired: boolean,
): ScaffoldFile[] {
  const files: ScaffoldFile[] = [
    {
      path: "src/app.ts",
      purpose: "Create the top-level request handler and register routes.",
    },
    {
      path: "src/server.ts",
      purpose: "Start the HTTP server and expose a clean process entrypoint.",
    },
  ];

  switch (moduleLayout) {
    case "routes-services-types":
      files.push(
        {
          path: `src/services/${resource.serviceFileStem}Service.ts`,
          purpose: "Resource-specific business logic and placeholder data handling.",
        },
        {
          path: `src/types/${resource.singularKebab}.ts`,
          purpose: "Shared request and entity types for the primary resource.",
        },
      );
      break;
  }

  switch (routePattern) {
    case "health-and-resource-crud":
      files.push(
        {
          path: "src/routes/health.ts",
          purpose: "Health endpoint used for smoke tests and validation.",
        },
        {
          path: `src/routes/${resource.pluralKebab}.ts`,
          purpose: "Resource route definitions for the generated CRUD starter API.",
        },
      );
      break;
  }

  switch (testingScope) {
    case "service-and-http":
      files.push(
        {
          path: `tests/${resource.serviceFileStem}.test.ts`,
          purpose: `Starter ${specTestFrameworkLabel(testFramework)} tests for the resource service and routes.`,
        },
        {
          path: "tests/health.test.ts",
          purpose: "Validation test that confirms the health endpoint is wired up.",
        },
      );
      break;
  }

  if (authenticationRequired) {
    files.push(
      {
        path: "src/routes/auth.ts",
        purpose: "Authentication route(s) such as login or token issuance.",
      },
      {
        path: "src/middleware/auth.ts",
        purpose: "Authentication middleware boundary for protected routes.",
      },
      {
        path: "tests/auth.test.ts",
        purpose: `Starter ${specTestFrameworkLabel(testFramework)} coverage for authentication flow and protection.`,
      },
    );
  }

  return files;
}

function specTestFrameworkLabel(
  testFramework: ProjectSpec["stack"]["testFramework"],
): string {
  switch (testFramework) {
    case "jest":
      return "Jest";
  }
}

function buildResourceOperations(
  routePattern: ProjectSpec["architecture"]["routePattern"],
  resource: ResourceMetadata,
  authenticationRequired: boolean,
): StarterEndpoint[] {
  const basePath = `/${resource.pluralKebab}`;

  switch (routePattern) {
    case "health-and-resource-crud":
      return [
        {
          method: "GET",
          path: basePath,
          purpose: `List ${resource.displayName.toLowerCase()} records.`,
          protected: authenticationRequired,
        },
        {
          method: "GET",
          path: `${basePath}/:id`,
          purpose: `Fetch a single ${resource.displayName.toLowerCase()} record.`,
          protected: authenticationRequired,
        },
        {
          method: "POST",
          path: basePath,
          purpose: `Create a new ${resource.displayName.toLowerCase()} record.`,
          protected: authenticationRequired,
        },
        {
          method: "PUT",
          path: `${basePath}/:id`,
          purpose: `Update an existing ${resource.displayName.toLowerCase()} record.`,
          protected: authenticationRequired,
        },
        {
          method: "DELETE",
          path: `${basePath}/:id`,
          purpose: `Delete an existing ${resource.displayName.toLowerCase()} record.`,
          protected: authenticationRequired,
        },
      ];
  }
}

function buildModuleBoundaries(
  moduleLayout: ProjectSpec["architecture"]["moduleLayout"],
  authenticationRequired: boolean,
): ProjectArchitecture["moduleBoundaries"] {
  switch (moduleLayout) {
    case "routes-services-types":
      return {
        app: "Compose the HTTP server, route registration, and shared request flow.",
        routes:
          "Translate HTTP requests into service calls and serialize HTTP responses.",
        services:
          "Own business rules and placeholder data operations without HTTP concerns.",
        tests: "Validate the generated endpoints and starter business logic.",
        ...(authenticationRequired
          ? {
              middleware:
                "Centralize authentication checks before protected routes execute.",
            }
          : {}),
      };
  }
}

function buildPersistenceDescription(
  persistenceStrategy: ProjectSpec["architecture"]["persistenceStrategy"],
): string {
  switch (persistenceStrategy) {
    case "defer-storage-choice":
      return "Leave persistence as a later decision and keep generated services independent from any database library.";
  }
}

function buildHealthEndpoint(
  routePattern: ProjectSpec["architecture"]["routePattern"],
): StarterEndpoint {
  switch (routePattern) {
    case "health-and-resource-crud":
      return {
        method: "GET",
        path: "/health",
        purpose: "Report service health for smoke tests and validation.",
        protected: false,
      };
  }
}

function buildMajorDecisions(
  spec: ProjectSpec,
  resource: ResourceMetadata,
): ArchitectureDecision[] {
  const decisions: ArchitectureDecision[] = [
    {
      key: "runtime",
      title: "Runtime And Language",
      choice: `Use ${spec.stack.runtime === "node" ? "Node.js" : spec.stack.runtime} with ${spec.stack.language === "typescript" ? "TypeScript" : spec.stack.language} for the generated backend starter.`,
      rationale:
        "The spec carries the chosen runtime and language, and the PRD scopes the MVP to a Node.js/TypeScript backend starter.",
      alternatives: [
        "Use plain JavaScript for faster initial output.",
        "Target another runtime such as Bun or Deno.",
      ],
    },
    {
      key: "http_server",
      title: "HTTP Server Choice",
      choice: `Use ${describeServerFramework(spec.architecture.serverFramework)} behind route modules instead of introducing a larger framework at this stage.`,
      rationale:
        "The server framework is now chosen in the spec, and this default keeps the generated starter lightweight while still supporting REST endpoints.",
      alternatives: [
        "Use Express for a more familiar middleware ecosystem.",
        "Use Fastify for higher performance and plugin support.",
      ],
    },
    {
      key: "module_layout",
      title: "Module Layout",
      choice: `Adopt ${describeModuleLayout(spec.architecture.moduleLayout)}, with optional middleware when authentication is required.`,
      rationale:
        "The module layout comes from the spec and matches the PRD requirement for a clear modular scaffold.",
      alternatives: [
        "Keep everything in a single entrypoint for maximum simplicity.",
        "Introduce controllers and repositories immediately.",
      ],
    },
    {
      key: "persistence",
      title: "Persistence Boundary",
      choice: buildPersistenceDescription(
        spec.architecture.persistenceStrategy,
      ),
      rationale:
        "The persistence strategy comes from the spec, and database integration is explicitly out of scope for the MVP.",
      alternatives: [
        "Add a repository layer and in-memory implementation immediately.",
        "Commit to a database and ORM from the start.",
      ],
    },
    {
      key: "testing",
      title: "Testing Strategy",
      choice: `Generate ${specTestFrameworkLabel(spec.stack.testFramework)} tests for ${describeTestingScope(spec.architecture.testingScope)}.`,
      rationale:
        "The test framework and test scope now live in the spec, and the PRD requires starter test generation for the produced backend.",
      alternatives: [
        "Use `node:test` to avoid a testing dependency.",
        "Limit tests to service-only unit coverage.",
      ],
    },
  ];

  decisions.push(
    spec.domain.authenticationRequired
      ? {
          key: "authentication",
          title: "Authentication Boundary",
          choice:
            "Protect the resource routes with dedicated authentication middleware and keep auth-specific routes separate.",
          rationale:
            "Authentication is required by the prompt, and a middleware boundary keeps security checks centralized instead of scattering them across handlers.",
          alternatives: [
            "Inline authentication checks inside each route handler.",
            "Use session-based auth with server-managed state.",
          ],
        }
      : {
          key: "authentication",
          title: "Authentication Boundary",
          choice:
            "Keep the MVP starter public by default and avoid scaffolding unused auth middleware.",
          rationale:
            "The prompt does not require authentication, so the smaller architecture keeps the scaffold focused on the core resource API.",
          alternatives: [
            "Always scaffold auth middleware for future use.",
            "Add a full auth subsystem preemptively.",
          ],
        },
  );

  if (!spec.domain.primaryResource) {
    decisions.push({
      key: "module_layout",
      title: "Fallback Resource Naming",
      choice: "Use a generic `resource` module name until the domain is clarified.",
      rationale:
        "The prompt did not identify a primary entity, but the scaffold still needs a stable route and service naming convention to keep the pipeline moving.",
      alternatives: [
        "Refuse generation until a resource is provided.",
        `Infer a domain name directly from the prompt summary for ${resource.displayName.toLowerCase()}.`,
      ],
    });
  }

  return decisions;
}

function buildImplementationNotes(
  spec: ProjectSpec,
  resource: ResourceMetadata,
): string[] {
  const notes = [
    "The scaffold stage should create the planned directories and starter files exactly as listed in `scaffoldPlan`.",
    "The starter code stage should populate `src/app.ts` and `src/server.ts` first, then add the resource route and service modules.",
    `Resource endpoints should follow the \`${spec.architecture.routePattern}\` pattern and use \`/${resource.pluralKebab}\` as the default collection path.`,
    `Generated ${specTestFrameworkLabel(spec.stack.testFramework)} tests should cover the ${spec.architecture.testingScope} scope from the spec.`,
  ];

  if (spec.domain.authenticationRequired) {
    notes.push(
      "Protected routes should apply authentication middleware before invoking resource handlers.",
    );
  } else {
    notes.push(
      "Authentication should remain an open extension point rather than introducing auth-specific files later in the pipeline.",
    );
  }

  return notes;
}

export function buildProjectArchitecture(
  spec: ProjectSpec,
): ProjectArchitecture {
  const resource = resolveResourceMetadata(spec.domain.primaryResource);

  return {
    version: 1,
    sourcePrompt: spec.sourcePrompt,
    projectName: spec.projectName,
    summary: buildSummary(spec, resource),
    architectureStyle: spec.architecture.style,
    stack: {
      ...spec.stack,
      serverFramework: spec.architecture.serverFramework,
    },
    scaffoldPlan: {
      directories: buildScaffoldDirectories(
        spec.architecture.moduleLayout,
        spec.domain.authenticationRequired,
      ),
      files: buildScaffoldFiles(
        spec.architecture.moduleLayout,
        spec.architecture.routePattern,
        spec.architecture.testingScope,
        spec.stack.testFramework,
        resource,
        spec.domain.authenticationRequired,
      ),
    },
    moduleBoundaries: buildModuleBoundaries(
      spec.architecture.moduleLayout,
      spec.domain.authenticationRequired,
    ),
    apiPlan: {
      healthEndpoint: buildHealthEndpoint(spec.architecture.routePattern),
      resource: {
        name: spec.domain.primaryResource,
        collectionPath: `/${resource.pluralKebab}`,
        operations: buildResourceOperations(
          spec.architecture.routePattern,
          resource,
          spec.domain.authenticationRequired,
        ),
      },
    },
    crossCuttingConcerns: {
      authentication: {
        required: spec.domain.authenticationRequired,
        approach: spec.domain.authenticationRequired
          ? "Dedicated authentication middleware protects resource routes, with auth-specific routes isolated under `src/routes/auth.ts`."
          : "No authentication middleware is scaffolded by default; the API remains public unless later requirements change.",
      },
      errorHandling:
        "Return consistent JSON error payloads from route modules and keep service failures explicit for easier Jest assertions.",
      configuration:
        "Keep runtime configuration minimal and environment-driven so the starter project stays easy to run locally.",
      persistence: buildPersistenceDescription(
        spec.architecture.persistenceStrategy,
      ),
    },
    majorDecisions: buildMajorDecisions(spec, resource),
    implementationNotes: buildImplementationNotes(spec, resource),
    openQuestions: spec.openQuestions,
  };
}

export async function generateArchitecture(
  spec: ProjectSpec,
  options: GenerateArchitectureOptions = {},
): Promise<GenerateArchitectureResult> {
  const architecture = buildProjectArchitecture(spec);
  const outputDir = options.outputDir ?? join(process.cwd(), "src");
  const outputPath = join(outputDir, "architecture.json");

  await mkdir(outputDir, { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(architecture, null, 2)}\n`, "utf8");

  return {
    architecture,
    outputPath,
  };
}
