import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { LocaleProvider } from "./locale-provider.tsx";
import { localeCookie, preferredLocale } from "./locale.ts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Watcher",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()]);
  const locale = preferredLocale(cookieStore.get(localeCookie)?.value, requestHeaders.get("accept-language") ?? "");
  return <html lang={locale}><body><LocaleProvider initialLocale={locale}>{children}</LocaleProvider></body></html>;
}
