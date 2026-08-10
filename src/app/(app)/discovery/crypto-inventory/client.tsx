"use client";

import { useState } from "react";
import { formatDate } from "@/lib/utils";
import {
  Archive, ShieldAlert, CheckCircle, Layers, Network,
  Code2, Package, Container, Globe, Wifi,
} from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { quantumBadge } from "@/components/ui/badge";

type Asset = {
  id: string;
  ref: string;
  name: string;
  purpose: string | null;
  primitiveType: string;
  algorithm: string | null;
  algorithmFamily: string | null;
  environment: string | null;
  provider: string | null;
  protocol: string | null;
  quantumClass: string;
  liveObserved: boolean;
  riskLevel: string;
  ownerId: string | null;
  ownerName: string | null;
  evidenceConfidence: number;
  lastObservedAt: string | null;
  firstSeenAt: string | null;
  businessServices: string[];
  assetType: string | null;
  host: string | null;
  repository: string | null;
  migrationStatus: string;
  criticality: string;
  sourceCount: number;
  sources: string[];
  riskCount: number;
};

type Kpis = {
  total: number;
  vulnerable: number;
  liveVulnerable: number;
  postQuantum: number;
  unowned: number;
  multiSource: number;
};

const PRIMITIVE_LABELS: Record<string, string> = {
  KEY_ESTABLISHMENT:    "Key Est.",
  DIGITAL_SIGNATURE:    "Signature",
  PUBLIC_KEY_ENCRYPTION:"PKE",
  SYMMETRIC_ENCRYPTION: "Symmetric",
  HASH:                 "Hash",
  MAC:                  "MAC",
  KDF:                  "KDF",
  CERTIFICATE:          "Certificate",
  OTHER:                "Other",
};

const ASSET_TYPE_META: Record<string, { label: string; color: string; Icon: typeof Network }> = {
  TLS_ENDPOINT: { label: "TLS",      color: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",   Icon: Network },
  SSH_ENDPOINT: { label: "SSH",      color: "bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300", Icon: Wifi },
  CODE_USAGE:   { label: "Code",     color: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",  Icon: Code2 },
  LIBRARY:      { label: "Library",  color: "bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300", Icon: Package },
  CONTAINER:    { label: "Container",color: "bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300",    Icon: Container },
  CERTIFICATE:  { label: "Cert",     color: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300", Icon: Globe },
  GENERIC:      { label: "Generic",  color: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400", Icon: Archive },
};

const MIGRATION_COLORS: Record<string, string> = {
  NOT_STARTED:  "text-red-600 dark:text-red-400",
  PLANNED:      "text-amber-600 dark:text-amber-400",
  IN_PROGRESS:  "text-blue-600 dark:text-blue-400",
  COMPLETED:    "text-green-600 dark:text-green-400",
  DEFERRED:     "text-slate-500 dark:text-slate-400",
};

const MIGRATION_LABELS: Record<string, string> = {
  NOT_STARTED: "Not Started",
  PLANNED:     "Planned",
  IN_PROGRESS: "In Progress",
  COMPLETED:   "Complete",
  DEFERRED:    "Deferred",
};

type FilterKey = "ALL" | "QUANTUM_VULNERABLE" | "LIVE_VULN" | "POST_QUANTUM" | "HYBRID" | "MULTI_SOURCE" | "UNOWNED";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "ALL",               label: "All Assets" },
  { key: "QUANTUM_VULNERABLE",label: "Quantum Vulnerable" },
  { key: "LIVE_VULN",         label: "Observed Live" },
  { key: "POST_QUANTUM",      label: "Post-Quantum" },
  { key: "HYBRID",            label: "Hybrid" },
  { key: "MULTI_SOURCE",      label: "Multi-Source" },
  { key: "UNOWNED",           label: "Unowned" },
];

export function CryptoInventoryClient({
  assets,
  users,
  kpis,
}: {
  assets: Asset[];
  users: { id: string; name: string }[];
  kpis: Kpis;
}) {
  const [filter, setFilter] = useState<FilterKey>("ALL");
  const [search, setSearch] = useState("");

  const filtered = assets.filter((a) => {
    const matchesFilter =
      filter === "ALL" ||
      (filter === "QUANTUM_VULNERABLE" && a.quantumClass === "QUANTUM_VULNERABLE") ||
      (filter === "LIVE_VULN" && a.quantumClass === "QUANTUM_VULNERABLE" && a.liveObserved) ||
      (filter === "POST_QUANTUM" && a.quantumClass === "POST_QUANTUM") ||
      (filter === "HYBRID" && a.quantumClass === "HYBRID") ||
      (filter === "MULTI_SOURCE" && a.sourceCount >= 2) ||
      (filter === "UNOWNED" && !a.ownerId);

    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      a.name.toLowerCase().includes(q) ||
      (a.algorithm ?? "").toLowerCase().includes(q) ||
      (a.host ?? "").toLowerCase().includes(q) ||
      (a.repository ?? "").toLowerCase().includes(q) ||
      (a.purpose ?? "").toLowerCase().includes(q) ||
      a.ref.toLowerCase().includes(q) ||
      a.sources.some(s => s.toLowerCase().includes(q));

    return matchesFilter && matchesSearch;
  });

  return (
    <>
      {/* KPIs */}
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-6">
        <StatCard label="Total Assets" value={kpis.total.toLocaleString()} sub="in inventory" icon={Archive} />
        <StatCard label="Quantum Vulnerable" value={kpis.vulnerable} sub="require migration" variant="critical" icon={ShieldAlert} />
        <StatCard label="Live Observed" value={kpis.liveVulnerable} sub="active + vulnerable" variant="high" icon={ShieldAlert} />
        <StatCard label="Post-Quantum" value={kpis.postQuantum} sub="migrated" variant="low" icon={CheckCircle} />
        <StatCard label="Multi-Source" value={kpis.multiSource} sub="corroborated ≥2 scanners" variant="medium" icon={Layers} />
        <StatCard label="Unowned" value={kpis.unowned} sub="no owner assigned" variant="medium" icon={Archive} />
      </div>

      {/* Filter + search bar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded border px-3 py-1 text-xs font-medium transition-colors ${
              filter === f.key
                ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
            }`}
          >
            {f.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search assets, algorithms, hosts…"
            className="w-56 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 outline-none placeholder:text-slate-400 focus:border-green-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto overflow-hidden rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        {/* Header */}
        <div className="grid min-w-[900px] grid-cols-[90px_1fr_90px_130px_100px_70px_90px_80px_80px] items-center border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-800/50">
          <span>Ref</span>
          <span>Asset</span>
          <span>Type</span>
          <span>Algorithm</span>
          <span>Sources</span>
          <span>Live</span>
          <span>Quantum</span>
          <span>Migration</span>
          <span>Confidence</span>
        </div>

        {/* Rows */}
        <div className="min-w-[900px] divide-y divide-slate-100 dark:divide-slate-800">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400">
              {assets.length === 0
                ? "No cryptographic assets yet. Run a scan to populate the inventory."
                : "No assets match this filter."}
            </div>
          ) : (
            filtered.map((a) => {
              const typeMeta = ASSET_TYPE_META[a.assetType ?? "GENERIC"] ?? ASSET_TYPE_META.GENERIC;
              const TypeIcon = typeMeta.Icon;
              return (
                <div
                  key={a.id}
                  className="grid grid-cols-[90px_1fr_90px_130px_100px_70px_90px_80px_80px] items-center px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                >
                  {/* Ref */}
                  <span className="font-mono text-[10px] text-slate-400">{a.ref}</span>

                  {/* Asset name + host/repo + business service */}
                  <div className="min-w-0 pr-3">
                    <p className="truncate text-xs font-medium text-slate-800 dark:text-slate-200">{a.name}</p>
                    {(a.host ?? a.repository) && (
                      <p className="truncate text-[10px] text-slate-400">
                        {a.host ?? (a.repository ? a.repository.replace("https://", "") : "")}
                      </p>
                    )}
                    {a.businessServices.length > 0 && (
                      <p className="truncate text-[10px] text-green-500">{a.businessServices[0]}</p>
                    )}
                    {a.riskCount > 0 && (
                      <p className="text-[10px] text-red-500">{a.riskCount} risk{a.riskCount !== 1 ? "s" : ""}</p>
                    )}
                  </div>

                  {/* Asset type */}
                  <span>
                    {a.assetType ? (
                      <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${typeMeta.color}`}>
                        <TypeIcon className="h-2.5 w-2.5" />
                        {typeMeta.label}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </span>

                  {/* Algorithm */}
                  <code className="truncate font-mono text-[11px] text-slate-700 dark:text-slate-300">
                    {a.algorithm ?? "—"}
                  </code>

                  {/* Sources */}
                  <div>
                    <div className="flex flex-wrap gap-0.5">
                      {a.sources.slice(0, 3).map(s => (
                        <span key={s} className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[9px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                          {s}
                        </span>
                      ))}
                      {a.sources.length > 3 && (
                        <span className="text-[9px] text-slate-400">+{a.sources.length - 3}</span>
                      )}
                    </div>
                    {a.sourceCount >= 2 && (
                      <p className="mt-0.5 text-[9px] text-green-600 dark:text-green-400">{a.sourceCount} sources</p>
                    )}
                  </div>

                  {/* Live */}
                  <span>
                    {a.liveObserved ? (
                      <span className="flex items-center gap-1 text-[10px] font-medium text-green-600 dark:text-green-400">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
                        Live
                      </span>
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </span>

                  {/* Quantum class */}
                  <span>{quantumBadge(a.quantumClass)}</span>

                  {/* Migration status */}
                  <span className={`text-[10px] font-medium ${MIGRATION_COLORS[a.migrationStatus] ?? "text-slate-400"}`}>
                    {MIGRATION_LABELS[a.migrationStatus] ?? a.migrationStatus}
                  </span>

                  {/* Confidence */}
                  <div className="flex items-center gap-1.5">
                    <div className="h-1.5 w-10 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                      <div
                        className={`h-1.5 rounded-full ${
                          a.evidenceConfidence >= 90 ? "bg-green-500" :
                          a.evidenceConfidence >= 70 ? "bg-amber-500" : "bg-red-500"
                        }`}
                        style={{ width: `${a.evidenceConfidence}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-slate-400">{a.evidenceConfidence}%</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5 dark:border-slate-800">
          <span className="text-xs text-slate-400">
            {filtered.length.toLocaleString()} of {kpis.total.toLocaleString()} assets
          </span>
          <span className="text-xs text-slate-400">
            Assets auto-populate as scans complete
          </span>
        </div>
      </div>
    </>
  );
}
