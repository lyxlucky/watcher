import { createHash, randomBytes } from "node:crypto";
import { database, type Transaction } from "./db.ts";

export type Health = "waiting" | "healthy" | "down";
export type Signal = "heartbeat" | "healthy" | "unhealthy";

export const SIGNAL_TIMEOUT_SECONDS = 15;
export const PROBE_INTERVAL_SECONDS = 30;

export function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function newToken() {
  return randomBytes(32).toString("base64url");
}

async function transition(sql: Transaction, id: string, previous: Health, next: Health, reason: string) {
  if (previous === next) return;
  await sql`update monitors set state = ${next} where id = ${id}`;
  if (next === "down") {
    const [incident] = await sql<{ id: string }[]>`
      insert into incidents (monitor_id, reason) values (${id}, ${reason}) returning id`;
    await sql`
      insert into deliveries (incident_id, channel_id, event)
      select ${incident.id}, c.id, 'down' from monitor_channels mc join channels c on c.id = mc.channel_id
      where mc.monitor_id = ${id} and c.archived_at is null`;
  } else if (previous === "down") {
    const [incident] = await sql<{ id: string }[]>`
      update incidents set closed_at = now() where monitor_id = ${id} and closed_at is null returning id`;
    if (incident) await sql`
      insert into deliveries (incident_id, channel_id, event)
      select ${incident.id}, c.id, 'recovery' from monitor_channels mc join channels c on c.id = mc.channel_id
      where mc.monitor_id = ${id} and c.archived_at is null`;
  }
}

export async function authenticateMonitor(token: string) {
  if (!/^[\w-]{43}$/.test(token)) return;
  const hash = tokenHash(token);
  const [row] = await database()<{ id: string }[]>`
    select id from monitors where token_hash = ${hash} and kind = 'ws' and archived_at is null`;
  if (row) return { id: row.id, hash };
}

export async function receiveSignal(monitor: { id: string; hash: string }, signal: Signal) {
  return database().begin(async (sql) => {
    const [row] = await sql<{ state: Health; explicit_failure: boolean; overdue: boolean }[]>`
      select state, explicit_failure,
        last_signal_at <= clock_timestamp() - make_interval(secs => ${SIGNAL_TIMEOUT_SECONDS}) as overdue
      from monitors
      where id = ${monitor.id} and token_hash = ${monitor.hash} and archived_at is null for update`;
    if (!row) return false;
    if (row.state === "healthy" && row.overdue) {
      await transition(sql, monitor.id, row.state, "down", "15 秒未收到应用心跳");
      row.state = "down";
    }
    const explicitFailure = signal === "unhealthy" || (signal === "heartbeat" && row.explicit_failure);
    await sql`
      update monitors set last_signal_at = clock_timestamp(), explicit_failure = ${explicitFailure}
      where id = ${monitor.id}`;
    await transition(sql, monitor.id, row.state, explicitFailure ? "down" : "healthy", "服务显式上报异常");
    return true;
  });
}

export async function expireSignals() {
  await database().begin(async (sql) => {
    const expired = await sql<{ id: string; state: Health }[]>`
      select id, state from monitors where kind = 'ws' and archived_at is null and state = 'healthy'
        and last_signal_at <= clock_timestamp() - make_interval(secs => ${SIGNAL_TIMEOUT_SECONDS})
      for update skip locked`;
    for (const monitor of expired) await transition(sql, monitor.id, monitor.state, "down", "15 秒未收到应用心跳");
  });
}

export type DueProbe = { id: string; target_url: string; expected_status: string; probe_claim: string };
export type ProbeResult = { status: number | null; ok: boolean; latency: number; reason: string };

export function claimProbes(limit: number) {
  return database()<DueProbe[]>`
    with due as (
      select id from monitors where kind = 'http' and archived_at is null and next_probe_at <= now()
        and (probe_lease_until is null or probe_lease_until <= now())
      order by next_probe_at limit ${limit} for update skip locked
    )
    update monitors m set probe_claim = gen_random_uuid(), probe_lease_until = now() + interval '20 seconds',
      next_probe_at = now() + make_interval(secs => ${PROBE_INTERVAL_SECONDS})
    from due where m.id = due.id returning m.id, m.target_url, m.expected_status, m.probe_claim`;
}

export async function recordProbe(probe: DueProbe, result: ProbeResult) {
  await database().begin(async (sql) => {
    const [current] = await sql<{ failures: number; state: Health }[]>`
      select failures, state from monitors where id = ${probe.id} and probe_claim = ${probe.probe_claim}
        and archived_at is null for update`;
    if (!current) return;
    const failures = result.ok ? 0 : Math.min(current.failures + 1, 2);
    await sql`update monitors set failures = ${failures}, probe_claim = null, probe_lease_until = null where id = ${probe.id}`;
    await sql`
      insert into probes (monitor_id, ok, status_code, latency_ms, reason)
      values (${probe.id}, ${result.ok}, ${result.status}, ${result.latency}, ${result.reason})`;
    const next = result.ok ? "healthy" : failures >= 2 ? "down" : current.state;
    await transition(sql, probe.id, current.state, next, result.reason);
  });
}
