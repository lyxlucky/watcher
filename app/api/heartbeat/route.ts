import { upgradeWebSocket, type WebSocketData } from "@vercel/functions";
import { monitorSocket } from "../../../worker/socket.ts";

export const runtime = "nodejs";
export const maxDuration = 300;

export function GET(request: Request) {
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return new Response("WebSocket required", { status: 426 });
  }
  const authorization = request.headers.get("authorization");
  if (!/^Bearer [\w-]{43}$/i.test(authorization ?? "")) {
    return new Response("Monitor token required", { status: 401 });
  }
  return upgradeWebSocket((ws) => {
    const monitor = monitorSocket(ws, authorization);
    ws.on("message", (data: WebSocketData) => void monitor.message(
      typeof data === "string" || data instanceof Uint8Array ? data : new Uint8Array(Array.isArray(data) ? Buffer.concat(data) : data),
    ));
    ws.on("close", monitor.close);
    ws.on("error", monitor.close);
  }, { maxPayload: 512 });
}
