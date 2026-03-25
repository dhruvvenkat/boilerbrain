import { spawn } from "node:child_process";
import { access, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import type { ProjectArchitecture } from "./generateArchitecture.ts";
import type { ProjectSpec } from "./generateSpec.ts";

export interface RunGeneratedTestsOptions {
  outputDir?: string;
  commandRunner?: (
    projectRoot: string,
    command: string,
    args: string[],
  ) => Promise<CommandRunnerResult>;
}

export interface CommandRunnerResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface RunGeneratedTestsResult {
  projectRoot: string;
  command: string;
  status: "passed" | "failed" | "skipped";
  exitCode: number | null;
  stdout: string;
  stderr: string;
  reason?: string;
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

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
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
      `runGeneratedTests only supports the v1 backend stack (backend-api, Node.js, TypeScript, REST, Jest, node:http, routes-services-types). Unsupported values: ${unsupportedValues.join(", ")}.`,
    );
  }
}

async function ensurePackageJson(projectRoot: string): Promise<void> {
  const packageJsonPath = join(projectRoot, "package.json");

  if (!(await pathExists(packageJsonPath))) {
    throw new Error(
      `Cannot run generated tests because ${packageJsonPath} does not exist.`,
    );
  }

  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
    scripts?: Record<string, string>;
  };

  if (!packageJson.scripts?.test) {
    throw new Error(
      `Cannot run generated tests because package.json in ${projectRoot} does not define a test script.`,
    );
  }
}

async function defaultCommandRunner(
  projectRoot: string,
  command: string,
  args: string[],
): Promise<CommandRunnerResult> {
  return await new Promise<CommandRunnerResult>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolve({
        exitCode: exitCode ?? 1,
        stdout,
        stderr,
      });
    });
  });
}

export async function runGeneratedTests(
  spec: ProjectSpec,
  architecture: ProjectArchitecture,
  options: RunGeneratedTestsOptions = {},
): Promise<RunGeneratedTestsResult> {
  validateSupportedStack(spec, architecture);

  if (spec.projectName !== architecture.projectName) {
    throw new Error(
      `Spec project name "${spec.projectName}" does not match architecture project name "${architecture.projectName}".`,
    );
  }

  const projectRoot = options.outputDir ?? process.cwd();
  const command = "npm test";
  const stack = {
    projectType: spec.projectType,
    runtime: spec.stack.runtime,
    language: spec.stack.language,
    apiStyle: spec.stack.apiStyle,
    testFramework: spec.stack.testFramework,
    serverFramework: architecture.stack.serverFramework,
    architectureStyle: architecture.architectureStyle,
    moduleLayout: spec.architecture.moduleLayout,
  };

  await ensurePackageJson(projectRoot);

  const nodeModulesPath = join(projectRoot, "node_modules");

  if (!(await pathExists(nodeModulesPath))) {
    return {
      projectRoot,
      command,
      status: "skipped",
      exitCode: null,
      stdout: "",
      stderr: "",
      reason:
        "Generated project dependencies are not installed. Run `npm install` in the generated project before executing its Jest suite.",
      stack,
    };
  }

  const nodeModulesStats = await stat(nodeModulesPath);

  if (!nodeModulesStats.isDirectory()) {
    throw new Error(
      `Cannot run generated tests because ${nodeModulesPath} exists but is not a directory.`,
    );
  }

  const runner = options.commandRunner ?? defaultCommandRunner;
  const commandResult = await runner(projectRoot, "npm", ["test"]);

  return {
    projectRoot,
    command,
    status: commandResult.exitCode === 0 ? "passed" : "failed",
    exitCode: commandResult.exitCode,
    stdout: commandResult.stdout,
    stderr: commandResult.stderr,
    ...(commandResult.exitCode === 0
      ? {}
      : {
          reason: "The generated Jest suite exited with a non-zero status.",
        }),
    stack,
  };
}
