import { NoteTakingService } from "../src/services/noteTakingService";

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

const COLLECTION_PATH = "/note-takings";
const DEFAULT_HEADERS = {} as Record<string, string>;

describe("NoteTakingService", () => {
  let service: NoteTakingService;

  beforeEach(() => {
    service = new NoteTakingService();
  });

  test("list starts empty", () => {
    expect(service.list()).toEqual([]);
  });

  test("create assigns an id and stores the record", () => {
    const createdRecord = service.create({
      title: "first record",
    });

    expect(createdRecord.id).toEqual(expect.any(String));
    expect(service.getById(createdRecord.id)).toEqual(createdRecord);
  });

  test("update mutates an existing record without changing its id", () => {
    const createdRecord = service.create({
      title: "before update",
    });

    const updatedRecord = service.update(createdRecord.id, {
      title: "after update",
    });

    expect(updatedRecord).toEqual({
      ...createdRecord,
      title: "after update",
    });
  });

  test("delete returns true for existing records and false once removed", () => {
    const createdRecord = service.create({
      title: "to delete",
    });

    expect(service.delete(createdRecord.id)).toBe(true);
    expect(service.delete(createdRecord.id)).toBe(false);
  });
});

describe(`HTTP routes for ${COLLECTION_PATH}`, () => {
  let server: ReturnType<typeof createApp>;
  let baseUrl: string;

  beforeEach(async () => {
    ({ server, baseUrl } = await startTestServer());
  });

  afterEach(async () => {
    await stopTestServer(server);
  });

  test("GET collection returns 200 and an items array", async () => {
    const response = await requestJson(baseUrl, COLLECTION_PATH, {
      headers: DEFAULT_HEADERS,
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      items: [],
    });
  });

  test("POST collection creates a record and GET item returns it", async () => {
    const createResponse = await requestJson(baseUrl, COLLECTION_PATH, {
      method: "POST",
      headers: DEFAULT_HEADERS,
      body: {
        title: "created through HTTP",
      },
    });

    expect(createResponse.statusCode).toBe(201);

    const createdItem = (createResponse.body as { item: { id: string } }).item;
    const fetchResponse = await requestJson(
      baseUrl,
      `${COLLECTION_PATH}/${createdItem.id}`,
      {
        headers: DEFAULT_HEADERS,
      },
    );

    expect(fetchResponse.statusCode).toBe(200);
    expect(fetchResponse.body).toEqual({
      item: expect.objectContaining({
        id: createdItem.id,
        title: "created through HTTP",
      }),
    });
  });

  test("PUT item updates an existing record", async () => {
    const createResponse = await requestJson(baseUrl, COLLECTION_PATH, {
      method: "POST",
      headers: DEFAULT_HEADERS,
      body: {
        title: "before update",
      },
    });
    const createdItem = (createResponse.body as { item: { id: string } }).item;

    const updateResponse = await requestJson(
      baseUrl,
      `${COLLECTION_PATH}/${createdItem.id}`,
      {
        method: "PUT",
        headers: DEFAULT_HEADERS,
        body: {
          title: "after update",
        },
      },
    );

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.body).toEqual({
      item: expect.objectContaining({
        id: createdItem.id,
        title: "after update",
      }),
    });
  });

  test("DELETE item removes an existing record", async () => {
    const createResponse = await requestJson(baseUrl, COLLECTION_PATH, {
      method: "POST",
      headers: DEFAULT_HEADERS,
      body: {
        title: "to delete",
      },
    });
    const createdItem = (createResponse.body as { item: { id: string } }).item;

    const deleteResponse = await requestJson(
      baseUrl,
      `${COLLECTION_PATH}/${createdItem.id}`,
      {
        method: "DELETE",
        headers: DEFAULT_HEADERS,
      },
    );

    expect(deleteResponse.statusCode).toBe(200);
    expect(deleteResponse.body).toEqual({
      deleted: true,
    });
  });

  test("missing records return 404", async () => {
    const response = await requestJson(baseUrl, `${COLLECTION_PATH}/missing-id`, {
      headers: DEFAULT_HEADERS,
    });

    expect(response.statusCode).toBe(404);
    expect(response.body).toEqual({
      error: "Resource not found.",
    });
  });

  test("unsupported methods return 405", async () => {
    const response = await requestJson(baseUrl, COLLECTION_PATH, {
      method: "PATCH",
      headers: DEFAULT_HEADERS,
    });

    expect(response.statusCode).toBe(405);
    expect(response.body).toEqual({
      error: `Method PATCH not allowed on ${COLLECTION_PATH}.`,
    });
  });
});
