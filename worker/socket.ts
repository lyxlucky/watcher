import { authenticateMonitor, receiveSignal, type Signal } from "./monitoring.ts";

type Peer = { send: (message: string) => void; close: (code: number, reason: string) => void };

export function monitorSocket(peer: Peer, authorization: string | null) {
  let closed = false;
  let busy = false;
  let nextSignalAt = 0;
  const identity = authenticateMonitor(authorization?.match(/^Bearer (.+)$/i)?.[1] ?? "");

  function close(code: number, reason: string) {
    if (closed) return;
    closed = true;
    peer.close(code, reason);
  }

  void identity.then((monitor) => {
    if (!monitor) close(1008, "Invalid monitor token");
  }).catch(() => close(1011, "Monitor database unavailable"));

  return {
    close() { closed = true; },
    async message(data: string | Uint8Array) {
      if (closed) return;
      if (data.length > 512) return close(1009, "Message too large");
      if (busy || Date.now() < nextSignalAt) return close(1008, "Signal rate limit");
      busy = true;
      nextSignalAt = Date.now() + 500;
      try {
        const monitor = await identity;
        if (!monitor || closed) return;
        const text = typeof data === "string" ? data : new TextDecoder().decode(data);
        let signal: unknown;
        try { signal = JSON.parse(text)?.type; } catch { /* Rejected below. */ }
        if (signal !== "heartbeat" && signal !== "healthy" && signal !== "unhealthy") {
          return close(1008, "Invalid signal");
        }
        if (!(await receiveSignal(monitor, signal satisfies Signal))) return close(1008, "Monitor token revoked");
        if (!closed) peer.send('{"type":"ack"}');
      } catch {
        close(1011, "Could not record signal");
      } finally {
        busy = false;
      }
    },
  };
}
