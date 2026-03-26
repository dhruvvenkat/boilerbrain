import React, {
  type ReactNode,
  createElement,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { Box, Text, useApp, useInput } from "ink";

import type {
  PipelineRunResult,
  PipelineStageUpdate,
  runPipeline,
} from "../pipeline/runPipeline.ts";
import {
  applyStageUpdate,
  buildNextStepCommands,
  clampStageIndex,
  createInitialStageViews,
  getStageStatusSymbol,
  type TuiStageView,
} from "./helpers.ts";

type Screen = "prompt" | "run" | "review";
type PromptField = "prompt" | "outputDir" | "run";
type RunPipelineFn = typeof runPipeline;

export interface BoilerbrainTuiAppProps {
  initialPrompt?: string;
  initialOutputDir: string;
  runPipelineFn: RunPipelineFn;
  onPipelineError?: (error: Error) => void;
}

const h = createElement;

function renderBox(
  title: string,
  value: string,
  active: boolean,
  placeholder: string,
): ReactNode {
  const displayValue = value.length > 0 ? value : placeholder;

  return h(
    Box,
    {
      borderStyle: "round",
      borderColor: active ? "cyan" : "gray",
      flexDirection: "column",
      paddingX: 1,
      paddingY: 0,
      marginBottom: 1,
    },
    h(Text, { color: active ? "cyan" : "gray" }, title),
    h(Text, { dimColor: value.length === 0 }, displayValue),
  );
}

function renderPromptScreen(
  prompt: string,
  outputDir: string,
  activeField: PromptField,
): ReactNode {
  return h(
    Box,
    { flexDirection: "column" },
    h(Text, { bold: true, color: "cyanBright" }, "BoilerBrain"),
    h(
      Text,
      { color: "gray" },
      "Tab switches fields. Enter adds a new line in the prompt. Select Run and press Enter to start. Press q to quit.",
    ),
    h(Box, { height: 1 }),
    renderBox(
      "Project Prompt",
      prompt,
      activeField === "prompt",
      "Describe the backend project you want BoilerBrain to generate.",
    ),
    renderBox(
      "Output Directory",
      outputDir,
      activeField === "outputDir",
      "./generated-project",
    ),
    h(
      Box,
      {
        borderStyle: "round",
        borderColor: activeField === "run" ? "green" : "gray",
        paddingX: 1,
      },
      h(
        Text,
        { color: activeField === "run" ? "green" : undefined },
        "[ Run Pipeline ]",
      ),
    ),
  );
}

function renderStageList(stages: TuiStageView[], selectedIndex: number): ReactNode {
  return h(
    Box,
    { flexDirection: "column" },
    ...stages.map((stage, index) =>
      h(
        Text,
        {
          key: stage.key,
          color:
            stage.status === "failed"
              ? "red"
              : stage.status === "completed"
                ? "green"
                : stage.status === "running"
                  ? "yellow"
                  : undefined,
          inverse: index === selectedIndex,
        },
        `${index === selectedIndex ? ">" : " "} [${getStageStatusSymbol(stage.status)}] ${stage.label}`,
      ),
    ),
  );
}

function renderRunScreen(
  stages: TuiStageView[],
  selectedIndex: number,
  errorMessage: string | null,
): ReactNode {
  const selectedStage = stages[clampStageIndex(selectedIndex, stages)];
  const detailOutput =
    selectedStage?.output ||
    (selectedStage?.status === "failed"
      ? "This stage failed before producing final output."
      : "Waiting for stage output.");

  return h(
    Box,
    { flexDirection: "column" },
    h(Text, { bold: true, color: "cyanBright" }, "Pipeline Run"),
    h(
      Text,
      { color: "gray" },
      "Use up/down or j/k to move between stages. Press q to quit.",
    ),
    errorMessage ? h(Text, { color: "red" }, errorMessage) : null,
    h(Box, { height: 1 }),
    h(
      Box,
      { flexDirection: "row" },
      h(
        Box,
        {
          width: 34,
          borderStyle: "round",
          borderColor: "cyan",
          paddingX: 1,
          marginRight: 1,
          flexDirection: "column",
        },
        h(Text, { bold: true }, "Stages"),
        renderStageList(stages, selectedIndex),
      ),
      h(
        Box,
        {
          flexGrow: 1,
          borderStyle: "round",
          borderColor: "magenta",
          paddingX: 1,
          flexDirection: "column",
        },
        h(Text, { bold: true }, selectedStage?.label ?? "Stage Details"),
        h(Box, { height: 1 }),
        h(Text, null, detailOutput),
      ),
    ),
  );
}

function renderReviewScreen(result: PipelineRunResult, outputDir: string): ReactNode {
  const runGeneratedTestsStage = result.stages.find(
    (stage) => stage.key === "runGeneratedTests",
  );
  const validationChecklistStage = result.stages.find(
    (stage) => stage.key === "validationChecklist",
  );

  return h(
    Box,
    { flexDirection: "column" },
    h(Text, { bold: true, color: "greenBright" }, "Run Complete"),
    h(Text, null, `Prompt: ${result.prompt}`),
    h(Text, null, `Output directory: ${outputDir}`),
    h(Box, { height: 1 }),
    h(Text, { bold: true }, "Generated Artifacts"),
    h(Text, null, `- ${outputDir}/spec.json`),
    h(Text, null, `- ${outputDir}/architecture.json`),
    h(Text, null, `- ${outputDir}/validation-checklist.md`),
    h(Box, { height: 1 }),
    h(Text, { bold: true }, "Generated Test Run"),
    h(Text, null, runGeneratedTestsStage?.output ?? "No generated test result."),
    h(Box, { height: 1 }),
    h(Text, { bold: true }, "Validation Checklist"),
    h(
      Text,
      null,
      validationChecklistStage?.output ?? "No validation checklist output.",
    ),
    h(Box, { height: 1 }),
    h(Text, { bold: true }, "Next Commands"),
    ...buildNextStepCommands(outputDir).map((command) =>
      h(Text, { key: command }, `- ${command}`),
    ),
    h(Box, { height: 1 }),
    h(Text, { color: "gray" }, "Press q to quit."),
  );
}

function cyclePromptField(field: PromptField): PromptField {
  switch (field) {
    case "prompt":
      return "outputDir";
    case "outputDir":
      return "run";
    case "run":
      return "prompt";
  }
}

function trimTrailingCharacter(value: string): string {
  return value.slice(0, -1);
}

export function BoilerbrainTuiApp(props: BoilerbrainTuiAppProps): ReactNode {
  const { exit } = useApp();
  const [screen, setScreen] = useState<Screen>(
    props.initialPrompt ? "run" : "prompt",
  );
  const [prompt, setPrompt] = useState(props.initialPrompt ?? "");
  const [outputDir, setOutputDir] = useState(props.initialOutputDir);
  const [activeField, setActiveField] = useState<PromptField>(
    props.initialPrompt ? "run" : "prompt",
  );
  const [stages, setStages] = useState<TuiStageView[]>(createInitialStageViews);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [result, setResult] = useState<PipelineRunResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const hasStartedInitialRun = useRef(false);

  const startRun = useEffectEvent(async () => {
    const trimmedPrompt = prompt.trim();

    if (!trimmedPrompt) {
      setErrorMessage("A natural-language prompt is required.");
      return;
    }

    setStages(createInitialStageViews());
    setSelectedIndex(0);
    setErrorMessage(null);
    setResult(null);
    setIsRunning(true);
    setScreen("run");

    try {
      const pipelineResult = await props.runPipelineFn(trimmedPrompt, {
        outputDir,
        onStageUpdate: (update: PipelineStageUpdate) => {
          setStages((currentStages) => applyStageUpdate(currentStages, update));

          const updatedIndex = createInitialStageViews().findIndex(
            (stage) => stage.key === update.key,
          );

          if (updatedIndex >= 0) {
            setSelectedIndex(updatedIndex);
          }
        },
      });

      setResult(pipelineResult);
      setScreen("review");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Pipeline execution failed.";
      setErrorMessage(message);

      if (error instanceof Error) {
        props.onPipelineError?.(error);
      } else {
        props.onPipelineError?.(new Error("Pipeline execution failed."));
      }
    } finally {
      setIsRunning(false);
    }
  });

  useEffect(() => {
    if (!props.initialPrompt || hasStartedInitialRun.current) {
      return;
    }

    hasStartedInitialRun.current = true;
    void startRun();
  }, [props.initialPrompt, startRun]);

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      exit();
      return;
    }

    if (input === "q") {
      exit();
      return;
    }

    if (screen === "run") {
      if (key.upArrow || input === "k") {
        setSelectedIndex((currentIndex) =>
          clampStageIndex(currentIndex - 1, stages),
        );
      }

      if (key.downArrow || input === "j") {
        setSelectedIndex((currentIndex) =>
          clampStageIndex(currentIndex + 1, stages),
        );
      }

      return;
    }

    if (screen === "review") {
      return;
    }

    if (key.tab) {
      setActiveField((currentField) => cyclePromptField(currentField));
      return;
    }

    if (activeField === "run" && key.return) {
      void startRun();
      return;
    }

    if (key.backspace || key.delete) {
      if (activeField === "prompt") {
        setPrompt((currentPrompt) => trimTrailingCharacter(currentPrompt));
      } else if (activeField === "outputDir") {
        setOutputDir((currentOutputDir) =>
          trimTrailingCharacter(currentOutputDir),
        );
      }

      return;
    }

    if (key.return) {
      if (activeField === "prompt") {
        setPrompt((currentPrompt) => `${currentPrompt}\n`);
      } else if (activeField === "outputDir") {
        setActiveField("run");
      }

      return;
    }

    if (key.ctrl || key.meta || input.length === 0) {
      return;
    }

    if (activeField === "prompt") {
      setPrompt((currentPrompt) => `${currentPrompt}${input}`);
    } else if (activeField === "outputDir") {
      setOutputDir((currentOutputDir) => `${currentOutputDir}${input}`);
    }
  });

  if (screen === "prompt") {
    return renderPromptScreen(prompt, outputDir, activeField);
  }

  if (screen === "review" && result) {
    return renderReviewScreen(result, outputDir);
  }

  return renderRunScreen(stages, selectedIndex, isRunning ? null : errorMessage);
}
