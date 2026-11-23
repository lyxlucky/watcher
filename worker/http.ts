import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";
import { Agent, request } from "undici";
import type { DueProbe, ProbeResult } from "./monitoring.ts";

function isPublicAddress(address: string) {
  const ip = ipaddr.process(address);
  if (ip.range() !== "unicast") return false;
  return ip.kind() === "ipv4" || (ip as ipaddr.IPv6).match(ipaddr.IPv6.parse("2000::"), 3);
}

export function publicUrl(input: string) {
  const url = new URL(input);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.hash) {
    throw new Error("请输入不带登录凭据或片段的 HTTP(S) 地址");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) ? !isPublicAddress(host) : !host.includes(".") || /(?:^|\.)(localhost|local|internal)\.?$/i.test(host)) {
    throw new Error("请输入公网地址");
  }
  return url;
}

const dispatcher = new Agent({
  connect: {
    timeout: 5000,
    lookup(host, options, done) {
      void lookup(host, { all: true, family: options.family }).then((addresses) => {
        if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
          throw Object.assign(new Error("目标解析到非公网地址"), { code: "ERR_NON_PUBLIC_ADDRESS" });
        }
        if (options.all) done(null, addresses);
        else done(null, addresses[0].address, addresses[0].family);
      }, (error: NodeJS.ErrnoException) => done(error, "", 0)).catch((error: NodeJS.ErrnoException) => done(error, "", 0));
    },
  },
});

export async function requestStatus(input: string, options: { method?: "GET" | "POST"; headers?: Record<string, string>; body?: string } = {}) {
  const { statusCode, body } = await request(publicUrl(input), { ...options, dispatcher, signal: AbortSignal.timeout(5000) });
  // Destroying an unread Undici body emits an asynchronous abort error.
  body.on("error", () => {}).destroy();
  return statusCode;
}

export function expectedStatuses(input: string) {
  const statuses = input.trim().toLowerCase().split(/\s*,\s*/);
  if (!statuses.length || statuses.length > 20 || !statuses.every((status) => /^[1-5](\d\d|xx)$/.test(status))) {
    throw new Error("状态码格式应为 2xx 或 200,204,3xx");
  }
  return [...new Set(statuses)].join(",");
}

export async function probeTarget(probe: DueProbe): Promise<ProbeResult> {
  const started = performance.now();
  try {
    const statusCode = await requestStatus(probe.target_url);
    const ok = probe.expected_status.split(",").some((status) =>
      status === String(statusCode) || status === `${Math.trunc(statusCode / 100)}xx`);
    return { status: statusCode, ok, latency: Math.round(performance.now() - started), reason: `HTTP ${statusCode}` };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    const timeout = error instanceof Error && (error.name === "TimeoutError" || /TIMEOUT/.test(String(code)));
    const reason = code === "ERR_NON_PUBLIC_ADDRESS" ? "目标未解析到公网地址" : timeout ? "请求超时" : "网络请求失败";
    return { status: null, ok: false, latency: Math.round(performance.now() - started), reason };
  }
}
