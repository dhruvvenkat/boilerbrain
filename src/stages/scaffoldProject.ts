import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, relative } from "node:path";

import type { ProjectArchitecture } from "./generateArchitecture.ts";
import type { ProjectSpec } from "./generateSpec.ts";

export interface ScaffoldProjectOptions {
  outputDir?: string;
}

export interface ScaffoldProjectResult {
  projectRoot: string;
  directoriesCreated: string[];
  filesCreated: string[];
  filesSkipped: string[];
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

type PathKind = "missing" | "file" | "directory";

async function getPathKind(path: string): Promise<PathKind> {
  try {
    const stats = await stat(path);
    return stats.isDirectory() ? "directory" : "file";
  } catch {
    return "missing";
  }
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
      `scaffoldProject only supports the v1 backend stack (backend-api, Node.js, TypeScript, REST, Jest, node:http, routes-services-types). Unsupported values: ${unsupportedValues.join(", ")}.`,
    );
  }
}

function resolveScaffoldPath(projectRoot: string, relativePath: string): string {
  const normalizedPath = normalize(relativePath);

  if (!normalizedPath || normalizedPath === ".") {
    throw new Error("Scaffold paths must be non-empty relative paths.");
  }

  if (isAbsolute(normalizedPath)) {
    throw new Error(`Scaffold paths must be relative: ${relativePath}`);
  }

  const absolutePath = join(projectRoot, normalizedPath);
  const relativeToRoot = relative(projectRoot, absolutePath);

  if (
    relativeToRoot === "" ||
    relativeToRoot.startsWith("..") ||
    isAbsolute(relativeToRoot)
  ) {
    throw new Error(`Scaffold path escapes the project root: ${relativePath}`);
  }

  return absolutePath;
}

export async function scaffoldProject(
  spec: ProjectSpec,
  architecture: ProjectArchitecture,
  options: ScaffoldProjectOptions = {},
): Promise<ScaffoldProjectResult> {
  validateSupportedStack(spec, architecture);

  if (spec.projectName !== architecture.projectName) {
    throw new Error(
      `Spec project name "${spec.projectName}" does not match architecture project name "${architecture.projectName}".`,
    );
  }

  const projectRoot = options.outputDir ?? process.cwd();
  const directoriesCreated: string[] = [];
  const filesCreated: string[] = [];
  const filesSkipped: string[] = [];

  await mkdir(projectRoot, { recursive: true });

  for (const directory of architecture.scaffoldPlan.directories) {
    const directoryPath = resolveScaffoldPath(projectRoot, directory.path);
    const directoryKind = await getPathKind(directoryPath);

    if (directoryKind === "directory") {
      continue;
    }

    if (directoryKind === "file") {
      throw new Error(
        `Cannot create scaffold directory "${directory.path}" because a file already exists at that path.`,
      );
    }

    await mkdir(directoryPath, { recursive: true });
    directoriesCreated.push(directory.path);
  }

  for (const file of architecture.scaffoldPlan.files) {
    const filePath = resolveScaffoldPath(projectRoot, file.path);
    const parentDirectory = dirname(filePath);

    await mkdir(parentDirectory, { recursive: true });

    const fileKind = await getPathKind(filePath);

    if (fileKind === "directory") {
      throw new Error(
        `Cannot create scaffold file "${file.path}" because a directory already exists at that path.`,
      );
    }

    if (fileKind === "file") {
      filesSkipped.push(file.path);
      continue;
    }

    try {
      await writeFile(filePath, "", { encoding: "utf8", flag: "wx" });
      filesCreated.push(file.path);
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "EEXIST"
      ) {
        filesSkipped.push(file.path);
        continue;
      }

      throw error;
    }
  }

  return {
    projectRoot,
    directoriesCreated,
    filesCreated,
    filesSkipped,
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
