import { Sidebar } from "@/components/layout/sidebar";
import { OnboardingTour } from "@/components/onboarding/onboarding-tour";
import { getSessionPermissions } from "@/lib/auth/session";
import { primaryRole } from "@/lib/auth/permissions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Navigation is filtered to what this session may actually open. This is
  // presentation only — every route is independently guarded on the server.
  const sp = await getSessionPermissions();

  return (
    <div className="flex h-full">
      <Sidebar permissions={[...sp.permissions]} role={primaryRole(sp)} />
      <div className="flex flex-1 flex-col overflow-hidden">{children}</div>
      <OnboardingTour />
    </div>
  );
}
