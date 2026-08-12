import { PageShell } from "@/components/layout/page-shell";
import { db } from "@/lib/db/client";
import { getServerSession } from "@/lib/auth/session";
import { AddDepartmentButton } from "@/components/organisation/add-department-button";
import { Building2, Users2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function OrganisationPage() {
  const ctx = await getServerSession();
  const tenantId = ctx?.tenantId ?? "";

  const org = await db.organisation.findFirst({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
    include: {
      tenant: { select: { name: true, slug: true } },
      businessUnits: {
        orderBy: { name: "asc" },
        include: { _count: { select: { users: true, businessServices: true } } },
      },
    },
  });

  return (
    <PageShell
      title="Organisation"
      breadcrumbs={[{ label: "Admin" }, { label: "Organisation" }]}
      actions={<AddDepartmentButton />}
    >
      {!org ? (
        <div className="flex h-64 items-center justify-center rounded-md border border-dashed border-slate-300 dark:border-slate-700">
          <p className="text-sm text-slate-400">No organisation found. Complete initial setup first.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Org header */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: "rgba(248,120,30,0.1)" }}>
                <Building2 className="h-5 w-5" style={{ color: "#f8781e" }} />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">{org.name}</h2>
                <p className="text-xs text-slate-400">
                  Tenant: {org.tenant.name} · {org.businessUnits.length} department{org.businessUnits.length !== 1 ? "s" : ""}
                </p>
              </div>
            </div>
          </div>

          {/* Departments */}
          <div>
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Departments</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {org.businessUnits.map((bu) => (
                <div key={bu.id} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{bu.name}</p>
                  {bu.description && <p className="mt-0.5 text-xs text-slate-400">{bu.description}</p>}
                  {bu.headName && <p className="mt-1 text-[11px] text-slate-500">Head: {bu.headName}</p>}
                  <div className="mt-3 flex items-center gap-3 text-[11px] text-slate-400">
                    <span className="inline-flex items-center gap-1"><Users2 className="h-3 w-3" /> {bu._count.users} user{bu._count.users !== 1 ? "s" : ""}</span>
                    <span>{bu._count.businessServices} service{bu._count.businessServices !== 1 ? "s" : ""}</span>
                  </div>
                </div>
              ))}
              {org.businessUnits.length === 0 && (
                <div className="col-span-full rounded-xl border border-dashed border-slate-300 py-12 text-center dark:border-slate-700">
                  <p className="text-sm text-slate-400">No departments yet — click "Add Department" to create one.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
