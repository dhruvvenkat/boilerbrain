import type {
  PipelineStageKey,
  PipelineStageStatus,
  PipelineStageUpdate,
} from "../pipeline/runPipeline.ts";

export interface TuiStageView {
  key: PipelineStageKey;
  label: string;
  status: PipelineStageStatus;
  output: string;
}

const STAGE_DEFINITIONS: Array<{
  key: PipelineStageKey;
  label: string;
}> = [
  { key: "parsePrompt", label: "Parse Prompt" },
  { key: "generateSpec", label: "Generate Spec" },
  { key: "generateArchitecture", label: "Generate Architecture" },
  { key: "scaffoldProject", label: "Scaffold Project" },
  { key: "generateStarterCode", label: "Generate Starter Code" },
  { key: "generateStarterTests", label: "Generate Starter Tests" },
  { key: "runGeneratedTests", label: "Run Generated Tests" },
  { key: "validationChecklist", label: "Validation Checklist" },
];

export function createInitialStageViews(): TuiStageView[] {
  return STAGE_DEFINITIONS.map((stage) => ({
    key: stage.key,
    label: stage.label,
    status: "pending",
    output: "",
  }));
}

export function applyStageUpdate(
  stages: TuiStageView[],
  update: PipelineStageUpdate,
): TuiStageView[] {
  return stages.map((stage) => {
    if (stage.key !== update.key) {
      return stage;
    }

    return {
      ...stage,
      label: update.label,
      status: update.status,
      output: update.output ?? stage.output,
    };
  });
}

export function clampStageIndex(index: number, stages: TuiStageView[]): number {
  if (stages.length === 0) {
    return 0;
  }

  if (index < 0) {
    return 0;
  }

  if (index >= stages.length) {
    return stages.length - 1;
  }

  return index;
}

export function getStageStatusSymbol(status: PipelineStageStatus): string {
  switch (status) {
    case "pending":
      return " ";
    case "running":
      return ">";
    case "completed":
      return "x";
    case "failed":
      return "!";
  }
}

export function buildNextStepCommands(outputDir: string): string[] {
  return [
    `cd ${outputDir}`,
    "npm install",
    "npm test",
    "npm run build",
    "PORT=3001 npm start",
  ];
}
