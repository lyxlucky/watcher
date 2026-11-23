"use client";

import { Activity, Github } from "lucide-react";
import { LanguagePicker, useLocale } from "./locale-provider.tsx";

export function Login({ configured, login }: { configured: boolean; login: () => Promise<void> }) {
  const { t } = useLocale();
  return <div className="app-shell">
    <div className="content"><header className="mast">
      <span className="brand"><span className="brand-mark"><Activity size={21} /></span>Watcher</span>
      <LanguagePicker />
    </header></div>
    <main className="login-main">
      <section className="panel login-panel">
        <h1>{t.loginTitle}</h1>
        <p>{t.loginDescription}</p>
        <form action={login}>
          <button className="primary-action w-full" disabled={!configured}><Github size={18} />{t.login}</button>
        </form>
        {!configured && <p role="status">{t.loginUnavailable}</p>}
      </section>
    </main>
  </div>;
}
