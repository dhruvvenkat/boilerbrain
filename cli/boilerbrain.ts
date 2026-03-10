#!/usr/bin/env node

import { Command } from "commander";
import {
  type PipelineRunResult,
  runPipeline,
} from "../src/pipeline/runPipeline";

function formatStageResults(result: PipelineRunResult): string {
  return result.stages
    .map((stage, index) => {
      return `[${index + 1}/${result.stages.length}] ${stage.label}\n${stage.output}`;
    })
    .join("\n\n");
}

async function main(): Promise<void> {
  const program = new Command();

  program
    .name("boilerbrain")
    .description(
      "Generate backend starter boilerplate from a natural-language prompt.",
    )
    .argument("<prompt...>", "Natural-language project prompt")
    .action(async (promptParts: string[]) => {
      const prompt = promptParts.join(" ").trim();

      if (!prompt) {
        console.error("A natural-language prompt is required.");
        process.exitCode = 1;
        return;
      }

      try {
        const result = await runPipeline(prompt);

        console.log(`Prompt: ${result.prompt}`);
        console.log("");
        console.log(formatStageResults(result));
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Pipeline failed.";

        console.error(message);
        process.exitCode = 1;
      }
    });

  await program.parseAsync(process.argv);
}

void main();
