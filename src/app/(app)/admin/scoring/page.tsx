import { PageShell } from "@/components/layout/page-shell";

export default function Page() {
  return (
    <PageShell title="Scoring Policy" breadcrumbs={[{ label: "Admin" }, { label: "Scoring Policy" }]}>
      <div className="flex h-64 items-center justify-center rounded-md border border-dashed border-slate-300 dark:border-slate-700">
        <p className="text-sm text-slate-400">Scoring Policy — coming in next build phase</p>
      </div>
    </PageShell>
  );
}
