import { currentUser, signIn } from "../auth.ts";
import { Dashboard } from "./dashboard.tsx";
import { Login } from "./login.tsx";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await currentUser();
  if (user) return <Dashboard user={user} />;
  const configured = Boolean(process.env.AUTH_SECRET && process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET);

  return <Login configured={configured} login={async () => {
    "use server";
    await signIn("github", { redirectTo: "/" });
  }} />;
}
