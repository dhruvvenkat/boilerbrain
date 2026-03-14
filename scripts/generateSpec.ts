import { generateSpec } from "../src/stages/generateSpec.ts";

function getPromptFromArgs(argv: string[]): string {
  return argv.join(" ").trim();
}

async function main(): Promise<void> {
  const prompt = getPromptFromArgs(process.argv.slice(2));

  if (!prompt) {
    console.error('Usage: npm run spec -- "<project prompt>"');
    process.exitCode = 1;
    return;
  }

  try {
    const result = await generateSpec(prompt);

    console.log(`Created spec at ${result.outputPath}`);
    console.log("");
    console.log(JSON.stringify(result.spec, null, 2));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Spec generation failed.";

    console.error(message);
    process.exitCode = 1;
  }
}

void main();
