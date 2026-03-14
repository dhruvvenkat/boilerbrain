import { generateSpec } from "../stages/generateSpec.ts";

export type PipelineStageKey =
  | "parsePrompt"
  | "generateSpec"
  | "generateArchitecture"
  | "scaffoldProject"
  | "generateStarterCode"
  | "generateStarterTests"
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

  stages.push(
    {
      key: "generateArchitecture",
      label: "Generate Architecture",
      output: `Placeholder architecture plan created for "${validatedPrompt}".`,
    },
    {
      key: "scaffoldProject",
      label: "Scaffold Project",
      output:
        "Placeholder scaffold step completed. No files were generated in this stub.",
    },
    {
      key: "generateStarterCode",
      label: "Generate Starter Code",
      output:
        "Placeholder starter code step completed. No code was generated in this stub.",
    },
    {
      key: "generateStarterTests",
      label: "Generate Starter Tests",
      output:
        "Placeholder test generation step completed. No tests were generated in this stub.",
    },
    {
      key: "validationChecklist",
      label: "Validation Checklist",
      output:
        "Placeholder checklist: review prompt, spec, architecture, scaffold, code, and tests.",
    },
  );

  return {
    prompt: validatedPrompt,
    stages,
  };
}
