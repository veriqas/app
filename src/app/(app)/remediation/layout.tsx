/**
 * Remediation Center.
 *
 * The case LIST requires the ability to read every case. An individual case is
 * guarded separately, because a reviewer who has been assigned a case must be
 * able to open it without being able to browse the rest.
 */
import { getSessionPermissions } from "@/lib/auth/session";
import { canAny } from "@/lib/auth/permissions";
import { notFound } from "next/navigation";

export default async function RemediationLayout({ children }: { children: React.ReactNode }) {
  const sp = await getSessionPermissions();
  if (!canAny(sp, "cases:read:all", "cases:read:assigned")) notFound();
  return <>{children}</>;
}
