import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { ProjectArchitecture } from "./generateArchitecture.ts";
import type { ProjectSpec } from "./generateSpec.ts";
import type { GenerateStarterCodeResult } from "./generateStarterCode.ts";
import type { GenerateStarterTestsResult } from "./generateTests.ts";
import type { RunGeneratedTestsResult } from "./runGeneratedTests.ts";
import type { ScaffoldProjectResult } from "./scaffoldProject.ts";

export interface GenerateValidationChecklistOptions {
  outputDir?: string;
}

export interface ValidationChecklistItem {
  label: string;
  status: "complete" | "action_required" | "skipped";
  detail: string;
}

export interface GenerateValidationChecklistResult {
  projectRoot: string;
  outputPath: string;
  checklist: string;
  items: ValidationChecklistItem[];
}

function describeRunStatus(result: RunGeneratedTestsResult): ValidationChecklistItem {
  switch (result.status) {
    case "passed":
      return {
        label: "Run generated tests",
        status: "complete",
        detail: `The generated Jest suite passed with \`${result.command}\`.`,
      };
    case "failed":
      return {
        label: "Run generated tests",
        status: "action_required",
        detail:
          result.reason ??
          `The generated Jest suite failed with exit code ${result.exitCode}.`,
      };
    case "skipped":
      return {
        label: "Run generated tests",
        status: "skipped",
        detail:
          result.reason ??
          "Generated test execution was skipped for this run.",
      };
  }
}

function createChecklistMarkdown(
  spec: ProjectSpec,
  architecture: ProjectArchitecture,
  scaffoldResult: ScaffoldProjectResult,
  starterCodeResult: GenerateStarterCodeResult,
  starterTestsResult: GenerateStarterTestsResult,
  runGeneratedTestsResult: RunGeneratedTestsResult,
  items: ValidationChecklistItem[],
): string {
  const resourcePath = architecture.apiPlan.resource.collectionPath;
  const authSummary = architecture.crossCuttingConcerns.authentication.required
    ? "Authentication is enabled for the generated resource routes."
    : "Authentication is not scaffolded for this starter.";
  const skippedFiles = [
    ...scaffoldResult.filesSkipped,
    ...starterCodeResult.filesSkipped,
    ...starterTestsResult.filesSkipped,
  ];
  const nextSteps = [
    runGeneratedTestsResult.status === "skipped"
      ? "Install generated project dependencies with `npm install`, then rerun `npm test` inside the generated project."
      : null,
    runGeneratedTestsResult.status === "failed"
      ? "Inspect the generated Jest failure output and fix the generated project before extending it."
      : null,
    `Review the generated architecture in \`architecture.json\` and confirm the planned collection path \`${resourcePath}\` matches the intended API shape.`,
    authSummary,
    ...spec.openQuestions.map((question) => question),
  ].filter(Boolean) as string[];

  return `# Validation Checklist

## Project Summary
- Prompt: ${spec.sourcePrompt}
- Project: ${spec.projectName}
- Stack: ${spec.stack.runtime}, ${spec.stack.language}, ${spec.stack.apiStyle}, ${spec.stack.testFramework}, ${architecture.stack.serverFramework}
- Resource collection path: \`${resourcePath}\`
- Authentication: ${architecture.crossCuttingConcerns.authentication.required ? "enabled" : "disabled"}

## Checklist
${items
  .map((item) => `- [${item.status === "complete" ? "x" : " "}] ${item.label}: ${item.detail}`)
  .join("\n")}

## Generated Output Summary
- Scaffold directories created: ${scaffoldResult.directoriesCreated.length}
- Scaffold files created: ${scaffoldResult.filesCreated.length}
- Starter code files written: ${starterCodeResult.filesWritten.length}
- Starter test files written: ${starterTestsResult.filesWritten.length}
- Skipped existing files: ${skippedFiles.length === 0 ? "none" : skippedFiles.join(", ")}

## Next Steps
${nextSteps.map((step) => `- ${step}`).join("\n")}
`;
}

export async function generateValidationChecklist(
  spec: ProjectSpec,
  architecture: ProjectArchitecture,
  scaffoldResult: ScaffoldProjectResult,
  starterCodeResult: GenerateStarterCodeResult,
  starterTestsResult: GenerateStarterTestsResult,
  runGeneratedTestsResult: RunGeneratedTestsResult,
  options: GenerateValidationChecklistOptions = {},
): Promise<GenerateValidationChecklistResult> {
  const projectRoot = options.outputDir ?? process.cwd();
  const outputPath = join(projectRoot, "validation-checklist.md");
  const items: ValidationChecklistItem[] = [
    {
      label: "Generate project spec",
      status: "complete",
      detail: "The structured spec was generated and written to `spec.json`.",
    },
    {
      label: "Generate architecture plan",
      status: "complete",
      detail:
        "The architecture plan was generated and written to `architecture.json`.",
    },
    {
      label: "Scaffold project files",
      status: "complete",
      detail: `Created ${scaffoldResult.directoriesCreated.length} directories and ${scaffoldResult.filesCreated.length} scaffold files.`,
    },
    {
      label: "Generate starter code",
      status:
        starterCodeResult.filesSkipped.length === 0
          ? "complete"
          : "action_required",
      detail:
        starterCodeResult.filesSkipped.length === 0
          ? `Wrote ${starterCodeResult.filesWritten.length} code/config files for the generated backend.`
          : `Wrote ${starterCodeResult.filesWritten.length} code/config files and skipped ${starterCodeResult.filesSkipped.length} existing files.`,
    },
    {
      label: "Generate starter tests",
      status:
        starterTestsResult.filesSkipped.length === 0
          ? "complete"
          : "action_required",
      detail:
        starterTestsResult.filesSkipped.length === 0
          ? `Wrote ${starterTestsResult.filesWritten.length} Jest test files for the generated backend.`
          : `Wrote ${starterTestsResult.filesWritten.length} Jest test files and skipped ${starterTestsResult.filesSkipped.length} existing files.`,
    },
    describeRunStatus(runGeneratedTestsResult),
  ];
  const checklist = createChecklistMarkdown(
    spec,
    architecture,
    scaffoldResult,
    starterCodeResult,
    starterTestsResult,
    runGeneratedTestsResult,
    items,
  );

  await mkdir(projectRoot, { recursive: true });
  await writeFile(outputPath, checklist, "utf8");

  return {
    projectRoot,
    outputPath,
    checklist,
    items,
  };
}
