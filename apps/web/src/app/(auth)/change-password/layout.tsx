import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, getSessionUser } from "@/server/auth";
import { getServerDb } from "@/server/db";

/**
 * The middleware can only see that a session cookie exists. Verifying it here
 * keeps a stale cookie from rendering a form that can only fail on submit.
 */
export default async function ChangePasswordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = getSessionUser(await getServerDb(), token);

  if (!session) {
    redirect("/login?expired=1");
  }

  return children;
}
