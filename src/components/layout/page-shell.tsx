import { Topbar } from "./topbar";

interface PageShellProps {
  title: string;
  breadcrumbs?: { label: string; href?: string }[];
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export function PageShell({ title, breadcrumbs, actions, children }: PageShellProps) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Topbar title={title} breadcrumbs={breadcrumbs} actions={actions} />
      <main className="flex-1 overflow-y-auto p-7" style={{ background: "#F5F5F7" }}>
        {children}
      </main>
    </div>
  );
}
