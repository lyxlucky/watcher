import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { WebSocket, WebSocketServer } from "ws";
import { actionSchema, configure, monitorHistory, snapshot } from "../app/dashboard-data.ts";
import { database } from "../worker/db.ts";
import { deliverNotifications } from "../worker/delivery.ts";
import { expectedStatuses, publicUrl } from "../worker/http.ts";
import { authenticateMonitor, claimProbes, expireSignals, receiveSignal, recordProbe } from "../worker/monitoring.ts";
import { monitorSocket } from "../worker/socket.ts";

let pg: PGlite;
let server: PGLiteSocketServer;
let serviceId: string;
let channelId: string;
const configureAction = (input: unknown) => configure(actionSchema.parse(input));

before(async () => {
  pg = await PGlite.create();
  await pg.exec(await readFile(new URL("../worker/schema.sql", import.meta.url), "utf8"));
  server = new PGLiteSocketServer({ db: pg, host: "127.0.0.1", port: 0, maxConnections: 8 });
  await server.start();
  process.env.DATABASE_URL = `postgres://postgres:postgres@${server.getServerConn()}/postgres`;
  process.env.CHANNEL_SECRET_KEY = randomBytes(32).toString("base64");
  delete process.env.SMTP_HOST;
  await configureAction({ action: "save-service", name: "测试服务" });
  await configureAction({ action: "save-channel", name: "值班邮件", kind: "email", target: "test@example.com" });
  const health = await snapshot(true);
  serviceId = health.services[0].id;
  channelId = health.channels[0].id;
});

after(async () => {
  if (process.env.DATABASE_URL) await database().end({ timeout: 1 });
  await server?.stop();
  await pg?.close();
});

test("首次探测、失败计数、恢复和读者配置隐藏", async () => {
  await configureAction({ action: "save-monitor", serviceId, name: "HTTP", kind: "http", target: "https://example.com/private?config=1", channelIds: [channelId] });
  const sql = database();
  for (const [index, status] of [500, 200, 500, 500, 500, 200].entries()) {
    await sql`update monitors set next_probe_at = now() where kind = 'http'`;
    const [probe] = await claimProbes(10);
    assert.ok(probe);
    assert.equal((await claimProbes(10)).length, 0);
    await recordProbe(probe, { status, ok: status === 200, latency: 10, reason: `HTTP ${status}` });
    assert.equal((await snapshot(true)).monitors[0].state, ["waiting", "healthy", "healthy", "down", "down", "healthy"][index]);
  }
  const admin = await snapshot(true);
  assert.equal(admin.monitors[0].probe_history.length, 6);
  assert.equal(admin.incidents.length, 1);
  assert.ok(admin.incidents[0].closed_at);
  assert.equal(admin.incidents[0].deliveries.length, 2);
  assert.equal((await snapshot(false)).monitors[0].target_url, null);
  assert.ok(admin.monitors[0].target_url?.includes("config=1"));
});

test("投递失败独立重试并记录，恢复排在故障之后", async () => {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await database()`update deliveries set next_attempt_at = now() where status = 'pending'`;
    await deliverNotifications();
    const rows = (await snapshot(true)).incidents[0].deliveries;
    assert.equal(rows.find(({ event }) => event === "down")?.attempts, attempt);
    assert.equal(rows.find(({ event }) => event === "recovery")?.attempts, 0);
  }
  const down = (await snapshot(true)).incidents[0].deliveries.find(({ event }) => event === "down");
  assert.equal(down?.status, "failed");
  assert.equal(down?.error, "SMTP 未配置");
  await deliverNotifications();
  assert.equal((await snapshot(true)).incidents[0].deliveries.find(({ event }) => event === "recovery")?.attempts, 1);
});

test("WebSocket 首次接入、心跳超时、显式异常和令牌轮换", async () => {
  const { token } = await configureAction({ action: "save-monitor", serviceId, name: "WebSocket", kind: "ws" });
  assert.ok(token);
  const monitor = await authenticateMonitor(token);
  assert.ok(monitor);
  const state = async () => (await snapshot(true)).monitors.find(({ id }) => id === monitor.id)?.state;
  const age = () => database()`update monitors set last_signal_at = now() - interval '15 seconds' where id = ${monitor.id}`;
  await expireSignals();
  assert.equal(await state(), "waiting");

  const listener = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await once(listener, "listening");
  listener.on("connection", (peer, request) => {
    const socket = monitorSocket(peer, request.headers.authorization ?? null);
    peer.on("message", (message) => { void socket.message(message.toString()); });
    peer.on("close", socket.close);
  });
  const address = listener.address();
  assert.ok(address && typeof address !== "string");
  const client = new WebSocket(`ws://127.0.0.1:${address.port}`, { headers: { Authorization: `Bearer ${token}` } });
  try {
    await once(client, "open");
    client.send('{"type":"heartbeat"}');
    assert.equal(String((await once(client, "message"))[0]), '{"type":"ack"}');
    assert.equal(await state(), "healthy");
    await age();
    await expireSignals();
    assert.equal(await state(), "down");
    await delay(510);
    client.send('{"type":"heartbeat"}');
    await once(client, "message");
    assert.equal(await state(), "healthy");
    await receiveSignal(monitor, "unhealthy");
    await receiveSignal(monitor, "heartbeat");
    assert.equal(await state(), "down");
    await receiveSignal(monitor, "healthy");
    assert.equal(await state(), "healthy");
    await age();
    await receiveSignal(monitor, "heartbeat");
    assert.equal(await state(), "healthy");
    assert.equal((await snapshot(true)).incidents.filter(({ monitor: name }) => name === "WebSocket").length, 3);
    const rotated = await configureAction({ action: "rotate-token", id: monitor.id });
    assert.ok(rotated.token);
    assert.equal(await receiveSignal(monitor, "heartbeat"), false);
    assert.ok(await authenticateMonitor(rotated.token));
  } finally {
    client.terminate();
    await new Promise<void>((resolve) => listener.close(() => resolve()));
  }
});

test("公网地址与预期状态码校验", () => {
  assert.throws(() => publicUrl("http://127.0.0.1"));
  assert.throws(() => publicUrl("http://[::ffff:10.0.0.1]"));
  assert.throws(() => publicUrl("file:///example"));
  assert.equal(publicUrl("https://example.com/health").pathname, "/health");
  assert.equal(expectedStatuses("200, 2XX, 200"), "200,2xx");
  assert.throws(() => expectedStatuses("999"));
});

test("监控历史按时段聚合探测并只返回所选监控项的故障", async () => {
  await configureAction({ action: "save-monitor", serviceId, name: "Latency history", kind: "http", target: "https://example.com/health" });
  const sql = database();
  const [{ id }] = await sql<{ id: string }[]>`select id from monitors where name = 'Latency history'`;
  await sql`
    insert into probes (monitor_id, observed_at, ok, latency_ms, reason) values
      (${id}, now() - interval '1 minute', true, 120, 'HTTP 200'),
      (${id}, now() - interval '2 minutes', false, 900, 'HTTP 503'),
      (${id}, now() - interval '2 hours', true, 240, 'HTTP 200'),
      (${id}, now() - interval '2 days', true, 360, 'HTTP 200'),
      (${id}, now() - interval '8 days', true, 500, 'HTTP 200')`;
  await sql`insert into incidents (monitor_id, reason) values (${id}, 'HTTP 503')`;

  for (const [range, sampleCount, latency] of [["1h", 2, 120], ["24h", 3, 360], ["7d", 4, 720]] as const) {
    const history = await monitorHistory(id, range);
    assert.ok(history);
    assert.equal(history.buckets.reduce((sum, bucket) => sum + bucket.samples, 0), sampleCount);
    assert.equal(history.buckets.reduce((sum, bucket) => sum + bucket.successes, 0), sampleCount - 1);
    assert.equal(history.buckets.reduce((sum, bucket) => sum + bucket.latencySum, 0), latency);
    assert.deepEqual(history.incidents.map((incident) => incident.monitor), ["Latency history"]);
  }

  await configureAction({ action: "archive-monitor", id });
  assert.equal(await monitorHistory(id, "24h"), undefined);
});
