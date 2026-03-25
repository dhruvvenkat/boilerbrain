import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { handleHealthRoute } from "./routes/health";
import { handleNoteTakingsRoute } from "./routes/note-takings";
import { NoteTakingService } from "./services/noteTakingService";
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

export function createApp() {
  const noteTakingService = new NoteTakingService();

  return createServer((request, response) => {
    void handleRequest(request, response, noteTakingService);
  });
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  noteTakingService: NoteTakingService,
): Promise<void> {
  try {
    if (handleHealthRoute(request, response)) {
      return;
    }

    if (await handleNoteTakingsRoute(request, response, noteTakingService)) {
      return;
    }

    sendJson(response, 404, {
      error: "Route not found.",
    });
  } catch (error) {
    console.error("Unhandled request error:", error);

    if (!response.headersSent) {
      sendJson(response, 500, {
        error: "Internal server error.",
      });
      return;
    }

    response.end();
  }
}
