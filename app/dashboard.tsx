"use client";

import {
  Activity, ArrowLeft, Bell, Check, ChevronRight, CircleAlert, CircleUserRound, LayoutGrid,
  LogOut, Mail, Moon, Pencil, Plus, RefreshCw, Search, ShieldCheck, Sun, Webhook,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Channel, Monitor, Snapshot } from "./dashboard-data.ts";
import { ConfigurationDialog, TokenDialog, type Edit } from "./dialogs.tsx";
import { HealthBadge, IncidentList, MonitorDetail, SampleStrip } from "./monitor-detail.tsx";
import { LanguagePicker, useLocale } from "./locale-provider.tsx";

const tabs = [
  { id: "overview", short: "shortOverview", icon: LayoutGrid },
  { id: "incidents", short: "shortIncidents", icon: CircleAlert },
  { id: "channels", short: "shortChannels", icon: Bell },
] as const;
type Tab = typeof tabs[number]["id"];
const filters = [
  { value: "all", label: "all" }, { value: "healthy", label: "up" },
  { value: "down", label: "down" }, { value: "waiting", label: "waiting" },
] as const;
type Filter = typeof filters[number]["value"];
const priority = { down: 0, waiting: 1, healthy: 2 };

async function mutate(data: Record<string, unknown>) {
  const response = await fetch("/api/dashboard", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "操作失败");
  return result as { token?: string };
}

export function Dashboard({ user }: { user: { name: string; isAdmin: boolean } }) {
  const { t, locale, number, dateTime, detail } = useLocale();
  const [{ tab, id: selectedId }, setLocation] = useState<{ tab: Tab; id?: string }>({ tab: "overview" });
  const [incidentPage, setIncidentPage] = useState(1);
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [connectionError, setConnectionError] = useState("");
  const [notice, setNotice] = useState<"saved" | "refreshed">();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [defaultMonitor, setDefaultMonitor] = useState<string>();
  const [edit, setEdit] = useState<Edit>();
  const [refreshing, setRefreshing] = useState(false);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [dark, setDark] = useState(false);
  const [token, setToken] = useState("");
  const listTitle = useRef<HTMLHeadingElement>(null);
  const detailTop = useRef<HTMLAnchorElement>(null);
  const pendingFocus = useRef(false);

  useEffect(() => {
    setDark(localStorage.getItem("watcher-theme") === "dark");
    const readLocation = () => {
      const [hash, id] = window.location.hash.slice(1).split("/");
      const tab = tabs.find((item) => item.id === hash)?.id ?? "overview";
      setLocation({ tab, id: tab === "overview" ? id : undefined });
    };
    readLocation();
    window.addEventListener("hashchange", readLocation);
    return () => window.removeEventListener("hashchange", readLocation);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(undefined), 3500);
    return () => clearTimeout(timer);
  }, [notice]);

  const requestedPage = tab === "incidents" ? incidentPage : 1;
  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(`/api/dashboard?incidentPage=${requestedPage}`, { cache: "no-store", signal });
      const result = await response.json();
      if (signal?.aborted) return false;
      if (!response.ok) {
        setConnectionError(result.error || "无法连接监控平台");
        return false;
      }
      const incoming = result as Snapshot;
      setSnapshot((existing) => existing && new Date(existing.at) > new Date(incoming.at) ? existing : incoming);
      setConnectionError("");
      return true;
    } catch {
      if (!signal?.aborted) setConnectionError("无法连接监控平台");
      return false;
    }
  }, [requestedPage]);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function update() {
      if (document.visibilityState === "visible") await refresh(controller.signal);
      if (!controller.signal.aborted) timer = setTimeout(update, 2000);
    }
    void update();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [refresh]);

  async function manualRefresh() {
    setRefreshing(true);
    try {
      if (await refresh()) {
        setNotice("refreshed");
        setHistoryVersion((version) => version + 1);
      }
    } finally {
      setRefreshing(false);
    }
  }

  async function commit(data: Record<string, unknown>) {
    const result = await mutate(data);
    setEdit(undefined);
    if (result.token) setToken(result.token);
    setNotice("saved");
    await refresh();
    setHistoryVersion((version) => version + 1);
  }

  async function runAction(action: string, id: string, prompt: string) {
    if (window.confirm(prompt)) await commit({ action, id });
  }

  const overview = tab === "overview";
  const services = snapshot?.services ?? [];
  const monitors = snapshot?.monitors ?? [];
  const match = query.trim().toLocaleLowerCase(locale);
  const groups = services.map((service) => {
    const checks = monitors.filter(({ service_id }) => service_id === service.id);
    const visible = checks.filter((monitor) => (filter === "all" || monitor.state === filter) &&
      [service.name, monitor.name].some((name) => name.toLocaleLowerCase(locale).includes(match)));
    const rank = checks.length ? Math.min(...checks.map(({ state }) => priority[state])) : priority.waiting;
    return { service, checks: visible.sort((a, b) => priority[a.state] - priority[b.state]), rank,
      empty: !checks.length && filter === "all" && service.name.toLocaleLowerCase(locale).includes(match) };
  }).filter(({ checks, empty }) => checks.length || empty).sort((a, b) => a.rank - b.rank);
  const activeId = selectedId ?? defaultMonitor;
  const selectedGroup = groups.find(({ checks }) => checks.some(({ id }) => id === activeId))
    ?? groups.find(({ checks }) => checks.length);
  const selected = selectedGroup?.checks.find(({ id }) => id === activeId) ?? selectedGroup?.checks[0];
  const showMobileDetail = Boolean(selected && selected.id === selectedId);
  const down = monitors.filter(({ state }) => state === "down").length;
  const healthy = monitors.filter(({ state }) => state === "healthy").length;
  const waiting = monitors.length - down - healthy;
  const totalStatus = down ? "down" : waiting || !monitors.length ? "waiting" : "healthy";
  const headline = down ? t.downSummary(down, number.format(down)) : waiting ? t.waitingSummary(waiting, number.format(waiting)) :
    monitors.length ? t.allHealthy : t.noMonitors;

  useEffect(() => {
    if (!selectedId && selected && !monitors.some(({ id }) => id === defaultMonitor)) setDefaultMonitor(selected.id);
  }, [defaultMonitor, monitors, selected, selectedId]);

  useEffect(() => {
    if (!overview || !pendingFocus.current) return;
    const node = showMobileDetail ? detailTop.current : listTitle.current;
    pendingFocus.current = false;
    node?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [overview, selectedId, showMobileDetail]);

  function focusMobile() {
    pendingFocus.current = window.matchMedia("(max-width: 900px)").matches;
  }

  function changeAppearance() {
    localStorage.setItem("watcher-theme", dark ? "light" : "dark");
    setDark(!dark);
  }

  const canAdd = user.isAdmin && snapshot && tab !== "incidents";
  const addLabel = overview ? t.addService : t.addChannel;
  const openAdd = () => setEdit({ type: overview ? "service" : "channel" });
  const refreshIcon = <RefreshCw size={17} className={refreshing ? "motion-safe:animate-spin" : undefined} />;

  return <div className="app-shell" data-appearance={dark ? "dark" : "light"}>
    <div className="content"><header className="mast">
      <a className="brand" href="#overview"><span className="brand-mark"><Activity size={21} /></span>Watcher</a>
      <Navigation tab={tab} />
      <div className="account">
        <LanguagePicker />
        {canAdd && <button className="primary-action mast-add" onClick={openAdd}><Plus size={17} />{addLabel}</button>}
        <details className="account-menu">
          <summary className="icon-control" aria-label={t.account}><CircleUserRound size={21} /></summary>
          <div className="account-popover">
            <strong>{user.name}</strong>
            {canAdd && <button className="quiet-action menu-add" onClick={openAdd}><Plus size={17} />{addLabel}</button>}
            <button className="quiet-action" disabled={refreshing} onClick={() => void manualRefresh()}>{refreshIcon}{t.refresh}</button>
            <button className="quiet-action" onClick={changeAppearance}>{dark ? <Sun size={17} /> : <Moon size={17} />}{dark ? t.light : t.dark}</button>
            <form action="/api/logout" method="post"><button className="quiet-action"><LogOut size={17} />{t.signOut}</button></form>
          </div>
        </details>
      </div>
    </header></div>
    <Navigation tab={tab} mobile />

    <main className="content main-content">
      <h1 className={overview ? "overview-title" : "page-title"}>{t[tab]}</h1>
      {connectionError && <p className="feedback" role="alert"><CircleAlert size={18} />{detail(connectionError)}</p>}
      {notice && <div className="toast-notice" role="status"><Check size={18} />{t[notice]}<button className="quiet-action" onClick={() => setNotice(undefined)}>{t.close}</button></div>}
      {!snapshot && !connectionError && <p className="empty-panel" role="status"><span className="spinner" />{t.loading}</p>}

      {snapshot && overview && <div className="monitor-layout" data-detail={showMobileDetail}>
        <section className="panel monitor-directory" aria-labelledby="monitor-list">
          <div className="mobile-summary" aria-label={t.statusSummary}>
            <span className={`summary-symbol ${totalStatus}`}>{down ? <CircleAlert size={21} /> : <ShieldCheck size={21} />}</span>
            <div><strong>{headline}</strong><p>{number.format(healthy)} {t.up} · {number.format(waiting)} {t.waiting}</p></div>
          </div>
          <div className="directory-heading">
            <h2 id="monitor-list" tabIndex={-1} ref={listTitle}>{t.monitors} <span className="count">{number.format(monitors.length)}</span></h2>
            <button className="icon-control" aria-label={t.refresh} title={t.refresh} disabled={refreshing} onClick={() => void manualRefresh()}>{refreshIcon}</button>
          </div>
          <label className="search"><Search size={17} aria-hidden="true" /><input type="search" value={query}
            onChange={(event) => setQuery(event.target.value)} aria-label={t.search} placeholder={t.search} /></label>
          <div className="segments status-filters" role="group" aria-label={t.filter}>{filters.map(({ value, label }) =>
            <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{t[label]}</button>)}</div>
          {groups.map(({ service, checks }) => <section key={service.id} className="service-block">
            <div className="service-heading">
              <h3>{service.name}</h3>
              {user.isAdmin && <div className="service-actions">
                <button className="icon-control" title={t.addMonitor} aria-label={`${t.addMonitor} · ${service.name}`} onClick={() => setEdit({ type: "monitor", service })}><Plus size={16} /></button>
                <button className="icon-control" title={t.editService} aria-label={`${t.editService} · ${service.name}`} onClick={() => setEdit({ type: "service", value: service })}><Pencil size={14} /></button>
              </div>}
            </div>
            <div className="service-monitors">{checks.map((monitor) =>
              <a key={monitor.id} className="monitor-link" href={`#overview/${monitor.id}`}
                aria-current={selected?.id === monitor.id ? "location" : undefined} onClick={focusMobile}>
                <div className="monitor-line">
                  <span className={`signal-dot ${monitor.state}`} aria-hidden="true" />
                  <strong>{monitor.name}</strong>
                  <HealthBadge health={monitor.state} />
                  <ChevronRight className="monitor-chevron" size={17} aria-hidden="true" />
                </div>
                {monitor.kind === "http" ? <SampleStrip samples={monitor.probe_history} compact /> :
                  <span className="monitor-subtitle">{monitor.last_signal_at ? `${t.lastHeartbeat} · ${dateTime(monitor.last_signal_at)}` : t.noneReceived}</span>}
              </a>)}</div>
            {!checks.length && <p className="empty-panel">{t.emptyService}</p>}
          </section>)}
          {!groups.length && <p className="empty-panel">{services.length ? t.noMatches : t.noServices}</p>}
          <p className="last-sync"><time dateTime={new Date(snapshot.at).toISOString()}>{connectionError ? t.lastSync : t.updated} · {dateTime(snapshot.at)}</time></p>
        </section>

        <section className="monitor-workspace" aria-label={selected?.name ?? t.monitors}>
          <a ref={detailTop} className="soft-action back-to-monitors" href="#overview" onClick={focusMobile}><ArrowLeft size={17} />{t.backToMonitors}</a>
          {selected && selectedGroup ? <MonitorDetail key={selected.id} monitor={selected} service={selectedGroup.service}
            historyVersion={historyVersion} onEdit={user.isAdmin ? setEdit : undefined} /> :
            <div className="panel empty-panel">{t.selectMonitor}</div>}
        </section>
      </div>}

      {snapshot && tab === "incidents" && <section className="panel" aria-label={t.incidents}>
        {snapshot.incidentPage !== incidentPage ? <p className="empty-panel" role="status"><span className="spinner" />{t.loading}</p> :
          <IncidentList incidents={snapshot.incidents} at={snapshot.at} />}
        {(incidentPage > 1 || snapshot.hasMoreIncidents) && <div className="pagination" aria-label={t.pagination}>
          <button className="soft-action" disabled={incidentPage <= 1} onClick={() => setIncidentPage((page) => page - 1)}>{t.previous}</button>
          <span>{t.page} {number.format(incidentPage)}</span>
          <button className="soft-action" disabled={snapshot.incidentPage !== incidentPage || !snapshot.hasMoreIncidents}
            onClick={() => setIncidentPage((page) => page + 1)}>{t.next}</button>
        </div>}
      </section>}

      {snapshot && tab === "channels" && <section className="panel" aria-label={t.channels}>
        {snapshot.channels.length ? snapshot.channels.map((channel) =>
          <ChannelRow key={channel.id} channel={channel} onEdit={user.isAdmin ? setEdit : undefined} />) :
          <div className="empty-panel"><Bell size={21} /><strong>{t.noChannels}</strong>
            {user.isAdmin && <button className="soft-action" onClick={openAdd}><Plus size={17} />{t.addChannel}</button>}
          </div>}
      </section>}
    </main>
    {edit && <ConfigurationDialog edit={edit} channels={snapshot?.channels ?? []} onClose={() => setEdit(undefined)} onSave={commit} onAction={runAction} />}
    {token && <TokenDialog token={token} onClose={() => setToken("")} />}
  </div>;
}

function Navigation({ tab, mobile = false }: { tab: Tab; mobile?: boolean }) {
  const { t } = useLocale();
  return <nav className={`glass-dock ${mobile ? "mobile-dock" : "desktop-dock"}`} aria-label={t.navigation}>
    {tabs.map(({ id, short, icon: Icon }) =>
      <a key={id} href={`#${id}`} aria-current={tab === id ? "page" : undefined}>
        <Icon size={18} aria-hidden="true" />{t[mobile ? short : id]}
      </a>)}
  </nav>;
}

function ChannelRow({ channel, onEdit }: { channel: Channel; onEdit?: (edit: Edit) => void }) {
  const { t } = useLocale();
  const Icon = { bark: Bell, webhook: Webhook, email: Mail }[channel.kind];
  return <div className="channel">
    <span className="entity-icon"><Icon size={19} /></span>
    <div><strong>{channel.name}</strong><p>{({ bark: "Bark", webhook: "Webhook", email: t.email })[channel.kind]}</p></div>
    {onEdit && <button className="icon-control" aria-label={`${t.editChannel} · ${channel.name}`}
      onClick={() => onEdit({ type: "channel", value: channel })}><Pencil size={17} /></button>}
  </div>;
}
