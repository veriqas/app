import { PageShell } from "@/components/layout/page-shell";
import { db } from "@/lib/db/client";
import { getServerSession } from "@/lib/auth/session";
import { generateSuggestions } from "@/lib/information-assets/suggestions";
import { InformationAssetsClient } from "./client";

export default async function InformationAssetsPage() {
  const ctx = await getServerSession();
  const tenantId = ctx?.tenantId ?? "";

  const [assets, suggestions] = await Promise.all([
    db.informationAsset.findMany({
      where: { tenantId },
      orderBy: [{ hndlRisk: "asc" }, { name: "asc" }],
    }),
    generateSuggestions(tenantId),
  ]);

  return (
    <PageShell
      title="Information Assets"
      breadcrumbs={[{ label: "Risk" }, { label: "Information Assets" }]}
    >
      <InformationAssetsClient
        initialAssets={assets.map(a => ({
          id: a.id,
          ref: a.ref,
          name: a.name,
          description: a.description,
          dataCategory: a.dataCategory,
          classificationConfidentiality: a.classificationConfidentiality,
          retentionYears: a.retentionYears,
          requiredConfidentialityYears: a.requiredConfidentialityYears,
          regulatoryRelevance: a.regulatoryRelevance,
          hndlRisk: a.hndlRisk,
          createdAt: a.createdAt.toISOString(),
        }))}
        suggestions={suggestions}
      />
    </PageShell>
  );
}
