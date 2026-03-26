import React, { createElement } from "react";
import { render } from "ink";

import { runPipeline, type RunPipelineOptions } from "../pipeline/runPipeline.ts";
import { BoilerbrainTuiApp } from "./app.ts";

export interface RunBoilerbrainTuiOptions {
  prompt?: string;
  outputDir?: string;
  runPipeline?: (
    prompt: string,
    options?: RunPipelineOptions,
  ) => ReturnType<typeof runPipeline>;
}

export async function runBoilerbrainTui(
  options: RunBoilerbrainTuiOptions = {},
): Promise<void> {
  let pipelineError: Error | null = null;
  const app = render(
    createElement(BoilerbrainTuiApp, {
      initialPrompt: options.prompt,
      initialOutputDir: options.outputDir ?? process.cwd(),
      runPipelineFn: options.runPipeline ?? runPipeline,
      onPipelineError: (error: Error) => {
        pipelineError = error;
      },
    }),
  );

  await app.waitUntilExit();

  if (pipelineError) {
    throw pipelineError;
  }
}
