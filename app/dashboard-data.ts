import { z } from "zod";
import { database, type Transaction } from "../worker/db.ts";
import { expectedStatuses, publicUrl } from "../worker/http.ts";
import { newToken, tokenHash, type Health } from "../worker/monitoring.ts";
import { seal } from "../worker/secrets.ts";
import { historyRanges, type HistoryRange } from "./history-ranges.ts";

const id = z.uuid();
const name = z.string().trim().min(1).max(80);
const kind = z.enum(["http", "ws"]);
const channelKind = z.enum(["bark", "webhook", "email"]);

export const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save-service"), id: id.optional(), name }),
  z.object({ action: z.literal("archive-service"), id }),
  z.object({ action: z.literal("save-monitor"), id: id.optional(), serviceId: id, name, kind,
    target: z.string().trim().max(2048).default(""), expected: z.string().trim().max(128).default("2xx"),
    channelIds: z.array(id).max(50).default([]) }),
  z.object({ action: z.literal("archive-monitor"), id }),
  z.object({ action: z.literal("rotate-token"), id }),
  z.object({ action: z.literal("save-channel"), id: id.optional(), name, kind: channelKind,
    target: z.string().trim().max(2048).default("") }),
  z.object({ action: z.literal("archive-channel"), id }),
]);

type Mutation = z.infer<typeof actionSchema>;
export type DeliveryStatus = "pending" | "sent" | "failed";
export type Channel = { id: string; name: string; kind: z.infer<typeof channelKind> };
export type Service = { id: string; name: string };
export type Monitor = {
  id: string; name: string; service_id: string; kind: z.infer<typeof kind>; state: Health;
  last_signal_at: string | null; target_url: string | null; expected_status: string;
  failures: number; channel_ids: string[]; probe_history: Probe[];
};
export type Probe = { ok: boolean; status: number | null; latency: number; reason: string; at: string };
export type Incident = {
  id: string; service: string; monitor: string; reason: string; opened_at: string; closed_at: string | null; archived: boolean;
  deliveries: { id: string; channel: string; event: "down" | "recovery"; status: DeliveryStatus; attempts: number; error: string | null }[];
};
export type Snapshot = {
  at: string; services: Service[]; monitors: Monitor[]; channels: Channel[];
  incidents: Incident[]; incidentPage: number; hasMoreIncidents: boolean;
};

type HistoryBucket = { at: number; samples: number; successes: number; latencySum: number };
export type MonitorHistory = { at: string; buckets: HistoryBucket[]; incidents: Incident[] };

function incidentRows(sql: Transaction, limit: number, offset = 0, monitorId?: string) {
  return sql<Incident[]>`
    select i.id, s.name as service, m.name as monitor, i.reason, i.opened_at::text, i.closed_at::text, i.archived,
      coalesce((select json_agg(json_build_object('id', d.id, 'channel', c.name, 'event', d.event,
        'status', d.status, 'attempts', d.attempts, 'error', d.last_error) order by d.created_at, c.name)
        from deliveries d join channels c on c.id = d.channel_id where d.incident_id = i.id), '[]'::json) as deliveries
    from incidents i join monitors m on m.id = i.monitor_id join services s on s.id = m.service_id
    ${monitorId ? sql`where i.monitor_id = ${monitorId}` : sql``}
    order by (i.closed_at is null) desc, i.opened_at desc, i.id
    limit ${limit} offset ${offset}`;
}

export async function monitorHistory(monitorId: string, range: HistoryRange): Promise<MonitorHistory | undefined> {
  const { seconds, bucket } = historyRanges[range];
  return database().begin("read only isolation level repeatable read", async (sql) => {
    const [monitor] = await sql<{ at: string; kind: Monitor["kind"] }[]>`
      select now()::text as at, m.kind
      from monitors m join services s on s.id = m.service_id
      where m.id = ${monitorId} and m.archived_at is null and s.archived_at is null`;
    if (!monitor) return;
    const [buckets, incidents] = await Promise.all([
      monitor.kind === "http" ? sql<HistoryBucket[]>`
        select (floor(extract(epoch from observed_at) / ${bucket}::int) * ${bucket}::int)::float8 as at,
          count(*)::int as samples, count(*) filter (where ok)::int as successes,
          coalesce(sum(latency_ms) filter (where ok), 0)::float8 as "latencySum"
        from probes
        where monitor_id = ${monitorId}
          and observed_at >= now() - make_interval(secs => ${seconds})
          and observed_at <= now()
        group by 1 order by 1` : [],
      incidentRows(sql, 5, 0, monitorId),
    ]);
    return { at: monitor.at, buckets, incidents };
  });
}

export async function snapshot(isAdmin: boolean, incidentPage = 1): Promise<Snapshot> {
  const pageSize = 30;
  return database().begin("read only isolation level repeatable read", async (sql) => {
    const [[{ at }], services, monitors, channels, incidents] = await Promise.all([
      sql<{ at: string }[]>`select now()::text as at`,
      sql<Service[]>`select id, name from services where archived_at is null order by name, id`,
      sql<Monitor[]>`
        select m.id, m.name, m.service_id, m.kind, m.state, m.last_signal_at::text, m.expected_status, m.failures,
          case when ${isAdmin} then m.target_url else null end as target_url,
          array(select mc.channel_id from monitor_channels mc join channels c on c.id = mc.channel_id
            where mc.monitor_id = m.id and c.archived_at is null) as channel_ids,
          coalesce(p.history, '[]'::json) as probe_history
        from monitors m join services s on m.service_id = s.id
        left join lateral (
          select json_agg(json_build_object('ok', ok, 'status', status_code, 'latency', latency_ms,
            'reason', reason, 'at', observed_at) order by observed_at desc, id desc) as history
          from (select * from probes where monitor_id = m.id order by observed_at desc, id desc limit 24) recent
        ) p on m.kind = 'http'
        where m.archived_at is null and s.archived_at is null order by m.name, m.id`,
      sql<Channel[]>`select id, name, kind from channels where archived_at is null order by name, id`,
      incidentRows(sql, pageSize + 1, (incidentPage - 1) * pageSize),
    ]);
    return { at, services, monitors, channels, incidents: incidents.slice(0, pageSize), incidentPage,
      hasMoreIncidents: incidents.length > pageSize };
  });
}

export class ConfigurationError extends Error {}

function requireRow(rows: { id: string }[], message: string) {
  if (!rows[0]) throw new ConfigurationError(message);
  return rows[0].id;
}

async function archiveMonitor(sql: Transaction, monitorId: string) {
  await sql`update monitors set archived_at = now(), token_hash = null where id = ${monitorId} and archived_at is null`;
  await sql`update incidents set closed_at = now(), archived = true where monitor_id = ${monitorId} and closed_at is null`;
}

function validateTarget(kind: "http" | "ws" | Channel["kind"], input: string) {
  if (kind === "ws") return null;
  if (kind === "email") {
    const address = z.email().safeParse(input);
    if (!address.success) throw new ConfigurationError("请输入有效的收件邮箱");
    return address.data;
  }
  try {
    const url = publicUrl(input);
    if (kind === "bark" && !url.pathname.split("/").filter(Boolean).length) {
      throw new Error("请填写包含设备密钥的 Bark 推送链接");
    }
    return url.toString();
  } catch (error) {
    const description = error instanceof Error && error.message !== "Invalid URL" ? error.message : "请输入有效的公网 HTTP(S) 地址";
    throw new ConfigurationError(description);
  }
}

export async function configure(input: Mutation): Promise<{ token?: string }> {
  return database().begin(async (sql) => {
    switch (input.action) {
      case "save-service":
        if (input.id) requireRow(await sql`update services set name = ${input.name} where id = ${input.id} and archived_at is null returning id`, "服务已归档");
        else await sql`insert into services (name) values (${input.name})`;
        return {};
      case "archive-service": {
        await sql`update services set archived_at = now() where id = ${input.id} and archived_at is null`;
        const monitors = await sql<{ id: string }[]>`select id from monitors where service_id = ${input.id} and archived_at is null order by id`;
        for (const { id } of monitors) await archiveMonitor(sql, id);
        return {};
      }
      case "archive-monitor":
        await archiveMonitor(sql, input.id);
        return {};
      case "rotate-token": {
        const token = newToken();
        requireRow(await sql`update monitors set token_hash = ${tokenHash(token)} where id = ${input.id}
          and kind = 'ws' and archived_at is null returning id`, "被动监控项已归档或不存在");
        return { token };
      }
      case "save-monitor": {
        const target = validateTarget(input.kind, input.target);
        let expected: string;
        try { expected = input.kind === "http" ? expectedStatuses(input.expected) : "2xx"; }
        catch { throw new ConfigurationError("状态码格式应为 2xx 或 200,204,3xx"); }
        requireRow(await sql`select id from services where id = ${input.serviceId} and archived_at is null for share`, "服务已归档或不存在");
        const channels = [...new Set(input.channelIds)];
        if (channels.length) {
          const active = await sql`select id from channels where id in ${sql(channels)} and archived_at is null for share`;
          if (active.length !== channels.length) throw new ConfigurationError("有通知渠道已停用");
        }
        const token = input.kind === "ws" && !input.id ? newToken() : undefined;
        const monitorId = input.id ? requireRow(await sql`
          update monitors set name = ${input.name}, target_url = ${target}, expected_status = ${expected},
            failures = case when target_url is distinct from ${target} or expected_status != ${expected} then 0 else failures end,
            next_probe_at = case when target_url is distinct from ${target} or expected_status != ${expected} then now() else next_probe_at end,
            probe_claim = case when target_url is distinct from ${target} or expected_status != ${expected} then null else probe_claim end,
            probe_lease_until = case when target_url is distinct from ${target} or expected_status != ${expected} then null else probe_lease_until end
          where id = ${input.id} and service_id = ${input.serviceId} and kind = ${input.kind} and archived_at is null returning id`,
        "监控项已归档或类型已锁定") : requireRow(await sql`
          insert into monitors (service_id, name, kind, target_url, expected_status, token_hash)
          values (${input.serviceId}, ${input.name}, ${input.kind}, ${target}, ${expected}, ${token ? tokenHash(token) : null}) returning id`,
        "无法创建监控项");
        await sql`delete from monitor_channels where monitor_id = ${monitorId}`;
        if (channels.length) await sql`insert into monitor_channels ${sql(channels.map((channel_id) => ({ monitor_id: monitorId, channel_id })))}`;
        return { token };
      }
      case "save-channel": {
        const target = input.target ? validateTarget(input.kind, input.target) : null;
        if (!input.id && !target) throw new ConfigurationError("请输入投递地址");
        const secret = target ? seal(target) : null;
        if (input.id) requireRow(await sql`
          update channels set name = ${input.name}, secret = coalesce(${secret}, secret)
          where id = ${input.id} and kind = ${input.kind} and archived_at is null returning id`, "通知渠道已停用或类型已锁定");
        else await sql`insert into channels (name, kind, secret) values (${input.name}, ${input.kind}, ${secret})`;
        return {};
      }
      case "archive-channel":
        await sql`update channels set archived_at = now() where id = ${input.id} and archived_at is null`;
        await sql`update deliveries set status = 'failed', last_error = '渠道已停用', claim = null
          where channel_id = ${input.id} and status = 'pending'`;
        return {};
    }
  });
}
