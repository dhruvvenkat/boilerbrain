import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface ProjectSpec {
  version: 1;
  sourcePrompt: string;
  projectName: string;
  summary: string;
  projectType: "backend-api";
  stack: {
    runtime: "node";
    language: "typescript";
    apiStyle: "rest";
    testFramework: "jest";
  };
  requirements: {
    functional: string[];
    nonFunctional: string[];
  };
  domain: {
    primaryResource: string | null;
    authenticationRequired: boolean;
  };
  architecture: {
    style: "layered-rest-api";
    serverFramework: "node:http";
    moduleLayout: "routes-services-types";
    routePattern: "health-and-resource-crud";
    testingScope: "service-and-http";
    persistenceStrategy: "defer-storage-choice";
  };
  assumptions: string[];
  openQuestions: string[];
}

export interface GenerateSpecOptions {
  outputDir?: string;
}

export interface GenerateSpecResult {
  spec: ProjectSpec;
  outputPath: string;
}

const RESOURCE_PATTERNS = [
  /\b(?:build|create|generate|make)\s+(?:me\s+)?(?:an?\s+)?(?<resource>[a-z0-9][a-z0-9\s-]{0,40}?)\s+(?:api|service|application|app)\b/i,
  /\b(?<resource>[a-z0-9][a-z0-9\s-]{0,40}?)\s+(?:api|service|application|app)\b/i,
];

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "app",
  "application",
  "backend",
  "build",
  "create",
  "for",
  "generate",
  "make",
  "me",
  "rest",
  "service",
  "the",
]);

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function toKebabCase(value: string): string {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toDisplayName(value: string): string {
  const normalized = normalizeWhitespace(value);

  if (!normalized) {
    return normalized;
  }

  return normalized
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function detectAuthentication(prompt: string): boolean {
  return /\b(auth|authentication|login|signin|sign-in|jwt|session)\b/i.test(
    prompt,
  );
}

function extractPrimaryResource(prompt: string): string | null {
  for (const pattern of RESOURCE_PATTERNS) {
    const match = pattern.exec(prompt);
    const resource = match?.groups?.resource;

    if (!resource) {
      continue;
    }

    const cleanedResource = normalizeWhitespace(resource)
      .split(" ")
      .filter((word) => !STOP_WORDS.has(word.toLowerCase()))
      .join(" ");

    if (cleanedResource) {
      return cleanedResource.toLowerCase();
    }
  }

  const fallbackTokens = normalizeWhitespace(prompt)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(" ")
    .filter((token) => token && !STOP_WORDS.has(token));

  if (fallbackTokens.length === 0) {
    return null;
  }

  return fallbackTokens.slice(0, 2).join(" ");
}

function buildProjectName(primaryResource: string | null): string {
  if (!primaryResource) {
    return "backend-api";
  }

  return `${toKebabCase(primaryResource)}-api`;
}

function buildSummary(
  primaryResource: string | null,
  authenticationRequired: boolean,
): string {
  const resourceDescription = primaryResource
    ? `${toDisplayName(primaryResource)} records`
    : "domain resources";
  const authenticationDescription = authenticationRequired
    ? " with authentication"
    : "";

  return `Backend REST API for managing ${resourceDescription}${authenticationDescription}, generated with a Node.js and TypeScript starter stack.`;
}

function buildFunctionalRequirements(
  primaryResource: string | null,
  authenticationRequired: boolean,
): string[] {
  const requirements = [
    "The project should expose a REST API built with Node.js and TypeScript.",
    "The generated project should include starter Jest tests.",
  ];

  if (primaryResource) {
    requirements.push(
      `The API should provide starter endpoints for ${primaryResource}.`,
    );
  } else {
    requirements.push(
      "The API should provide starter endpoints for the primary domain resource.",
    );
  }

  if (authenticationRequired) {
    requirements.push("The API should include authentication support.");
  }

  return requirements;
}

function buildAssumptions(primaryResource: string | null): string[] {
  const assumptions = [
    "This MVP targets a backend REST API only.",
    "The default stack is Node.js, TypeScript, and Jest.",
    "Architecture defaults to a layered REST layout with native Node.js HTTP primitives.",
  ];

  if (!primaryResource) {
    assumptions.push(
      "The primary domain resource was not explicit in the prompt and will need refinement later.",
    );
  }

  return assumptions;
}

function buildOpenQuestions(
  primaryResource: string | null,
  authenticationRequired: boolean,
): string[] {
  const openQuestions = [
    "Which data persistence approach should the generated project assume?",
    "Are there any required endpoints beyond the default REST starter routes?",
  ];

  if (!primaryResource) {
    openQuestions.unshift(
      "What is the primary resource or domain entity this API should manage?",
    );
  }

  if (!authenticationRequired) {
    openQuestions.push("Does the API need authentication or can it be public?");
  }

  return openQuestions;
}

function buildArchitectureDefaults(): ProjectSpec["architecture"] {
  return {
    style: "layered-rest-api",
    serverFramework: "node:http",
    moduleLayout: "routes-services-types",
    routePattern: "health-and-resource-crud",
    testingScope: "service-and-http",
    persistenceStrategy: "defer-storage-choice",
  };
}

export function buildProjectSpec(prompt: string): ProjectSpec {
  const normalizedPrompt = normalizeWhitespace(prompt);

  if (!normalizedPrompt) {
    throw new Error("A natural-language prompt is required.");
  }

  const primaryResource = extractPrimaryResource(normalizedPrompt);
  const authenticationRequired = detectAuthentication(normalizedPrompt);

  return {
    version: 1,
    sourcePrompt: normalizedPrompt,
    projectName: buildProjectName(primaryResource),
    summary: buildSummary(primaryResource, authenticationRequired),
    projectType: "backend-api",
    stack: {
      runtime: "node",
      language: "typescript",
      apiStyle: "rest",
      testFramework: "jest",
    },
    requirements: {
      functional: buildFunctionalRequirements(
        primaryResource,
        authenticationRequired,
      ),
      nonFunctional: [
        "The starter project should favor a clear, modular structure.",
        "The generated output should be lightweight and easy to extend.",
      ],
    },
    domain: {
      primaryResource,
      authenticationRequired,
    },
    architecture: buildArchitectureDefaults(),
    assumptions: buildAssumptions(primaryResource),
    openQuestions: buildOpenQuestions(primaryResource, authenticationRequired),
  };
}

export async function generateSpec(
  prompt: string,
  options: GenerateSpecOptions = {},
): Promise<GenerateSpecResult> {
  const spec = buildProjectSpec(prompt);
  const outputDir = options.outputDir ?? join(process.cwd(), "src");
  const outputPath = join(outputDir, "spec.json");

  await mkdir(outputDir, { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(spec, null, 2)}\n`, "utf8");

  return {
    spec,
    outputPath,
  };
}
