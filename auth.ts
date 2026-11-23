import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub],
  callbacks: {
    jwt({ token, account, profile }) {
      if (account?.provider === "github") {
        token.githubId = account.providerAccountId;
        token.githubLogin = typeof profile?.login === "string" ? profile.login : undefined;
      }
      return token;
    },
    session({ session, token }) {
      return {
        ...session,
        user: { ...session.user, id: String(token.githubId ?? ""), githubLogin: String(token.githubLogin ?? "") },
      };
    },
  },
});

export async function currentUser() {
  if (!process.env.AUTH_SECRET || !process.env.AUTH_GITHUB_ID || !process.env.AUTH_GITHUB_SECRET) return;
  const session = await auth();
  const user = session?.user as { id?: string; githubLogin?: string; name?: string | null } | undefined;
  if (!user?.id) return;
  const adminIds = (process.env.ADMIN_GITHUB_IDS ?? "").split(",").map((id) => id.trim());
  return { name: user.githubLogin || user.name || "GitHub", isAdmin: adminIds.includes(user.id) };
}
