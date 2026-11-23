"use client";

import { Globe2 } from "lucide-react";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { localeCookie, locales, localizeDetail, messages, type Locale } from "./locale.ts";

function localeTools(locale: Locale) {
  const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "medium" });
  return {
    locale,
    t: messages[locale],
    timeZone: dateTime.resolvedOptions().timeZone,
    dateTime: (value: string | number) => dateTime.format(new Date(value)),
    time: new Intl.DateTimeFormat(locale, { timeStyle: "medium" }),
    number: new Intl.NumberFormat(locale),
    percent: new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 2 }),
    detail: (value: string) => localizeDetail(locale, value),
  };
}

const LocaleContext = createContext<(ReturnType<typeof localeTools> & { changeLocale: (locale: Locale) => void }) | null>(null);

export function LocaleProvider({ initialLocale, children }: { initialLocale: Locale; children: ReactNode }) {
  const [locale, setLocale] = useState(initialLocale);
  const value = useMemo(() => ({
    ...localeTools(locale),
    changeLocale(next: Locale) {
      document.cookie = `${localeCookie}=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
      document.documentElement.lang = next;
      setLocale(next);
    },
  }), [locale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("LocaleProvider is required");
  return value;
}

export function LanguagePicker() {
  const { locale, t, changeLocale } = useLocale();
  return <label className="locale-control">
    <Globe2 size={16} aria-hidden="true" /><span aria-hidden="true">{locales[locale]}</span>
    <select aria-label={t.language} value={locale} onChange={(event) => changeLocale(event.target.value as Locale)}>
      {Object.entries(locales).map(([code, label]) => <option key={code} value={code} lang={code}>{label}</option>)}
    </select>
  </label>;
}
