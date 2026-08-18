/** Route guard: analyst-tier: control-tests */
import { requirePermission } from "@/lib/auth/session";

export default async function GuardedLayout({ children }: { children: React.ReactNode }) {
  await requirePermission("cases:read:all");
  return <>{children}</>;
}
