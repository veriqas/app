import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import LoginClient from "./login-client";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // If no tenants exist, send to first-run setup
  const count = await db.tenant.count();
  if (count === 0) redirect("/setup");

  return <LoginClient />;
}
