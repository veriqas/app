import { Sidebar } from "@/components/layout/sidebar";
import { OnboardingTour } from "@/components/onboarding/onboarding-tour";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">{children}</div>
      <OnboardingTour />
    </div>
  );
}
