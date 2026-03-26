import { generateArchitecture } from "../stages/generateArchitecture.ts";
import { generateSpec } from "../stages/generateSpec.ts";
import { generateStarterCode } from "../stages/generateStarterCode.ts";
import { generateStarterTests } from "../stages/generateTests.ts";
import { runGeneratedTests } from "../stages/runGeneratedTests.ts";
import { scaffoldProject } from "../stages/scaffoldProject.ts";
import { generateValidationChecklist } from "../stages/validationChecklist.ts";

export type PipelineStageKey =
  | "parsePrompt"
  | "generateSpec"
  | "generateArchitecture"
  | "scaffoldProject"
  | "generateStarterCode"
  | "generateStarterTests"
  | "runGeneratedTests"
  | "validationChecklist";

export type PipelineStageStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed";

export interface PipelineStageResult {
  key: PipelineStageKey;
  label: string;
  output: string;
}

export interface PipelineStageUpdate {
  key: PipelineStageKey;
  label: string;
  status: PipelineStageStatus;
  output?: string;
}

export interface PipelineRunResult {
  prompt: string;
  stages: PipelineStageResult[];
}

export interface RunPipelineOptions {
  outputDir?: string;
  onStageUpdate?: (update: PipelineStageUpdate) => void;
}

interface StageDescriptor<T> {
  key: PipelineStageKey;
  label: string;
  format: (result: T) => string;
  run: () => Promise<T> | T;
}

function validatePrompt(prompt: string): string {
  const normalizedPrompt = prompt.trim();

  if (!normalizedPrompt) {
    throw new Error("A natural-language prompt is required.");
  }

  return normalizedPrompt;
}

function emitStageUpdate(
  options: RunPipelineOptions,
  update: PipelineStageUpdate,
): void {
  options.onStageUpdate?.(update);
}

async function executeStage<T>(
  descriptor: StageDescriptor<T>,
  stages: PipelineStageResult[],
  options: RunPipelineOptions,
): Promise<T> {
  emitStageUpdate(options, {
    key: descriptor.key,
    label: descriptor.label,
    status: "pending",
  });
  emitStageUpdate(options, {
    key: descriptor.key,
    label: descriptor.label,
    status: "running",
  });

  try {
    const result = await descriptor.run();
    const output = descriptor.format(result);

    stages.push({
      key: descriptor.key,
      label: descriptor.label,
      output,
    });

    emitStageUpdate(options, {
      key: descriptor.key,
      label: descriptor.label,
      status: "completed",
      output,
    });

    return result;
  } catch (error) {
    emitStageUpdate(options, {
      key: descriptor.key,
      label: descriptor.label,
      status: "failed",
    });

    throw error;
  }
}

function formatScaffoldOutput(result: Awaited<ReturnType<typeof scaffoldProject>>): string {
  const lines = [
    `Scaffolded project at ${result.projectRoot}`,
    `Created ${result.directoriesCreated.length} directories and ${result.filesCreated.length} files.`,
    `Skipped ${result.filesSkipped.length} existing files.`,
    `Stack: ${result.stack.projectType}, ${result.stack.runtime}, ${result.stack.language}, ${result.stack.apiStyle}, ${result.stack.testFramework}, ${result.stack.serverFramework}, ${result.stack.moduleLayout}`,
  ];

  if (result.directoriesCreated.length > 0) {
    lines.push(`Directories: ${result.directoriesCreated.join(", ")}`);
  }

  if (result.filesCreated.length > 0) {
    lines.push(`Files: ${result.filesCreated.join(", ")}`);
  }

  if (result.filesSkipped.length > 0) {
    lines.push(`Skipped existing files: ${result.filesSkipped.join(", ")}`);
  }

  return lines.join("\n");
}

function formatStarterCodeOutput(
  result: Awaited<ReturnType<typeof generateStarterCode>>,
): string {
  const lines = [
    `Generated starter code at ${result.projectRoot}`,
    `Wrote ${result.filesWritten.length} files.`,
    `Created ${result.projectFilesCreated.length} project-level files.`,
    `Skipped ${result.filesSkipped.length} existing files.`,
    `Stack: ${result.stack.projectType}, ${result.stack.runtime}, ${result.stack.language}, ${result.stack.apiStyle}, ${result.stack.testFramework}, ${result.stack.serverFramework}, ${result.stack.moduleLayout}`,
  ];

  if (result.projectFilesCreated.length > 0) {
    lines.push(`Project files: ${result.projectFilesCreated.join(", ")}`);
  }

  if (result.filesWritten.length > 0) {
    lines.push(`Files: ${result.filesWritten.join(", ")}`);
  }

  if (result.filesSkipped.length > 0) {
    lines.push(`Skipped existing files: ${result.filesSkipped.join(", ")}`);
  }

  return lines.join("\n");
}

function formatStarterTestsOutput(
  result: Awaited<ReturnType<typeof generateStarterTests>>,
): string {
  const lines = [
    `Generated starter tests at ${result.projectRoot}`,
    `Wrote ${result.filesWritten.length} test files.`,
    `Skipped ${result.filesSkipped.length} existing files.`,
    `Stack: ${result.stack.projectType}, ${result.stack.runtime}, ${result.stack.language}, ${result.stack.apiStyle}, ${result.stack.testFramework}, ${result.stack.serverFramework}, ${result.stack.moduleLayout}`,
  ];

  if (result.testFilesGenerated.length > 0) {
    lines.push(`Tests: ${result.testFilesGenerated.join(", ")}`);
  }

  if (result.filesSkipped.length > 0) {
    lines.push(`Skipped existing files: ${result.filesSkipped.join(", ")}`);
  }

  return lines.join("\n");
}

function formatRunGeneratedTestsOutput(
  result: Awaited<ReturnType<typeof runGeneratedTests>>,
): string {
  const lines = [
    `Generated test execution status: ${result.status}`,
    `Command: ${result.command}`,
    `Stack: ${result.stack.projectType}, ${result.stack.runtime}, ${result.stack.language}, ${result.stack.apiStyle}, ${result.stack.testFramework}, ${result.stack.serverFramework}, ${result.stack.moduleLayout}`,
  ];

  if (result.exitCode !== null) {
    lines.push(`Exit code: ${result.exitCode}`);
  }

  if (result.reason) {
    lines.push(`Reason: ${result.reason}`);
  }

  if (result.stdout.trim()) {
    lines.push(`Stdout: ${result.stdout.trim()}`);
  }

  if (result.stderr.trim()) {
    lines.push(`Stderr: ${result.stderr.trim()}`);
  }

  return lines.join("\n");
}

function formatValidationChecklistOutput(
  result: Awaited<ReturnType<typeof generateValidationChecklist>>,
): string {
  return `Created validation checklist at ${result.outputPath}\n${result.checklist}`;
}

export async function runPipeline(
  prompt: string,
  options: RunPipelineOptions = {},
): Promise<PipelineRunResult> {
  const validatedPrompt = validatePrompt(prompt);
  const stages: PipelineStageResult[] = [];

  await executeStage(
    {
      key: "parsePrompt",
      label: "Parse Prompt",
      format: (result: string) => `Accepted prompt: "${result}"`,
      run: () => validatedPrompt,
    },
    stages,
    options,
  );

  const specResult = await executeStage(
    {
      key: "generateSpec",
      label: "Generate Spec",
      format: (result) =>
        `Created spec at ${result.outputPath}\n${JSON.stringify(
          result.spec,
          null,
          2,
        )}`,
      run: () =>
        generateSpec(validatedPrompt, {
          outputDir: options.outputDir,
        }),
    },
    stages,
    options,
  );

  const architectureResult = await executeStage(
    {
      key: "generateArchitecture",
      label: "Generate Architecture",
      format: (result) =>
        `Created architecture at ${result.outputPath}\n${JSON.stringify(
          result.architecture,
          null,
          2,
        )}`,
      run: () =>
        generateArchitecture(specResult.spec, {
          outputDir: options.outputDir,
        }),
    },
    stages,
    options,
  );

  const scaffoldResult = await executeStage(
    {
      key: "scaffoldProject",
      label: "Scaffold Project",
      format: formatScaffoldOutput,
      run: () =>
        scaffoldProject(specResult.spec, architectureResult.architecture, {
          outputDir: options.outputDir,
        }),
    },
    stages,
    options,
  );

  const starterCodeResult = await executeStage(
    {
      key: "generateStarterCode",
      label: "Generate Starter Code",
      format: formatStarterCodeOutput,
      run: () =>
        generateStarterCode(specResult.spec, architectureResult.architecture, {
          outputDir: options.outputDir,
        }),
    },
    stages,
    options,
  );

  const starterTestsResult = await executeStage(
    {
      key: "generateStarterTests",
      label: "Generate Starter Tests",
      format: formatStarterTestsOutput,
      run: () =>
        generateStarterTests(specResult.spec, architectureResult.architecture, {
          outputDir: options.outputDir,
        }),
    },
    stages,
    options,
  );

  const runGeneratedTestsResult = await executeStage(
    {
      key: "runGeneratedTests",
      label: "Run Generated Tests",
      format: formatRunGeneratedTestsOutput,
      run: () =>
        runGeneratedTests(specResult.spec, architectureResult.architecture, {
          outputDir: options.outputDir,
        }),
    },
    stages,
    options,
  );

  await executeStage(
    {
      key: "validationChecklist",
      label: "Validation Checklist",
      format: formatValidationChecklistOutput,
      run: () =>
        generateValidationChecklist(
          specResult.spec,
          architectureResult.architecture,
          scaffoldResult,
          starterCodeResult,
          starterTestsResult,
          runGeneratedTestsResult,
          {
            outputDir: options.outputDir,
          },
        ),
    },
    stages,
    options,
  );

  return {
    prompt: validatedPrompt,
    stages,
  };
}
