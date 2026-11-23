import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { database } from "./db.ts";
import { deliverNotifications } from "./delivery.ts";
import { probeTarget } from "./http.ts";
import { claimProbes, expireSignals, recordProbe } from "./monitoring.ts";

const shutdown = new AbortController();
for (const signal of ["SIGTERM", "SIGINT"] as const) process.once(signal, () => shutdown.abort());

async function runProbes() {
  const due = await claimProbes(28);
  const results = await Promise.allSettled(due.map(async (probe) => recordProbe(probe, await probeTarget(probe))));
  if (results.some(({ status }) => status === "rejected")) throw new Error("探测结果写入失败");
}

async function cleanHistory() {
  await database().begin(async (sql) => {
    await sql`delete from probes where observed_at < now() - interval '7 days'`;
    await sql`delete from deliveries where created_at < now() - interval '90 days' and status != 'pending'`;
    await sql`delete from incidents i where i.closed_at < now() - interval '90 days'
      and not exists (select 1 from deliveries d where d.incident_id = i.id)`;
  });
}

async function loop(label: string, interval: number, task: () => Promise<void>) {
  while (!shutdown.signal.aborted) {
    let wait = interval;
    try {
      await task();
    } catch (error) {
      const code = error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined;
      console.error(`${label}失败`, code ?? "");
      wait = Math.min(5000, Math.max(1000, interval));
    }
    await delay(wait, undefined, { signal: shutdown.signal }).catch(() => {});
  }
}

database();
const healthPort = Number(process.env.WORKER_HEALTH_PORT);
const heartbeatServer = healthPort ? createServer((request, response) => {
  response.writeHead(request.url === "/health" ? 204 : 404).end();
}).listen(healthPort, "0.0.0.0") : undefined;
console.log("Watcher 监控进程已启动");
await Promise.all([
  loop("主动探测", 250, runProbes),
  loop("心跳超时扫描", 250, expireSignals),
  loop("通知投递", 500, deliverNotifications),
  loop("历史清理", 60 * 60 * 1000, cleanHistory),
]);
heartbeatServer?.close();
await database().end({ timeout: 5 });
