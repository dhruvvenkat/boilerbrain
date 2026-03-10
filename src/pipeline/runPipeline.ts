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

interface PipelineStageDefinition {
  key: PipelineStageKey;
  label: string;
  output: (prompt: string) => string;
}

function validatePrompt(prompt: string): string {
  const normalizedPrompt = prompt.trim();

  if (!normalizedPrompt) {
    throw new Error("A natural-language prompt is required.");
  }

  return normalizedPrompt;
}

const pipelineStages: PipelineStageDefinition[] = [
  {
    key: "parsePrompt",
    label: "Parse Prompt",
    output: (prompt) => `Accepted prompt: "${prompt}"`,
  },
  {
    key: "generateSpec",
    label: "Generate Spec",
    output: (prompt) =>
      `Placeholder spec created for "${prompt}". AI generation is not implemented yet.`,
  },
  {
    key: "generateArchitecture",
    label: "Generate Architecture",
    output: (prompt) =>
      `Placeholder architecture plan created for "${prompt}".`,
  },
  {
    key: "scaffoldProject",
    label: "Scaffold Project",
    output: () =>
      "Placeholder scaffold step completed. No files were generated in this stub.",
  },
  {
    key: "generateStarterCode",
    label: "Generate Starter Code",
    output: () =>
      "Placeholder starter code step completed. No code was generated in this stub.",
  },
  {
    key: "generateStarterTests",
    label: "Generate Starter Tests",
    output: () =>
      "Placeholder test generation step completed. No tests were generated in this stub.",
  },
  {
    key: "validationChecklist",
    label: "Validation Checklist",
    output: () =>
      "Placeholder checklist: review prompt, spec, architecture, scaffold, code, and tests.",
  },
];

export async function runPipeline(prompt: string): Promise<PipelineRunResult> {
  const validatedPrompt = validatePrompt(prompt);

  const stages = pipelineStages.map((stage) => {
    return {
      key: stage.key,
      label: stage.label,
      output: stage.output(validatedPrompt),
    };
  });

  return {
    prompt: validatedPrompt,
    stages,
  };
}
