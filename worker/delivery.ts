import nodemailer from "nodemailer";
import { database } from "./db.ts";
import { requestStatus } from "./http.ts";
import { unseal } from "./secrets.ts";

type Delivery = {
  id: string; claim: string; attempts: number; incident_id: string;
  event: "down" | "recovery"; kind: "bark" | "webhook" | "email";
  secret: string; reason: string; service: string; monitor: string;
  opened_at: Date; closed_at: Date | null;
};

const MAX_ATTEMPTS = 3;

function claimDeliveries() {
  return database()<Delivery[]>`
    with due as (
      select d.id from deliveries d where d.status = 'pending' and d.next_attempt_at <= now()
        and (d.event = 'down' or not exists (
          select 1 from deliveries prior where prior.incident_id = d.incident_id
            and prior.channel_id = d.channel_id and prior.event = 'down' and prior.status = 'pending'
        ))
      order by d.next_attempt_at limit 12 for update skip locked
    ), claimed as (
      update deliveries d set claim = gen_random_uuid(), next_attempt_at = now() + interval '60 seconds'
      from due where due.id = d.id returning d.*
    )
    select d.id, d.claim, d.attempts, d.incident_id, d.event, c.kind, c.secret,
      i.reason, i.opened_at, i.closed_at, s.name as service, m.name as monitor
    from claimed d join channels c on c.id = d.channel_id join incidents i on i.id = d.incident_id
    join monitors m on m.id = i.monitor_id join services s on s.id = m.service_id`;
}

async function send(delivery: Delivery) {
  const target = unseal(delivery.secret);
  const title = `[Watcher] ${delivery.event === "down" ? "服务异常" : "服务恢复"} · ${delivery.service}`;
  const message = `${delivery.monitor} · ${delivery.event === "down" ? delivery.reason : "监控项已恢复健康"}`;

  if (delivery.kind === "email") {
    const host = process.env.SMTP_HOST;
    const from = process.env.SMTP_FROM;
    if (!host || !from) throw new Error("SMTP 未配置");
    const port = Number(process.env.SMTP_PORT ?? 587);
    const smtp = nodemailer.createTransport({
      host, port, secure: port === 465, requireTLS: port !== 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD ?? "" } : undefined,
      connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 10000,
    });
    await smtp.sendMail({ from, to: target, subject: title, text: message });
    return;
  }

  if (delivery.kind === "bark") {
    const url = new URL(target);
    url.pathname = `${url.pathname.replace(/\/$/, "")}/${encodeURIComponent(title)}/${encodeURIComponent(message)}`;
    const status = await requestStatus(url.toString());
    if (status < 200 || status >= 300) throw new Error(`HTTP ${status}`);
    return;
  }

  const status = await requestStatus(target, {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": delivery.id },
    body: JSON.stringify({
      id: delivery.id, incidentId: delivery.incident_id, event: delivery.event,
      service: delivery.service, monitor: delivery.monitor, reason: delivery.reason,
      occurredAt: delivery.event === "down" ? delivery.opened_at : delivery.closed_at,
    }),
  });
  if (status < 200 || status >= 300) throw new Error(`HTTP ${status}`);
}

export async function deliverNotifications() {
  const deliveries = await claimDeliveries();
  await Promise.all(deliveries.map(async (delivery) => {
    let error: string | null = null;
    try {
      await send(delivery);
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : "";
      error = /^(HTTP \d{3}|SMTP 未配置)$/.test(message) ? message : "发送失败，请检查渠道配置";
    }
    const attempts = delivery.attempts + 1;
    const status = error ? attempts >= MAX_ATTEMPTS ? "failed" : "pending" : "sent";
    await database()`update deliveries set status = ${status}, attempts = ${attempts}, last_error = ${error},
      next_attempt_at = now() + make_interval(secs => ${attempts * 15}), claim = null
      where id = ${delivery.id} and claim = ${delivery.claim}`;
  }));
}
