import { WebSocketServer } from "ws";
import { monitorSocket } from "./socket.ts";

const server = new WebSocketServer({ host: "127.0.0.1", port: 3001, path: "/api/heartbeat", maxPayload: 512 });
server.on("connection", (ws, request) => {
  const monitor = monitorSocket(ws, request.headers.authorization ?? null);
  ws.on("error", monitor.close);
  ws.on("close", monitor.close);
  ws.on("message", (data) => void monitor.message(Array.isArray(data) ? Buffer.concat(data) : new Uint8Array(data)));
});
server.on("listening", () => console.log("本地接入地址 ws://127.0.0.1:3001/api/heartbeat"));
