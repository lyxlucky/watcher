# Watcher

[简体中文](README.md) · English

Watcher is a service monitoring platform built with Next.js, Tailwind CSS, and PostgreSQL. The dashboard supports Simplified Chinese and English. On desktop, it displays the monitor list and the selected monitor side by side. On mobile, the list opens into a dedicated detail view. Anyone who signs in with GitHub can view monitoring data. Set `ADMIN_GITHUB_IDS` to grant configuration access to specific GitHub users.

## Features

- **Active HTTP(S) checks** run every 30 seconds against public endpoints and support configurable expected HTTP status codes. Two consecutive failures open an incident. The next successful check closes it.
- **Passive WebSocket monitoring** accepts application heartbeats and explicit health reports. Once the first valid report arrives, a 15-second gap in heartbeats triggers a failure.
- **Monitoring dashboard** groups monitors by service and provides search, status filters, recent checks, and incidents. HTTP monitors show response times and check success rates for 1 hour, 24 hours, or 7 days. Check records are retained for 7 days.
- **Alert delivery** sends incident and recovery notifications through Bark, webhooks, or email and records delivery results and retries for each channel.

[Desktop UI prototype](docs/stitch/watcher-desktop-en.png) · [Mobile UI prototype in Simplified Chinese](docs/stitch/watcher-mobile-zh.png)

## Run locally

You need Node.js 22.18 or later and PostgreSQL 14 or later.

1. Clone this repository, run `npm ci`, and copy [`.env.example`](.env.example) to `.env.local`.
2. Create a GitHub OAuth app. Set its homepage to `http://localhost:3000` and its callback to `http://localhost:3000/api/auth/callback/github`. Set `AUTH_GITHUB_ID` to the client ID and `AUTH_GITHUB_SECRET` to the client secret. [GitHub OAuth app setup](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app)
3. Generate independent values for `AUTH_SECRET` and `CHANNEL_SECRET_KEY`. Run `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"` once per value. Set `ADMIN_GITHUB_IDS` to the administrators’ numeric GitHub user IDs, separated by commas.
4. Set `DATABASE_URL` and run `npm run db:migrate` to apply the database schema.
5. Run `npm run dev` and `npm run worker` in separate terminals. For local passive monitoring, run `npm run dev:ws` in a third terminal. Open the [local dashboard](http://localhost:3000).

Run `npm test` to use the embedded test database without a separate PostgreSQL instance. Run `npm run typecheck` for type checking and `npm run build` to verify the production build.

## Deploy to Vercel

[`vercel.json`](vercel.json) deploys the Next.js app and the long-running monitoring worker to the same Vercel project. The default region is `iad1`. If your database is in another region, update both `regions` and the Daemon’s `instances` region. The Daemon runs in production deployments. [Vercel Daemons documentation](https://vercel.com/docs/daemons)

1. Create a Vercel project and choose a production domain. Set the production environment variables, point `AUTH_URL` to that HTTPS origin, and use `https://your-domain.example/api/auth/callback/github` as the GitHub OAuth callback. For passive monitoring, make sure Fluid compute is enabled. [Vercel WebSocket documentation](https://vercel.com/docs/functions/websockets)
2. Run `npm run db:migrate` with the production database connection. Link the repository to the Vercel project and deploy via its Git integration or with `vercel --prod`. Verify that the worker started by checking for `Watcher 监控进程已启动` in the Vercel logs.
3. Sign in as an administrator, create a notification channel and a service, and add an active or passive monitor. Use your own health endpoint and a test notification destination to check delivery on failure and recovery.

The Next.js app and the Daemon use the same database connection and `CHANNEL_SECRET_KEY`. Keep that key across deployments so existing channel destinations can still be decrypted. Configure `SMTP_*` for the Daemon to send email. Port `465` uses implicit TLS. The default port, `587`, uses STARTTLS.

## Connect a passive monitor

Connect to `wss://your-domain.example/api/heartbeat` in production or `ws://127.0.0.1:3001/api/heartbeat` locally. Save the token shown when you create the monitor. Send `Authorization: Bearer <token>` in the WebSocket handshake and send one JSON text frame every 5 seconds. Watcher returns `{"type":"ack"}` after persisting a report.

| Frame | Effect |
| --- | --- |
| `{"type":"heartbeat"}` | Refreshes the last heartbeat time and can clear a heartbeat timeout. |
| `{"type":"unhealthy"}` | Immediately reports an unhealthy state and opens an incident when the monitor enters that state. |
| `{"type":"healthy"}` | Reports a healthy state and clears an explicit failure. |

Reconnect automatically after disconnects and report the current application state promptly. Watcher measures the 15-second timeout from receipt of the last valid report. The worker checks for expired heartbeats every 250 milliseconds. Database operations, deployments, and notification services can affect when an alert arrives. A monitor awaiting connection starts its timer with the first valid report.

## Notification channels

- **Bark** expects the push URL containing the device key, for example `https://api.day.app/device-key`. [Bark documentation](https://bark.day.app/)
- **Webhook** expects a public HTTP(S) URL. Watcher sends JSON with `id`, `incidentId`, `event`, `service`, `monitor`, `reason`, and `occurredAt`. The event is `down` or `recovery`. Receivers can deduplicate deliveries using the `Idempotency-Key` header.
- **Email** expects a recipient email address. The worker sends through the SMTP server configured for the deployment.

A monitor can use multiple channels. Each channel gets up to three delivery attempts, with retries after approximately 15 and 30 seconds. A retry can produce a duplicate if the external delivery succeeded but Watcher could not record it.

## Project structure

- [`app/`](app/) contains the dashboard, localization, authentication entry points, and API routes.
- [`worker/`](worker/) contains the database schema, probe scheduling, heartbeat processing, and alert delivery.
- [`tests/`](tests/) contains tests for monitoring, alert delivery, and check history.

[Monitoring rules in Simplified Chinese](docs/monitoring.md) · [Vercel scheduling decision in Simplified Chinese](docs/adr/0001-vercel-daemon-for-scheduling.md)
