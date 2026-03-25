#!/usr/bin/env node

import { cwd } from "node:process";

import {
  type PipelineRunResult,
  runPipeline,
} from "../src/pipeline/runPipeline.ts";

export interface ParsedCliArgs {
  prompt: string;
  outputDir?: string;
  showHelp: boolean;
}

const USAGE = `Usage:
  npm run pipeline -- "<project prompt>"
  npm run pipeline -- --out ./generated "<project prompt>"

Options:
  -o, --out, --output-dir <path>  Directory to write the generated project into
  -h, --help                      Show this help message
`;

function isOutputFlag(value: string): boolean {
  return value === "-o" || value === "--out" || value === "--output-dir";
}

function readInlineOutputDir(value: string): string | undefined {
  if (value.startsWith("--out=")) {
    return value.slice("--out=".length);
  }

  if (value.startsWith("--output-dir=")) {
    return value.slice("--output-dir=".length);
  }

  return undefined;
}

export function parseCliArgs(argv: string[]): ParsedCliArgs {
  const promptParts: string[] = [];
  let outputDir: string | undefined;
  let showHelp = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "-h" || argument === "--help") {
      showHelp = true;
      continue;
    }

    if (isOutputFlag(argument)) {
      const nextValue = argv[index + 1];

      if (!nextValue || nextValue.startsWith("-")) {
        throw new Error(`Missing value for ${argument}.`);
      }

      outputDir = nextValue;
      index += 1;
      continue;
    }

    const inlineOutputDir = readInlineOutputDir(argument);

    if (inlineOutputDir !== undefined) {
      if (!inlineOutputDir.trim()) {
        throw new Error("Missing value for --out.");
      }

      outputDir = inlineOutputDir;
      continue;
    }

    promptParts.push(argument);
  }

  return {
    prompt: promptParts.join(" ").trim(),
    outputDir: outputDir?.trim(),
    showHelp,
  };
}

export function formatStageResults(result: PipelineRunResult): string {
  return result.stages
    .map((stage, index) => {
      return `[${index + 1}/${result.stages.length}] ${stage.label}\n${stage.output}`;
    })
    .join("\n\n");
}

function printUsage(stream: Pick<typeof console, "log" | "error">, method: "log" | "error"): void {
  stream[method](USAGE);
}

async function main(): Promise<void> {
  let parsedArgs: ParsedCliArgs;

  try {
    parsedArgs = parseCliArgs(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid CLI arguments.";
    console.error(message);
    console.error("");
    printUsage(console, "error");
    process.exitCode = 1;
    return;
  }

  if (parsedArgs.showHelp) {
    printUsage(console, "log");
    return;
  }

  if (!parsedArgs.prompt) {
    console.error("A natural-language prompt is required.");
    console.error("");
    printUsage(console, "error");
    process.exitCode = 1;
    return;
  }

  const outputDir = parsedArgs.outputDir ?? cwd();

  try {
    const result = await runPipeline(parsedArgs.prompt, {
      outputDir,
    });

    console.log(`Prompt: ${result.prompt}`);
    console.log(`Output directory: ${outputDir}`);
    console.log("");
    console.log(formatStageResults(result));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pipeline failed.";

    console.error(message);
    process.exitCode = 1;
  }
}

void main();
