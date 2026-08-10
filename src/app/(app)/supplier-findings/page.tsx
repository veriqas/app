import { PageShell } from "@/components/layout/page-shell";

export default function Page() {
  return (
    <PageShell title="Supplier Findings" breadcrumbs={[{ label: "Third Parties" }, { label: "Supplier Findings" }]}>
      <div className="flex h-64 items-center justify-center rounded-md border border-dashed border-slate-300 dark:border-slate-700">
        <p className="text-sm text-slate-400">Supplier Findings — coming in next build phase</p>
      </div>
    </PageShell>
  );
}
