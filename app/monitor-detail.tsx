"use client";

import { ArrowUpRight, ChevronDown, CircleAlert, CircleCheck, Clock3, Link2, Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import type { Incident, Monitor, MonitorHistory, Probe, Service } from "./dashboard-data.ts";
import type { Edit } from "./dialogs.tsx";
import { historyRanges, type HistoryRange } from "./history-ranges.ts";
import { useLocale } from "./locale-provider.tsx";

const rangeLabels = { "1h": "range1h", "24h": "range24h", "7d": "range7d" } as const;
const ranges = Object.keys(historyRanges) as HistoryRange[];

export function HealthBadge({ health, label }: { health: Monitor["state"]; label?: string }) {
  const { t } = useLocale();
  return <span className={`health-badge ${health}`}><i aria-hidden="true" />{label ?? t[health]}</span>;
}

export function SampleStrip({ samples, compact = false }: { samples: Probe[]; compact?: boolean }) {
  const { t, number, time, detail } = useLocale();
  const label = `${t.checks} · ${number.format(samples.length)} · ${t.failedChecks} ${number.format(samples.filter((sample) => !sample.ok).length)}`;
  return <span className={`heartbeat${compact ? " compact" : ""}`} role={compact ? undefined : "img"}
    aria-hidden={compact || undefined} aria-label={compact ? undefined : label}>
    {Array.from({ length: 24 }, (_, index) => {
      const sample = samples[23 - index];
      return <span key={index} className={`probe-slot${sample ? sample.ok ? " ok" : " bad" : ""}`}
        title={sample && !compact ? `${time.format(new Date(sample.at))} · ${number.format(sample.latency)} ms · ${detail(sample.reason)}` : undefined} />;
    })}
  </span>;
}

export function MonitorDetail({ monitor, service, historyVersion, onEdit }: {
  monitor: Monitor; service: Service; historyVersion: number; onEdit?: (edit: Edit) => void;
}) {
  const { t, dateTime, timeZone, number, percent } = useLocale();
  const [range, setRange] = useState<HistoryRange>("24h");
  const [request, setRequest] = useState<{ range: HistoryRange; history?: MonitorHistory; error?: boolean }>();
  const history = request?.range === range ? request.history : undefined;
  const failed = request?.range === range && request.error;
  const samples = monitor.probe_history;
  const latest = samples[0];
  const oldest = samples.at(-1);
  const isHttp = monitor.kind === "http";
  const totals = history?.buckets.reduce((sum, bucket) => ({
    samples: sum.samples + bucket.samples,
    successes: sum.successes + bucket.successes,
    latency: sum.latency + bucket.latencySum,
  }), { samples: 0, successes: 0, latency: 0 });

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function update() {
      try {
        if (document.visibilityState !== "hidden") {
          const params = new URLSearchParams({ monitorId: monitor.id, range });
          const response = await fetch(`/api/dashboard?${params}`, { cache: "no-store", signal: controller.signal });
          if (!response.ok) throw new Error("History request failed");
          const incoming: MonitorHistory = await response.json();
          if (!controller.signal.aborted) setRequest({ range, history: incoming });
        }
      } catch {
        if (!controller.signal.aborted) setRequest((previous) => ({
          range, history: previous?.range === range ? previous.history : undefined, error: true,
        }));
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(update, 30_000);
      }
    }
    void update();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [monitor.id, range, historyVersion]);

  const rangeText = t[rangeLabels[range]];
  const lastObserved = isHttp ? latest?.at : monitor.last_signal_at;
  return <>
    <header className="panel monitor-header">
      <div className="monitor-header-copy">
        <div className="monitor-header-title"><h2>{monitor.name}</h2><HealthBadge health={monitor.state} />
          <span className="method-pill">{isHttp ? t.activeCheck : t.passiveCheck}</span>
        </div>
        {monitor.target_url && <p className="monitor-target"><Link2 size={16} />{monitor.target_url}</p>}
      </div>
      {onEdit && <button className="soft-action" onClick={() => onEdit({ type: "monitor", service, value: monitor })}>
        <Pencil size={16} />{t.editMonitor}
      </button>}
    </header>
    <dl className="monitor-stats" data-passive={!isHttp}>
      {isHttp && <>
        <div className="panel stat-card"><dt>{t.successRate}</dt>
          <dd>{totals?.samples ? percent.format(totals.successes / totals.samples) : "—"}</dd><small>{rangeText}</small>
        </div>
        <div className="panel stat-card"><dt>{t.averageResponse}</dt>
          <dd>{totals?.successes ? <>{number.format(Math.round(totals.latency / totals.successes))} <small>ms</small></> : "—"}</dd>
          <small>{rangeText}</small>
        </div>
      </>}
      <div className="panel stat-card observation-stat"><dt>{isHttp ? t.lastCheck : t.lastHeartbeat} <Clock3 size={16} /></dt>
        <dd>{lastObserved ? <time dateTime={new Date(lastObserved).toISOString()}>{dateTime(lastObserved)}</time> : isHttp ? t.noCheck : t.noneReceived}</dd>
        <small>{lastObserved && `${timeZone} · `}{isHttp ? t.probeInterval : t.heartbeatInterval}</small>
      </div>
    </dl>
    {isHttp && <>
      <section className="panel chart-panel" aria-labelledby="response-heading">
        <div className="panel-heading">
          <h2 id="response-heading">{t.responseTime}</h2>
          <div className="segments range-picker" role="group" aria-label={t.range}>{ranges.map((option) =>
            <button key={option} aria-pressed={range === option} onClick={() => setRange(option)}>{t[rangeLabels[option]]}</button>)}</div>
        </div>
        {failed && <p className="form-error" role="alert">{t.historyError}</p>}
        {history ? <ResponseChart history={history} range={range} /> :
          !failed && <p className="empty-panel chart-empty" role="status"><span className="spinner" />{t.loadingHistory}</p>}
      </section>
      <section className="panel checks-panel" aria-labelledby="checks-heading">
        <div className="panel-heading"><h2 id="checks-heading">{t.recentChecks}</h2>
          <div className="check-legend"><span className="signal-dot healthy" />{t.ok}<span className="signal-dot down" />{t.failed}
            <span className="signal-dot waiting" />{t.noData}</div>
        </div>
        <SampleStrip samples={samples} />
        <div className="signal-axis"><span>{oldest ? dateTime(oldest.at) : t.noCheck}</span>
          {latest && latest !== oldest && <span>{dateTime(latest.at)}</span>}
        </div>
        {!!samples.length && <CheckTable samples={samples} />}
      </section>
    </>}
    <section className="panel recent-events" aria-labelledby="recent-heading">
      <div className="panel-heading"><h2 id="recent-heading">{t.recentIncidents}</h2>
        <a className="history-link" href="#incidents">{t.viewAll}<ArrowUpRight size={16} /></a></div>
      {history ? <IncidentList incidents={history.incidents} at={history.at} compact /> :
        failed ? <p className="form-error" role="alert">{t.historyError}</p> :
          <p className="empty-panel" role="status"><span className="spinner" />{t.loadingHistory}</p>}
    </section>
  </>;
}

function ResponseChart({ history, range }: { history: MonitorHistory; range: HistoryRange }) {
  const { t, locale, number, dateTime } = useLocale();
  const { seconds, bucket } = historyRanges[range];
  const end = new Date(history.at).getTime() / 1000;
  const start = end - seconds;
  const known = history.buckets.filter(({ successes }) => successes);
  if (!known.length) return <p className="empty-panel chart-empty">{history.buckets.length ? t.noLatency : t.noSamples}</p>;

  const max = Math.max(...known.map(({ successes, latencySum }) => latencySum / successes));
  const band = Math.max(50, Math.ceil(max / 150) * 50);
  const width = 1000;
  const height = 220;
  const points = known.map(({ at, successes, latencySum }) => {
    const latency = Math.round(latencySum / successes);
    const x = Math.max(0, Math.min(width, ((at + bucket / 2 - start) / seconds) * width));
    return { at, latency, x, y: height * (1 - latency / (band * 3)) };
  });
  const path = points.map(({ at, x, y }, index) =>
    `${index && at - points[index - 1].at === bucket ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const tickFormat = new Intl.DateTimeFormat(locale, range === "7d"
    ? { month: "short", day: "numeric" } : { hour: "numeric", minute: "2-digit" });

  return <figure className="response-chart" aria-label={t.bucketAverage}>
    <div className="chart-axis" aria-hidden="true">{[3, 2, 1, 0].map((step) =>
      <span key={step}>{number.format(step * band)} ms</span>)}</div>
    <div className="plot-frame">
      <div className="plot-grid" aria-hidden="true"><i /><i /><i /><i /></div>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
        <path d={path} className="trend-line" vectorEffect="non-scaling-stroke" />
        {points.map(({ at, x, y, latency }) => <g key={at}>
          <title>{dateTime(Math.max(start, at) * 1000)} · {number.format(latency)} ms</title>
          <circle className="chart-point" cx={x} cy={y} r="2.8" />
          <circle cx={x} cy={y} r="10" fill="transparent" />
        </g>)}
      </svg>
      <div className="chart-ticks" aria-hidden="true">{[0, 1, 2, 3, 4].map((step) =>
        <span key={step}>{tickFormat.format((start + seconds * step / 4) * 1000)}</span>)}</div>
    </div>
  </figure>;
}

function CheckTable({ samples }: { samples: Probe[] }) {
  const { t, detail, dateTime, number } = useLocale();
  return <details className="probe-details">
    <summary>{t.checkDetails}<ChevronDown size={16} aria-hidden="true" /></summary>
    <table className="observation-table">
      <thead><tr><th scope="col">{t.time}</th><th scope="col">{t.result}</th><th scope="col">{t.latency}</th></tr></thead>
      <tbody>{samples.map((sample, index) => <tr key={index}>
        <td>{dateTime(sample.at)}</td><td className={sample.ok ? "result-ok" : "form-error"}>{detail(sample.reason)}</td>
        <td>{number.format(sample.latency)} ms</td>
      </tr>)}</tbody>
    </table>
  </details>;
}

export function IncidentList({ incidents, at, compact = false }: { incidents: Incident[]; at: string; compact?: boolean }) {
  const { t, locale, dateTime, detail, number } = useLocale();
  if (!incidents.length) return <p className="empty-panel"><CircleCheck size={20} />{t.noIncidents}</p>;
  const units = (["day", "hour", "minute", "second"] as const).map((unit) =>
    new Intl.NumberFormat(locale, { style: "unit", unit, unitDisplay: "short" }));

  return <div className="incident-list">
    <div className="incident-columns" aria-hidden="true"><span>{t.timestamp}</span><span>{t.duration}</span>
      <span>{t.cause}</span><span>{t.status}</span><span /></div>
    {incidents.map((incident) => {
      const state = incident.archived ? "waiting" : incident.closed_at ? "healthy" : "down";
      const label = incident.archived ? t.archived : incident.closed_at ? t.recovered : t.ongoing;
      const seconds = Math.max(0, Math.floor((new Date(incident.closed_at ?? at).getTime() - new Date(incident.opened_at).getTime()) / 1000));
      const parts = [Math.floor(seconds / 86400), Math.floor(seconds / 3600) % 24, Math.floor(seconds / 60) % 60, seconds % 60];
      const duration = parts.flatMap((value, index) => value ? [units[index].format(value)] : []).slice(0, 2).join(" ") || units[3].format(0);
      return <details key={incident.id} className="incident">
        <summary>
          <time dateTime={new Date(incident.opened_at).toISOString()}>{dateTime(incident.opened_at)}</time>
          <span className="incident-duration">{duration}</span>
          <span className="incident-cause">{!compact && <strong>{incident.service} · {incident.monitor}</strong>}{detail(incident.reason)}</span>
          <HealthBadge health={state} label={label} /><ChevronDown className="incident-chevron" size={17} aria-hidden="true" />
        </summary>
        <div className="incident-details">
          {incident.closed_at && <p>{incident.archived ? t.archivedAt : t.recoveredAt} {dateTime(incident.closed_at)}</p>}
          {incident.deliveries.length ? <ul>{incident.deliveries.map((delivery) =>
            <li key={delivery.id}><strong>{delivery.channel} · {delivery.event === "down" ? t.failureEvent : t.recoveryEvent}</strong>
              <span className={delivery.status === "failed" ? "form-error" : undefined}>
                {delivery.status === "sent" ? t.sent : delivery.status === "pending" ? t.pending : t.deliveryFailed}
                {" · "}{t.attempts} {number.format(delivery.attempts)}{delivery.error && ` · ${detail(delivery.error)}`}
              </span></li>)}</ul> : <p>{t.noDeliveries}</p>}
        </div>
      </details>;
    })}
  </div>;
}
