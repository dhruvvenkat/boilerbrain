import { request } from "node:http";
import type { AddressInfo } from "node:net";

import { createApp } from "../src/app";

interface JsonResponse {
  statusCode: number;
  body: unknown;
}

async function startTestServer(): Promise<{
  server: ReturnType<typeof createApp>;
  baseUrl: string;
}> {
  const server = createApp();

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Expected the test server to bind to an ephemeral port.");
  }

  return {
    server,
    baseUrl: `http://127.0.0.1:${(address as AddressInfo).port}`,
  };
}

async function stopTestServer(server: ReturnType<typeof createApp>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function requestJson(
  baseUrl: string,
  path: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: Record<string, unknown>;
  } = {},
): Promise<JsonResponse> {
  const url = new URL(path, baseUrl);
  const requestBody = options.body ? JSON.stringify(options.body) : undefined;

  return await new Promise<JsonResponse>((resolve, reject) => {
    const clientRequest = request(
      url,
      {
        method: options.method ?? "GET",
        headers: {
          ...(requestBody
            ? {
                "Content-Type": "application/json",
              }
            : {}),
          ...(options.headers ?? {}),
        },
      },
      (response) => {
        let rawBody = "";

        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          rawBody += chunk;
        });
        response.on("end", () => {
          resolve({
            statusCode: response.statusCode ?? 0,
            body: rawBody ? JSON.parse(rawBody) : null,
          });
        });
      },
    );

    clientRequest.on("error", reject);

    if (requestBody) {
      clientRequest.write(requestBody);
    }

    clientRequest.end();
  });
}

describe("health route", () => {
  let server: ReturnType<typeof createApp>;
  let baseUrl: string;

  beforeEach(async () => {
    ({ server, baseUrl } = await startTestServer());
  });

  afterEach(async () => {
    await stopTestServer(server);
  });

  test("GET /health returns a healthy JSON payload", async () => {
    const response = await requestJson(baseUrl, "/health");

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      status: "ok",
    });
  });
});
