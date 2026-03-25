import assert from "node:assert/strict";
import test from "node:test";

import {
  createLlmClient,
  hasLlmApiKey,
} from "./llmClient.ts";

interface MockFetchResult {
  url: string;
  init?: RequestInit;
}

function createMockFetch(
  payload: unknown,
  status = 200,
  state?: { lastCall?: MockFetchResult },
): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    if (state) {
      state.lastCall = {
        url: typeof url === "string" ? url : url.toString(),
        init,
      };
    }

    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(payload),
    } as Response;
  }) as typeof fetch;
}

test("hasLlmApiKey reports whether an API key is configured", () => {
  assert.equal(hasLlmApiKey({ apiKey: "test-key" }), true);
  assert.equal(hasLlmApiKey({ apiKey: "   " }), false);
});

test("generateText posts a Responses API request and returns output_text", async () => {
  const requestState: { lastCall?: MockFetchResult } = {};
  const client = createLlmClient({
    apiKey: "test-key",
    model: "gpt-4o-mini",
    baseUrl: "https://example.com/responses",
    fetchImplementation: createMockFetch(
      {
        id: "resp_123",
        model: "gpt-4o-mini",
        output_text: "spec text",
      },
      200,
      requestState,
    ),
  });

  const response = await client.generateText({
    input: "build a todo API",
    instructions: "Return concise output.",
    maxOutputTokens: 300,
  });

  assert.equal(response.outputText, "spec text");
  assert.equal(requestState.lastCall?.url, "https://example.com/responses");
  assert.equal(
    requestState.lastCall?.init?.headers &&
      (requestState.lastCall.init.headers as Record<string, string>).Authorization,
    "Bearer test-key",
  );

  const requestBody = JSON.parse(String(requestState.lastCall?.init?.body));

  assert.equal(requestBody.model, "gpt-4o-mini");
  assert.equal(requestBody.input, "build a todo API");
  assert.equal(requestBody.instructions, "Return concise output.");
  assert.equal(requestBody.max_output_tokens, 300);
});

test("generateStructuredOutput parses JSON returned by the model", async () => {
  const client = createLlmClient({
    apiKey: "test-key",
    fetchImplementation: createMockFetch({
      id: "resp_456",
      model: "gpt-4o-mini",
      output_text: JSON.stringify({
        projectName: "todo-api",
        authenticationRequired: true,
      }),
    }),
  });

  const result = await client.generateStructuredOutput<{
    projectName: string;
    authenticationRequired: boolean;
  }>({
    input: "build a todo API with authentication",
    schema: {
      name: "project_spec",
      schema: {
        type: "object",
        properties: {
          projectName: { type: "string" },
          authenticationRequired: { type: "boolean" },
        },
        required: ["projectName", "authenticationRequired"],
        additionalProperties: false,
      },
    },
  });

  assert.deepEqual(result, {
    projectName: "todo-api",
    authenticationRequired: true,
  });
});

test("generateText fails clearly when no API key is configured", async () => {
  const client = createLlmClient({
    apiKey: "",
    fetchImplementation: createMockFetch({
      id: "resp_789",
      model: "gpt-4o-mini",
      output_text: "unused",
    }),
  });

  await assert.rejects(() => client.generateText({ input: "build a todo API" }), {
    message:
      "OPENAI_API_KEY is not set. Add it to your environment before calling the LLM client.",
  });
});
