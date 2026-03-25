import type { IncomingMessage, ServerResponse } from "node:http";

import { NoteTakingService } from "../services/noteTakingService";
import type {
  CreateNoteTakingInput,
  UpdateNoteTakingInput,
} from "../types/note-taking";

const COLLECTION_PATH = "/note-takings";
const ITEM_PATH_PREFIX = `${COLLECTION_PATH}/`;

function sendJson(
  response: ServerResponse,
  statusCode: number,
  payload: unknown,
): void {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

async function readJsonBody(
  request: IncomingMessage,
): Promise<Record<string, unknown>> {
  const chunks: string[] = [];

  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
  }

  if (chunks.length === 0) {
    return {};
  }

  const rawBody = chunks.join("").trim();

  if (!rawBody) {
    return {};
  }

  const parsedBody = JSON.parse(rawBody);

  if (
    !parsedBody ||
    Array.isArray(parsedBody) ||
    typeof parsedBody !== "object"
  ) {
    throw new Error("Request body must be a JSON object.");
  }

  return parsedBody as Record<string, unknown>;
}

function getItemId(pathname: string): string | null {
  if (!pathname.startsWith(ITEM_PATH_PREFIX)) {
    return null;
  }

  const id = pathname.slice(ITEM_PATH_PREFIX.length);

  if (!id || id.includes("/")) {
    return null;
  }

  return decodeURIComponent(id);
}

export async function handleNoteTakingsRoute(
  request: IncomingMessage,
  response: ServerResponse,
  noteTakingService: NoteTakingService,
): Promise<boolean> {
  const url = new URL(request.url ?? "/", "http://localhost");
  const { pathname } = url;
  const itemId = getItemId(pathname);

  if (pathname !== COLLECTION_PATH && itemId === null) {
    return false;
  }

  if (pathname === COLLECTION_PATH) {
    switch (request.method) {
      case "GET":
        sendJson(response, 200, {
          items: noteTakingService.list(),
        });
        return true;
      case "POST":
        try {
          const payload = await readJsonBody(request);
          const record = noteTakingService.create(
            payload as CreateNoteTakingInput,
          );

          sendJson(response, 201, {
            item: record,
          });
        } catch (error) {
          sendJson(response, 400, {
            error:
              error instanceof Error ? error.message : "Invalid request body.",
          });
        }

        return true;
      default:
        sendJson(response, 405, {
          error: `Method ${request.method ?? "UNKNOWN"} not allowed on ${COLLECTION_PATH}.`,
        });
        return true;
    }
  }

  if (itemId === null) {
    return false;
  }

  switch (request.method) {
    case "GET": {
      const record = noteTakingService.getById(itemId);

      if (!record) {
        sendJson(response, 404, {
          error: "Resource not found.",
        });
        return true;
      }

      sendJson(response, 200, {
        item: record,
      });
      return true;
    }
    case "PUT":
      try {
        const payload = await readJsonBody(request);
        const updatedRecord = noteTakingService.update(
          itemId,
          payload as UpdateNoteTakingInput,
        );

        if (!updatedRecord) {
          sendJson(response, 404, {
            error: "Resource not found.",
          });
          return true;
        }

        sendJson(response, 200, {
          item: updatedRecord,
        });
      } catch (error) {
        sendJson(response, 400, {
          error:
            error instanceof Error ? error.message : "Invalid request body.",
        });
      }

      return true;
    case "DELETE": {
      const deleted = noteTakingService.delete(itemId);

      if (!deleted) {
        sendJson(response, 404, {
          error: "Resource not found.",
        });
        return true;
      }

      sendJson(response, 200, {
        deleted: true,
      });
      return true;
    }
    default:
      sendJson(response, 405, {
        error: `Method ${request.method ?? "UNKNOWN"} not allowed on ${pathname}.`,
      });
      return true;
  }
}
