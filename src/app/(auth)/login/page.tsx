import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { safeReturnPath } from "@/lib/return-path";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const [session, query] = await Promise.all([getSession(), searchParams]);
  // A shared link opened while signed out arrives as /login?next=<its path>.
  const returnTo = safeReturnPath(typeof query.next === "string" ? query.next : null) ?? "/";
  if (session) redirect(returnTo);

  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-muted/40 p-4">
      <LoginForm returnTo={returnTo} />
    </main>
  );
}
