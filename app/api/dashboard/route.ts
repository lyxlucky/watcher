import { currentUser } from "../../../auth.ts";
import { z } from "zod";
import { actionSchema, ConfigurationError, configure, monitorHistory, snapshot } from "../../dashboard-data.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "请先通过 GitHub 登录" }, { status: 401, headers });
  const params = new URL(request.url).searchParams;
  if (params.has("monitorId")) {
    const selection = z.object({ id: z.uuid(), range: z.enum(["1h", "24h", "7d"]) }).safeParse({
      id: params.get("monitorId"), range: params.get("range"),
    });
    if (!selection.success) return Response.json({ error: "监控项或时间范围无效" }, { status: 400, headers });
    try {
      const history = await monitorHistory(selection.data.id, selection.data.range);
      if (!history) return Response.json({ error: "监控项不存在或已归档" }, { status: 404, headers });
      return Response.json(history, { headers });
    } catch {
      return Response.json({ error: "无法读取监控历史" }, { status: 503, headers });
    }
  }
  const page = Number(params.get("incidentPage") ?? 1);
  if (!Number.isInteger(page) || page < 1 || page > 1000000) return Response.json({ error: "页码无效" }, { status: 400, headers });
  try {
    return Response.json(await snapshot(user.isAdmin, page), { headers });
  } catch {
    return Response.json({ error: "无法读取监控数据，请检查数据库连接和迁移状态" }, { status: 503, headers });
  }
}

export async function POST(request: Request) {
  const allowedOrigin = new URL(process.env.AUTH_URL ?? request.url).origin;
  if (request.headers.get("origin") !== allowedOrigin) return Response.json({ error: "请求来源无效" }, { status: 403, headers });
  const user = await currentUser();
  if (!user?.isAdmin) return Response.json({ error: "此操作需要管理员权限" }, { status: user ? 403 : 401, headers });
  const data = actionSchema.safeParse(await request.json().catch(() => null));
  if (!data.success) return Response.json({ error: "请检查输入内容" }, { status: 400, headers });
  try {
    return Response.json(await configure(data.data), { headers });
  } catch (error) {
    if (error instanceof ConfigurationError) return Response.json({ error: error.message }, { status: 400, headers });
    return Response.json({ error: "保存失败，请检查服务配置后重试" }, { status: 503, headers });
  }
}
