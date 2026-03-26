#!/usr/bin/env node

import { cwd } from "node:process";

import {
  type PipelineRunResult,
  runPipeline,
} from "../src/pipeline/runPipeline.ts";

export interface ParsedCliArgs {
  prompt: string;
  outputDir?: string;
  plain: boolean;
  showHelp: boolean;
}

export interface BoilerbrainCliDependencies {
  runPipeline?: typeof runPipeline;
  runBoilerbrainTui?: (options: {
    prompt?: string;
    outputDir?: string;
  }) => Promise<void>;
  stdout?: Pick<Console, "log">;
  stderr?: Pick<Console, "error">;
  getCurrentWorkingDirectory?: () => string;
}

const USAGE = `Usage:
  boilerbrain "<project prompt>"
  boilerbrain --out ./generated "<project prompt>"
  boilerbrain --plain "<project prompt>"

Development:
  npm run tui -- "<project prompt>"
  npm run pipeline -- "<project prompt>"
  npm run pipeline -- --out ./generated "<project prompt>"

Options:
  -o, --out, --output-dir <path>  Directory to write the generated project into
  --plain                         Run the legacy stage-printing CLI instead of the TUI
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
  let plain = false;
  let showHelp = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "-h" || argument === "--help") {
      showHelp = true;
      continue;
    }

    if (argument === "--plain") {
      plain = true;
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
    plain,
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

function printUsage(stream: Pick<Console, "log" | "error">, method: "log" | "error"): void {
  stream[method](USAGE);
}

async function loadRunBoilerbrainTui(
  dependencies: BoilerbrainCliDependencies,
): Promise<(options: { prompt?: string; outputDir?: string }) => Promise<void>> {
  if (dependencies.runBoilerbrainTui) {
    return dependencies.runBoilerbrainTui;
  }

  const module = await import("../src/tui/runBoilerbrainTui.ts");

  if (typeof module.runBoilerbrainTui !== "function") {
    throw new Error(
      "The TUI module does not export runBoilerbrainTui().",
    );
  }

  return module.runBoilerbrainTui;
}

export async function runBoilerbrainCli(
  argv: string[] = process.argv.slice(2),
  dependencies: BoilerbrainCliDependencies = {},
): Promise<void> {
  const parsedArgs = parseCliArgs(argv);
  const stdout = dependencies.stdout ?? console;
  const stderr = dependencies.stderr ?? console;
  const getCurrentWorkingDirectory =
    dependencies.getCurrentWorkingDirectory ?? cwd;

  if (parsedArgs.showHelp) {
    printUsage(stdout, "log");
    return;
  }

  const outputDir = parsedArgs.outputDir ?? getCurrentWorkingDirectory();

  if (parsedArgs.plain && !parsedArgs.prompt) {
    stderr.error("A natural-language prompt is required for plain mode.");
    stderr.error("");
    printUsage(stderr, "error");
    process.exitCode = 1;
    return;
  }

  if (!parsedArgs.plain) {
    const runBoilerbrainTui = await loadRunBoilerbrainTui(dependencies);

    await runBoilerbrainTui({
      prompt: parsedArgs.prompt || undefined,
      outputDir,
    });
    return;
  }

  try {
    const runPipelineImpl = dependencies.runPipeline ?? runPipeline;
    const result = await runPipelineImpl(parsedArgs.prompt, {
      outputDir,
    });

    stdout.log(`Prompt: ${result.prompt}`);
    stdout.log(`Output directory: ${outputDir}`);
    stdout.log("");
    stdout.log(formatStageResults(result));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pipeline failed.";

    stderr.error(message);
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  void runBoilerbrainCli();
}
