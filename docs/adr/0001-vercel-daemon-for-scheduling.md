# 在 Vercel 上运行秒级监控调度

Next.js 控制台和被动接入的 WebSocket 入口部署到 Vercel Functions。同一项目启用处于公开测试阶段的 Vercel Daemon，负责每 30 秒主动探测、按 15 秒阈值判定心跳超时，以及重试通知。Vercel Cron 最快每分钟调度一次，无法满足这两项监控时限。

[Vercel Daemons 公告](https://vercel.com/changelog/vercel-daemons-is-now-in-public-beta) · [Vercel WebSocket 文档](https://vercel.com/docs/functions/websockets) · [Vercel Cron 调度限制](https://vercel.com/i/event-driven-architecture)
