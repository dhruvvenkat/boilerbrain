const DEFAULT_BASE_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-4o-mini";

export interface LlmClientConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  fetchImplementation?: typeof fetch;
}

export interface GenerateTextOptions {
  input: string;
  instructions?: string;
  model?: string;
  maxOutputTokens?: number;
}

export interface StructuredOutputSchema {
  name: string;
  schema: Record<string, unknown>;
  description?: string;
}

export interface GenerateStructuredOutputOptions extends GenerateTextOptions {
  schema: StructuredOutputSchema;
}

export interface LlmTextResponse {
  id: string;
  model: string;
  outputText: string;
  rawResponse: unknown;
}

interface ResponsesApiError {
  message?: string;
}

interface ResponsesApiContentItem {
  type?: string;
  text?: string;
  refusal?: string;
}

interface ResponsesApiOutputItem {
  type?: string;
  content?: ResponsesApiContentItem[];
}

interface ResponsesApiResponse {
  id?: string;
  model?: string;
  output_text?: string;
  output?: ResponsesApiOutputItem[];
  error?: ResponsesApiError;
}

interface ResponsesApiRequest {
  model: string;
  input: string;
  instructions?: string;
  max_output_tokens?: number;
  text?: {
    format: {
      type: "json_schema";
      name: string;
      description?: string;
      strict: true;
      schema: Record<string, unknown>;
    };
  };
}

function readConfiguredValue(value: string | undefined): string | undefined {
  const normalizedValue = value?.trim();

  if (!normalizedValue) {
    return undefined;
  }

  return normalizedValue;
}

function resolveApiKey(config: LlmClientConfig): string | undefined {
  return (
    readConfiguredValue(config.apiKey) ??
    readConfiguredValue(process.env.OPENAI_API_KEY)
  );
}

function resolveModel(config: LlmClientConfig): string {
  return (
    readConfiguredValue(config.model) ??
    readConfiguredValue(process.env.OPENAI_MODEL) ??
    DEFAULT_MODEL
  );
}

function resolveBaseUrl(config: LlmClientConfig): string {
  return (
    readConfiguredValue(config.baseUrl) ??
    readConfiguredValue(process.env.OPENAI_BASE_URL) ??
    DEFAULT_BASE_URL
  );
}

function validatePromptInput(input: string): string {
  const normalizedInput = input.trim();

  if (!normalizedInput) {
    throw new Error("LLM input is required.");
  }

  return normalizedInput;
}

function parseJsonResponse(payload: string): ResponsesApiResponse {
  try {
    return JSON.parse(payload) as ResponsesApiResponse;
  } catch {
    throw new Error("OpenAI API returned invalid JSON.");
  }
}

function extractRefusal(response: ResponsesApiResponse): string | null {
  for (const outputItem of response.output ?? []) {
    for (const contentItem of outputItem.content ?? []) {
      if (contentItem.type === "refusal" && contentItem.refusal) {
        return contentItem.refusal;
      }
    }
  }

  return null;
}

function extractOutputText(response: ResponsesApiResponse): string {
  if (response.output_text?.trim()) {
    return response.output_text.trim();
  }

  const textChunks: string[] = [];

  for (const outputItem of response.output ?? []) {
    for (const contentItem of outputItem.content ?? []) {
      if (contentItem.type === "output_text" && contentItem.text) {
        textChunks.push(contentItem.text);
      }
    }
  }

  const outputText = textChunks.join("").trim();

  if (outputText) {
    return outputText;
  }

  const refusal = extractRefusal(response);

  if (refusal) {
    throw new Error(`Model refused request: ${refusal}`);
  }

  throw new Error("OpenAI response did not include output text.");
}

export function hasLlmApiKey(config: Pick<LlmClientConfig, "apiKey"> = {}): boolean {
  return Boolean(resolveApiKey(config));
}

export class OpenAiLlmClient {
  private readonly config: LlmClientConfig;

  constructor(config: LlmClientConfig = {}) {
    this.config = config;
  }

  async generateText(options: GenerateTextOptions): Promise<LlmTextResponse> {
    const model = readConfiguredValue(options.model) ?? resolveModel(this.config);
    const input = validatePromptInput(options.input);
    const requestBody: ResponsesApiRequest = {
      model,
      input,
    };

    if (options.instructions?.trim()) {
      requestBody.instructions = options.instructions.trim();
    }

    if (typeof options.maxOutputTokens === "number") {
      requestBody.max_output_tokens = options.maxOutputTokens;
    }

    return this.createResponse(requestBody, model);
  }

  async generateStructuredOutput<T>(
    options: GenerateStructuredOutputOptions,
  ): Promise<T> {
    const model = readConfiguredValue(options.model) ?? resolveModel(this.config);
    const input = validatePromptInput(options.input);
    const requestBody: ResponsesApiRequest = {
      model,
      input,
      text: {
        format: {
          type: "json_schema",
          name: options.schema.name,
          description: options.schema.description,
          strict: true,
          schema: options.schema.schema,
        },
      },
    };

    if (options.instructions?.trim()) {
      requestBody.instructions = options.instructions.trim();
    }

    if (typeof options.maxOutputTokens === "number") {
      requestBody.max_output_tokens = options.maxOutputTokens;
    }

    const response = await this.createResponse(requestBody, model);

    try {
      return JSON.parse(response.outputText) as T;
    } catch {
      throw new Error("Structured output was not valid JSON.");
    }
  }

  private async createResponse(
    requestBody: ResponsesApiRequest,
    model: string,
  ): Promise<LlmTextResponse> {
    const apiKey = resolveApiKey(this.config);

    if (!apiKey) {
      throw new Error(
        "OPENAI_API_KEY is not set. Add it to your environment before calling the LLM client.",
      );
    }

    const fetchImplementation = this.config.fetchImplementation ?? fetch;
    const response = await fetchImplementation(resolveBaseUrl(this.config), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const responseText = await response.text();
    const payload = parseJsonResponse(responseText);

    if (!response.ok) {
      const message = payload.error?.message ?? `OpenAI API request failed with status ${response.status}.`;

      throw new Error(message);
    }

    return {
      id: payload.id ?? "",
      model: payload.model ?? model,
      outputText: extractOutputText(payload),
      rawResponse: payload,
    };
  }
}

export function createLlmClient(config: LlmClientConfig = {}): OpenAiLlmClient {
  return new OpenAiLlmClient(config);
}
