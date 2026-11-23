import { signOut } from "../../../auth.ts";

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(process.env.AUTH_URL ?? request.url).origin) {
    return new Response(null, { status: 403 });
  }
  await signOut({ redirect: false });
  return new Response(null, { status: 303, headers: { Location: "/" } });
}
