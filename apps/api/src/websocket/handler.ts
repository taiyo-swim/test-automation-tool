import type { WebSocket } from "ws";
import type { WsEvent } from "@e2e-tool/types";

// runId → Set of connected WebSocket clients
const clients = new Map<string, Set<WebSocket>>();

export function wsHandler(socket: WebSocket, request: Request & { query: Record<string, string> }) {
  const url = new URL(request.url, "http://localhost");
  const runId = url.searchParams.get("runId");

  if (!runId) {
    socket.close(1008, "runId query param required");
    return;
  }

  // Register client
  if (!clients.has(runId)) {
    clients.set(runId, new Set());
  }
  clients.get(runId)!.add(socket);

  socket.on("close", () => {
    clients.get(runId)?.delete(socket);
    if (clients.get(runId)?.size === 0) {
      clients.delete(runId);
    }
  });
}

export function broadcast(runId: string, event: WsEvent) {
  const sockets = clients.get(runId);
  if (!sockets || sockets.size === 0) return;

  const message = JSON.stringify(event);
  for (const socket of sockets) {
    if (socket.readyState === socket.OPEN) {
      socket.send(message);
    }
  }
}
