"use client";

import { Copy, KeyRound, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { Channel, Monitor, Service } from "./dashboard-data.ts";
import { useLocale } from "./locale-provider.tsx";

export type Edit = { type: "service"; value?: Service } | { type: "channel"; value?: Channel } |
  { type: "monitor"; service: Service; value?: Monitor };

function Modal({ title, onClose, children, busy = false }: { title: string; onClose: () => void; children: ReactNode; busy?: boolean }) {
  const { t } = useLocale();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="sheet" aria-labelledby="dialog-title" onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <div className="p-6">
      <div className="dialog-heading"><h2 id="dialog-title">{title}</h2><button className="icon-control" aria-label={t.close} onClick={onClose} disabled={busy}><X size={19} /></button></div>
      {children}
    </div>
  </dialog>;
}

export function ConfigurationDialog({ edit, channels, onClose, onSave, onAction }: {
  edit: Edit; channels: Channel[]; onClose: () => void;
  onSave: (data: Record<string, unknown>) => Promise<void>; onAction: (action: string, id: string, question: string) => Promise<void>;
}) {
  const { t, locale, detail } = useLocale();
  const [kind, setKind] = useState(edit.type === "monitor" ? edit.value?.kind ?? "http" : edit.type === "channel" ? edit.value?.kind ?? "bark" : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const title = (edit.value
    ? { service: t.editService, monitor: t.editMonitor, channel: t.editChannel }
    : { service: t.addService, monitor: t.addMonitor, channel: t.addChannel })[edit.type];
  const archiveQuestion = locale === "zh-CN" ? `确定归档「${edit.value?.name}」？` : `Archive “${edit.value?.name}”?`;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError("");
    setBusy(true);
    try {
      await onSave({ action: `save-${edit.type}`, id: edit.value?.id, name: form.get("name"), kind,
        serviceId: edit.type === "monitor" ? edit.service.id : undefined, target: form.get("target") ?? "",
        expected: form.get("expected") ?? "2xx", channelIds: form.getAll("channels") });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t.saveFailed);
    } finally {
      setBusy(false);
    }
  }

  async function action(name: string, question: string) {
    if (!edit.value) return;
    setError("");
    setBusy(true);
    try { await onAction(name, edit.value.id, question); }
    catch (failure) { setError(failure instanceof Error ? failure.message : t.actionFailed); }
    finally { setBusy(false); }
  }

  return <Modal title={title} onClose={onClose} busy={busy}>
    <form onSubmit={submit} className="form-stack">
      <label>{t.name}<input className="field" name="name" defaultValue={edit.value?.name} maxLength={80} required autoFocus /></label>
      {edit.type === "monitor" && <>
        <label>{t.collectionMethod}<select className="field" value={kind} onChange={(event) => setKind(event.target.value)} disabled={Boolean(edit.value)}>
          <option value="http">{t.activeHttp}</option><option value="ws">{t.passiveWebSocket}</option>
        </select></label>
        {kind === "http" ? <>
          <label>{t.probeTarget}<input className="field" name="target" type="url" maxLength={2048} placeholder="https://example.com/health" defaultValue={edit.value?.target_url ?? ""} required /></label>
          <label>{t.expectedStatus}<input className="field" name="expected" maxLength={128} defaultValue={edit.value?.expected_status ?? "2xx"} required /><small>{t.expectedHint}</small></label>
        </> : <p className="field-note">{t.passiveHint}</p>}
        <fieldset><legend>{t.channels}</legend>{channels.length ? <div className="channel-picker">{channels.map((channel) => (
          <label key={channel.id}><input className="size-5 accent-teal-300" type="checkbox" name="channels" value={channel.id} defaultChecked={edit.value?.channel_ids.includes(channel.id)} />{channel.name}</label>
        ))}</div> : <p className="field-note">{t.noChannelChoices}</p>}</fieldset>
      </>}
      {edit.type === "channel" && <>
        <label>{t.channelKind}<select className="field" value={kind} onChange={(event) => setKind(event.target.value)} disabled={Boolean(edit.value)}>
          <option value="bark">Bark</option><option value="webhook">Webhook</option><option value="email">{t.email}</option>
        </select></label>
        <label key={kind}>{kind === "email" ? t.recipient : kind === "bark" ? t.barkUrl : t.webhookUrl}
          <input className="field" type={kind === "email" ? "email" : "url"} name="target" required={!edit.value} maxLength={2048}
            placeholder={edit.value ? t.retainTarget : kind === "email" ? "team@example.com" : kind === "bark" ? "https://api.day.app/device-key" : "https://example.com/webhook"} />
        </label>
      </>}
      {error && <p className="form-error" role="alert">{detail(error)}</p>}
      <div className="dialog-footer">
        {edit.value && <button className="quiet-action form-error" type="button" disabled={busy} onClick={() => void action(`archive-${edit.type}`, archiveQuestion)}><Trash2 size={16} />{t.archive}</button>}
        {edit.type === "monitor" && edit.value?.kind === "ws" && <button className="quiet-action" type="button" disabled={busy} onClick={() => void action("rotate-token", t.rotateQuestion)}><KeyRound size={16} />{t.rotateToken}</button>}
        <button className="primary-action" disabled={busy}>{busy ? t.saving : t.save}</button>
      </div>
    </form>
  </Modal>;
}

export function TokenDialog({ token, onClose }: { token: string; onClose: () => void }) {
  const { t } = useLocale();
  const [message, setMessage] = useState<"tokenCopied" | "copyFailed">();
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
  const socketUrl = local ? "ws://127.0.0.1:3001/api/heartbeat" :
    `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/api/heartbeat`;

  async function copy() {
    try { await navigator.clipboard.writeText(token); setMessage("tokenCopied"); }
    catch { setMessage("copyFailed"); }
  }

  return <Modal title={t.accessToken} onClose={onClose}>
    <div className="form-stack">
      <p>{t.tokenHint}</p>
      <label>WebSocket 地址<input className="field" readOnly value={socketUrl} /></label>
      <label>{t.token}<input className="field font-mono" readOnly value={token} onFocus={(event) => event.target.select()} /></label>
      <p className="field-note" role="status">{message && t[message]}</p>
      <div className="dialog-footer"><button className="soft-action" onClick={() => void copy()}><Copy size={16} />{t.copyToken}</button><button className="primary-action" onClick={onClose}>{t.done}</button></div>
    </div>
  </Modal>;
}
