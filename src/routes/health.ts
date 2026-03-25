import type { IncomingMessage, ServerResponse } from "node:http";

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

export function handleHealthRoute(
  request: IncomingMessage,
  response: ServerResponse,
): boolean {
  const url = new URL(request.url ?? "/", "http://localhost");

  if (request.method !== "GET" || url.pathname !== "/health") {
    return false;
  }

  sendJson(response, 200, {
    status: "ok",
  });
  return true;
}
