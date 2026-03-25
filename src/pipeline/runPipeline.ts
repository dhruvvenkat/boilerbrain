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

export interface PipelineStageResult {
  key: PipelineStageKey;
  label: string;
  output: string;
}

export interface PipelineRunResult {
  prompt: string;
  stages: PipelineStageResult[];
}

export interface RunPipelineOptions {
  outputDir?: string;
}

function validatePrompt(prompt: string): string {
  const normalizedPrompt = prompt.trim();

  if (!normalizedPrompt) {
    throw new Error("A natural-language prompt is required.");
  }

  return normalizedPrompt;
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
  const stages: PipelineStageResult[] = [
    {
      key: "parsePrompt",
      label: "Parse Prompt",
      output: `Accepted prompt: "${validatedPrompt}"`,
    },
  ];

  const specResult = await generateSpec(validatedPrompt, {
    outputDir: options.outputDir,
  });

  stages.push({
    key: "generateSpec",
    label: "Generate Spec",
    output: `Created spec at ${specResult.outputPath}\n${JSON.stringify(
      specResult.spec,
      null,
      2,
    )}`,
  });

  const architectureResult = await generateArchitecture(specResult.spec, {
    outputDir: options.outputDir,
  });

  const scaffoldResult = await scaffoldProject(
    specResult.spec,
    architectureResult.architecture,
    {
      outputDir: options.outputDir,
    },
  );

  const starterCodeResult = await generateStarterCode(
    specResult.spec,
    architectureResult.architecture,
    {
      outputDir: options.outputDir,
    },
  );

  const starterTestsResult = await generateStarterTests(
    specResult.spec,
    architectureResult.architecture,
    {
      outputDir: options.outputDir,
    },
  );

  const runGeneratedTestsResult = await runGeneratedTests(
    specResult.spec,
    architectureResult.architecture,
    {
      outputDir: options.outputDir,
    },
  );

  const validationChecklistResult = await generateValidationChecklist(
    specResult.spec,
    architectureResult.architecture,
    scaffoldResult,
    starterCodeResult,
    starterTestsResult,
    runGeneratedTestsResult,
    {
      outputDir: options.outputDir,
    },
  );

  stages.push(
    {
      key: "generateArchitecture",
      label: "Generate Architecture",
      output: `Created architecture at ${architectureResult.outputPath}\n${JSON.stringify(
        architectureResult.architecture,
        null,
        2,
      )}`,
    },
    {
      key: "scaffoldProject",
      label: "Scaffold Project",
      output: formatScaffoldOutput(scaffoldResult),
    },
    {
      key: "generateStarterCode",
      label: "Generate Starter Code",
      output: formatStarterCodeOutput(starterCodeResult),
    },
    {
      key: "generateStarterTests",
      label: "Generate Starter Tests",
      output: formatStarterTestsOutput(starterTestsResult),
    },
    {
      key: "runGeneratedTests",
      label: "Run Generated Tests",
      output: formatRunGeneratedTestsOutput(runGeneratedTestsResult),
    },
    {
      key: "validationChecklist",
      label: "Validation Checklist",
      output: formatValidationChecklistOutput(validationChecklistResult),
    },
  );

  return {
    prompt: validatedPrompt,
    stages,
  };
}
