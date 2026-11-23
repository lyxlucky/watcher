export const locales = { "zh-CN": "简体中文", "en-US": "English" } as const;
export type Locale = keyof typeof locales;
export const localeCookie = "watcher-locale";

export function preferredLocale(saved?: string, acceptLanguage = ""): Locale {
  if (saved === "zh-CN" || saved === "en-US") return saved;
  const preferences = acceptLanguage.split(",").map((entry) => {
    const [tag, quality] = entry.trim().toLowerCase().split(";");
    return { language: tag.split("-")[0], weight: quality ? Number(quality.trim().replace(/^q=/, "")) : 1 };
  }).sort((a, b) => b.weight - a.weight);
  const match = preferences.find(({ language, weight }) => weight > 0 && (language === "zh" || language === "en"));
  return match?.language === "en" ? "en-US" : "zh-CN";
}

const zh = {
  overview: "监控总览", incidents: "故障记录", channels: "通知渠道", shortOverview: "总览", shortIncidents: "故障", shortChannels: "通知",
  navigation: "功能导航", language: "界面语言", refresh: "刷新监控数据", light: "切换至浅色", dark: "切换至深色",
  signOut: "退出登录", account: "账户与显示设置", addService: "添加服务", addChannel: "添加渠道",
  loading: "正在读取监控数据", connectionError: "无法连接监控平台", refreshed: "监控数据已刷新", saved: "配置已保存", close: "关闭",
  statusSummary: "全局监控状态", healthy: "运行正常", down: "异常", waiting: "等待接入", all: "全部", up: "正常",
  noMonitors: "等待接入监控", allHealthy: "所有监控运行正常", updated: "更新于", lastSync: "最后同步",
  downSummary: (_count: number, label: string) => `${label} 项监控异常`,
  waitingSummary: (_count: number, label: string) => `${label} 项监控等待接入`,
  monitors: "监控项", search: "搜索服务或监控项", filter: "按状态筛选", addMonitor: "添加监控项", editMonitor: "编辑监控项",
  editService: "编辑服务", editChannel: "编辑通知渠道", noServices: "暂无服务", noMatches: "没有匹配的监控项",
  emptyService: "尚未配置监控项", selectMonitor: "选择一个监控项查看详情", backToMonitors: "返回监控列表",
  activeCheck: "主动探测", passiveCheck: "被动接入", probeInterval: "每 30 秒探测", heartbeatInterval: "每 5 秒发送心跳",
  expectedStatus: "健康状态码", responseTime: "响应时间", averageResponse: "平均响应时间", successRate: "探测成功率",
  lastCheck: "最后探测时间", lastHeartbeat: "最近心跳", noneReceived: "尚未收到", noCheck: "等待首次探测",
  recentChecks: "最近探测", checks: "探测记录", failedChecks: "失败次数", noSamples: "此时段暂无探测记录",
  noLatency: "此时段暂无成功探测", range: "时间范围", range1h: "1 小时", range24h: "24 小时", range7d: "7 天",
  bucketAverage: "每个时间段内成功探测的平均响应时间", ok: "成功", failed: "失败", noData: "无数据",
  time: "时间", result: "结果", checkDetails: "探测明细", latency: "响应延迟", recentIncidents: "最近故障",
  viewAll: "查看全部", noIncidents: "暂无故障记录", loadingHistory: "正在读取监控历史", historyError: "无法读取监控历史",
  timestamp: "故障时间", duration: "持续时间", cause: "故障原因", status: "状态", archived: "已归档", recovered: "已恢复", ongoing: "进行中",
  archivedAt: "归档于", recoveredAt: "恢复于", failureEvent: "故障", recoveryEvent: "恢复", sent: "已发送",
  pending: "待发送", deliveryFailed: "投递失败", attempts: "投递次数", noDeliveries: "没有通知投递记录",
  pagination: "故障记录分页", previous: "上一页", next: "下一页", page: "页码", noChannels: "暂无通知渠道",
  channel: "通知渠道", email: "邮件", name: "名称", collectionMethod: "采集方式", activeHttp: "主动 HTTP 探测",
  passiveWebSocket: "被动 WebSocket 接入", probeTarget: "探测地址", expectedHint: "例如 2xx 或 200,204,3xx",
  passiveHint: "客户端每 5 秒发送应用心跳。首次创建或重新生成时会显示接入令牌。",
  noChannelChoices: "暂无可选渠道。可在通知渠道页面添加。", channelKind: "渠道类型", recipient: "收件邮箱",
  barkUrl: "Bark 推送链接", webhookUrl: "Webhook 地址", retainTarget: "留空保留现有配置", save: "保存", saving: "处理中",
  archive: "归档", rotateToken: "重置令牌", rotateQuestion: "生成新令牌后，旧令牌立即失效。继续吗？",
  saveFailed: "保存失败", actionFailed: "操作失败", accessToken: "被动接入令牌",
  tokenHint: "请在关闭前保存令牌。客户端连接时将它作为 Bearer 令牌发送。", token: "令牌", tokenCopied: "令牌已复制",
  copyFailed: "无法访问剪贴板，请手动复制", copyToken: "复制令牌", done: "完成",
  loginTitle: "登录 Watcher", loginDescription: "查看服务健康状态、故障记录和告警投递。", login: "使用 GitHub 登录",
  loginUnavailable: "GitHub 登录尚未配置。",
};

const en: typeof zh = {
  overview: "Overview", incidents: "Incidents", channels: "Notification channels", shortOverview: "Overview", shortIncidents: "Incidents",
  shortChannels: "Notifications", navigation: "Main navigation", language: "Display language", refresh: "Refresh monitoring data",
  light: "Switch to light mode", dark: "Switch to dark mode", signOut: "Sign out", account: "Account and display settings",
  addService: "Add service", addChannel: "Add channel", loading: "Loading monitoring data", connectionError: "Unable to connect to Watcher",
  refreshed: "Monitoring data refreshed", saved: "Configuration saved", close: "Close", statusSummary: "Monitoring status",
  healthy: "Operational", down: "Down", waiting: "Awaiting connection", all: "All", up: "Up",
  noMonitors: "Awaiting monitors", allHealthy: "All monitors operational", updated: "Updated", lastSync: "Last synced",
  downSummary: (count, label) => `${label} ${count === 1 ? "monitor" : "monitors"} down`,
  waitingSummary: (count, label) => `${label} ${count === 1 ? "monitor" : "monitors"} awaiting connection`,
  monitors: "Monitors", search: "Search services or monitors", filter: "Filter by status", addMonitor: "Add monitor",
  editMonitor: "Edit monitor", editService: "Edit service", editChannel: "Edit notification channel", noServices: "No services yet",
  noMatches: "No matching monitors", emptyService: "No monitors configured", selectMonitor: "Select a monitor to view its details",
  backToMonitors: "Back to monitors", activeCheck: "Active check", passiveCheck: "Passive monitoring", probeInterval: "Checked every 30 seconds",
  heartbeatInterval: "Heartbeat sent every 5 seconds", expectedStatus: "Expected status codes", responseTime: "Response time",
  averageResponse: "Average response time", successRate: "Check success rate", lastCheck: "Last check", lastHeartbeat: "Last heartbeat",
  noneReceived: "None received yet", noCheck: "Awaiting first check", recentChecks: "Recent checks", checks: "Checks",
  failedChecks: "Failed checks", noSamples: "No checks in this period", noLatency: "No successful checks in this period",
  range: "Time range", range1h: "1 hour", range24h: "24 hours", range7d: "7 days", bucketAverage: "Average response time of successful checks in each interval",
  ok: "Successful", failed: "Failed", noData: "No data", time: "Time", result: "Result", checkDetails: "Check details",
  latency: "Latency", recentIncidents: "Recent incidents", viewAll: "View all", noIncidents: "No incidents yet", loadingHistory: "Loading monitor history",
  historyError: "Unable to load monitor history", timestamp: "Started", duration: "Duration", cause: "Cause", status: "Status",
  archived: "Archived", recovered: "Recovered", ongoing: "Ongoing", archivedAt: "Archived at", recoveredAt: "Recovered at",
  failureEvent: "Failure", recoveryEvent: "Recovery", sent: "Sent", pending: "Pending", deliveryFailed: "Delivery failed",
  attempts: "Delivery attempts", noDeliveries: "No notification deliveries", pagination: "Incident pagination", previous: "Previous",
  next: "Next", page: "Page", noChannels: "No notification channels yet", channel: "Notification channels", email: "Email",
  name: "Name", collectionMethod: "Monitoring method", activeHttp: "Active HTTP checks", passiveWebSocket: "Passive WebSocket monitoring",
  probeTarget: "Check endpoint", expectedHint: "For example, 2xx or 200,204,3xx",
  passiveHint: "Send an application heartbeat every 5 seconds. The access token is shown when created or reset.",
  noChannelChoices: "Add a channel from the Notification channels page.", channelKind: "Channel type", recipient: "Recipient email",
  barkUrl: "Bark push URL", webhookUrl: "Webhook URL", retainTarget: "Leave blank to keep the current value", save: "Save",
  saving: "Working…", archive: "Archive", rotateToken: "Reset token", rotateQuestion: "Resetting this token revokes the old one immediately. Continue?",
  saveFailed: "Unable to save", actionFailed: "Action failed", accessToken: "Passive monitoring token",
  tokenHint: "Save this token before closing. Send it as a Bearer token when connecting.", token: "Token", tokenCopied: "Token copied",
  copyFailed: "Clipboard unavailable. Copy the token manually.", copyToken: "Copy token", done: "Done", loginTitle: "Sign in to Watcher",
  loginDescription: "View service health, incidents, and notification deliveries.", login: "Sign in with GitHub",
  loginUnavailable: "GitHub sign-in hasn’t been configured.",
};

export const messages = { "zh-CN": zh, "en-US": en };

const englishDetails: Record<string, string> = {
  "请先通过 GitHub 登录": "Sign in with GitHub first.",
  "页码无效": "Invalid page number.",
  "无法读取监控数据，请检查数据库连接和迁移状态": "Unable to load monitoring data. Check the database connection and migrations.",
  "监控项或时间范围无效": "Invalid monitor or time range.",
  "监控项不存在或已归档": "This monitor is missing or archived.",
  "无法读取监控历史": "Unable to load monitor history.",
  "请求来源无效": "Invalid request origin.",
  "此操作需要管理员权限": "This action requires an administrator.",
  "请检查输入内容": "Check the form values.",
  "保存失败，请检查服务配置后重试": "Unable to save. Check the server configuration and try again.",
  "请输入有效的收件邮箱": "Enter a valid recipient email address.",
  "请填写包含设备密钥的 Bark 推送链接": "Enter a Bark push URL that includes a device key.",
  "请输入有效的公网 HTTP(S) 地址": "Enter a valid public HTTP(S) URL.",
  "请输入不带登录凭据或片段的 HTTP(S) 地址": "Enter an HTTP(S) URL without credentials or a fragment.",
  "请输入公网地址": "Enter a public address.",
  "服务已归档": "This service is archived.",
  "被动监控项已归档或不存在": "This passive monitor is missing or archived.",
  "状态码格式应为 2xx 或 200,204,3xx": "Use a status pattern such as 2xx or 200,204,3xx.",
  "服务已归档或不存在": "This service is missing or archived.",
  "有通知渠道已停用": "A selected notification channel is disabled.",
  "监控项已归档或类型已锁定": "This monitor is archived or its type is locked.",
  "无法创建监控项": "Unable to create the monitor.",
  "请输入投递地址": "Enter a delivery address.",
  "通知渠道已停用或类型已锁定": "This channel is disabled or its type is locked.",
  "渠道已停用": "Channel disabled.",
  "SMTP 未配置": "SMTP isn’t configured.",
  "15 秒未收到应用心跳": "No application heartbeat for 15 seconds.",
  "服务显式上报异常": "The service reported an unhealthy state.",
  "目标未解析到公网地址": "The target did not resolve to a public address.",
  "请求超时": "Request timed out.",
  "网络请求失败": "Network request failed.",
};

export function localizeDetail(locale: Locale, detail: string) {
  return locale === "en-US" && Object.hasOwn(englishDetails, detail) ? englishDetails[detail] : detail;
}
