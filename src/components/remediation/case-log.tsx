"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Bot, Scale, ScanLine, UserCheck, Layers, ChevronRight, Lock, ArrowUpDown } from "lucide-react";
import { strategyLabel } from "./policy-panel";
import {
  type CaseRow, type FilterKey, type SortKey,
  deriveSeverity, deriveAction, matchesFilter, sortRows, departmentsOf,
  SEVERITY_STYLE, isGoodVerdict, isBadVerdict,
} from "./case-state";
import { Building2 } from "lucide-react";

const FILTERS: { key: FilterKey; label: string; group: string }[] = [
  { key: "CRITICAL", label: "Critical", group: "Severity" },
  { key: "HIGH", label: "High", group: "Severity" },
  { key: "MEDIUM", label: "Medium", group: "Severity" },
  { key: "LOW", label: "Low", group: "Severity" },
  { key: "QUANTUM_VULNERABLE", label: "Quantum vulnerable", group: "Risk" },
  { key: "MANUAL_REVIEW", label: "Manual review", group: "State" },
  { key: "POLICY_BLOCKED", label: "Policy blocked", group: "State" },
  { key: "AWAITING", label: "Awaiting remediation", group: "State" },
  { key: "IN_PROGRESS", label: "In remediation", group: "State" },
  { key: "VERIFIED", label: "Verified", group: "Verification" },
  { key: "VERIFIED_WITH_WARNINGS", label: "Verified with warnings", group: "Verification" },
  { key: "FAILED", label: "Failed", group: "Verification" },
  { key: "REGRESSED", label: "Regressed", group: "Verification" },
];

const SORTS: { key: SortKey; label: string }[] = [
  { key: "SEVERITY", label: "Severity" },
  { key: "VERIFICATION", label: "Verification status" },
  { key: "CONFIDENCE", label: "Confidence" },
  { key: "NEWEST", label: "Newest" },
  { key: "OLDEST", label: "Oldest" },
];

const verdictLabel = (v: string | null) => (v ? v.replace(/_/g, " ").toLowerCase() : "Not verified");

export function CaseLog({ rows, initialFilters = [], initialSort = "SEVERITY" }: {
  rows: CaseRow[]; initialFilters?: FilterKey[]; initialSort?: SortKey;
}) {
  const [active, setActive] = useState<Set<FilterKey>>(new Set(initialFilters));
  const [sort, setSort] = useState<SortKey>(initialSort);
  const [department, setDepartment] = useState<string>("");
  const departments = useMemo(() => departmentsOf(rows), [rows]);

  /**
   * Filter and sort state lives in the URL, so opening a case and coming back
   * returns to the same view — and a filtered view can be shared with a
   * colleague. Written with replaceState so it does not add history entries.
   */
  const syncUrl = (next: Set<FilterKey>, nextSort: SortKey) => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams();
    if (next.size > 0) p.set("f", [...next].join(","));
    if (nextSort !== "SEVERITY") p.set("sort", nextSort);
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
  };

  const shown = useMemo(() => {
    // Filters within a group are alternatives; across groups they narrow.
    const byGroup = new Map<string, FilterKey[]>();
    for (const f of FILTERS) {
      if (!active.has(f.key)) continue;
      byGroup.set(f.group, [...(byGroup.get(f.group) ?? []), f.key]);
    }
    const filtered = rows.filter(r =>
      [...byGroup.values()].every(keys => keys.some(k => matchesFilter(r, k)))
      && (!department || r.department === department),
    );
    return sortRows(filtered, sort);
  }, [rows, active, sort, department]);

  const toggle = (k: FilterKey) =>
    setActive(prev => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k); else n.add(k);
      syncUrl(n, sort);
      return n;
    });
  const clearAll = () => { setActive(new Set()); syncUrl(new Set(), sort); };
  const changeSort = (s: SortKey) => { setSort(s); syncUrl(active, s); };

  return (
    <>
      {/* Controls */}
      <div className="mb-5 rounded-2xl bg-white p-4" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.07)" }}>
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTERS.map(f => {
            const on = active.has(f.key);
            const count = rows.filter(r => matchesFilter(r, f.key)).length;
            return (
              <button
                key={f.key}
                onClick={() => toggle(f.key)}
                disabled={count === 0 && !on}
                className="rounded-lg px-2.5 py-1 text-[12px] font-medium transition-colors disabled:opacity-35"
                style={on
                  ? { background: "#0C1524", color: "#fff" }
                  : { background: "#F1F5F9", color: "#475569" }}
              >
                {f.label}
                <span className={`ml-1.5 tabular-nums ${on ? "text-white/60" : "text-slate-400"}`}>{count}</span>
              </button>
            );
          })}
          {active.size > 0 && (
            <button onClick={clearAll} className="ml-1 text-[12px] font-medium text-slate-400 underline hover:text-slate-600">
              Clear
            </button>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <p className="text-[12px] text-slate-400">
            Showing <span className="font-semibold text-slate-600">{shown.length}</span> of {rows.length} cases
          </p>
          <div className="flex items-center gap-3">
            {departments.length > 0 && (
              <div className="flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-slate-300" />
                <label htmlFor="case-dept" className="text-[12px] text-slate-400">Department</label>
                <select
                  id="case-dept"
                  value={department}
                  onChange={e => setDepartment(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[12px] text-slate-600"
                >
                  <option value="">All</option>
                  {departments.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            )}
            <div className="flex items-center gap-1.5">
            <ArrowUpDown className="h-3.5 w-3.5 text-slate-300" />
            <label htmlFor="case-sort" className="text-[12px] text-slate-400">Sort</label>
            <select
              id="case-sort"
              value={sort}
              onChange={e => changeSort(e.target.value as SortKey)}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[12px] text-slate-600"
            >
              {SORTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            </div>
          </div>
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center">
          <Layers className="mx-auto h-7 w-7 text-slate-300" />
          <p className="mt-3 text-sm font-semibold text-slate-600">No cases match these filters</p>
          <button onClick={clearAll} className="mt-2 text-[13px] font-medium text-slate-400 underline hover:text-slate-600">
            Clear filters
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map(row => <CaseCard key={row.id} row={row} />)}
        </div>
      )}
    </>
  );
}

function CaseCard({ row }: { row: CaseRow }) {
  const sev = deriveSeverity(row.quantumClass, row.primitiveType);
  const sevStyle = SEVERITY_STYLE[sev];
  const action = deriveAction(row);
  const blocked = row.policyState === "BLOCKED";

  return (
    <Link
      href={`/remediation/cases/${row.id}`}
      className="block rounded-2xl bg-white p-5 transition-shadow hover:shadow-md"
      style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.07)" }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: sevStyle.color, background: sevStyle.bg }}>
              {sev}
            </span>
            <code className="font-mono text-[11px] text-slate-400">{row.ref}</code>
            {row.quantumClass === "QUANTUM_VULNERABLE" && (
              <span className="rounded-md bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-600">quantum vulnerable</span>
            )}
            {row.department && (
              <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                <Building2 className="h-2.5 w-2.5" />{row.department}
              </span>
            )}
          </div>
          <p className="mt-1.5 text-[16px] font-bold leading-tight text-slate-900">
            {row.algorithm ?? "Unclassified"}
            {row.purpose && <span className="font-normal text-slate-400"> · {row.purpose}</span>}
          </p>
          <p className="mt-1 text-[12px] text-slate-400">
            {row.findingCount} finding{row.findingCount === 1 ? "" : "s"} · {row.scanners.join(", ") || "no scanner"} ·{" "}
            {row.affectedFileCount} file{row.affectedFileCount === 1 ? "" : "s"} · {row.confidence}% confidence
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span
            className="rounded-lg px-3 py-1.5 text-[12px] font-semibold"
            style={action.kind === "IN_PROGRESS"
              ? { background: "#F1F5F9", color: "#64748B" }
              : { background: "rgba(248,120,30,0.10)", color: "#c45a0e" }}
          >
            {action.label}
          </span>
          <ChevronRight className="h-4 w-4 text-slate-300" />
        </div>
      </div>

      {/* Policy block is a distinct outcome, not an ordinary failure. */}
      {blocked && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border px-3 py-2" style={{ borderColor: "#C7D2FE", background: "#EEF2FF" }}>
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: "#4338CA" }} />
          <p className="text-[12px] leading-relaxed" style={{ color: "#3730A3" }}>
            <span className="font-semibold">Policy blocked.</span> The proposed migration was not permitted by Strategy
            Policy{row.policyVersion ? ` v${row.policyVersion}` : ""}. Human review required.
          </p>
        </div>
      )}

      {/* The four layers, at a glance */}
      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 md:grid-cols-4">
        <Layer icon={Bot} label="AI" value={row.aiStrategy ? strategyLabel(row.aiStrategy) : "No proposal"} tone="neutral" />
        <Layer
          icon={Scale} label="Policy"
          value={row.policyState === "BLOCKED" ? "Blocked" : row.policyState === "APPROVED" ? "Approved" : "Not applied"}
          tone={row.policyState === "BLOCKED" ? "bad" : row.policyState === "APPROVED" ? "good" : "neutral"}
        />
        <Layer
          icon={ScanLine} label="Scanners" value={verdictLabel(row.verdict)}
          tone={isGoodVerdict(row.verdict) ? "good" : isBadVerdict(row.verdict) ? "bad" : "neutral"}
        />
        <Layer icon={UserCheck} label="Human" value={row.assignedTo ?? (action.kind === "IN_PROGRESS" ? "Waiting" : "Review required")} tone={row.assignedTo ? "good" : "neutral"} />
      </div>
    </Link>
  );
}

function Layer({ icon: Icon, label, value, tone }: {
  icon: React.ElementType; label: string; value: string; tone: "good" | "bad" | "neutral";
}) {
  const c = tone === "good" ? { fg: "#15803D", bg: "#F0FDF4" }
    : tone === "bad" ? { fg: "#B91C1C", bg: "#FEF2F2" }
    : { fg: "#475569", bg: "#F8FAFC" };
  return (
    <div className="rounded-lg px-2.5 py-1.5" style={{ background: c.bg }}>
      <div className="flex items-center gap-1">
        <Icon className="h-3 w-3" style={{ color: c.fg, opacity: 0.6 }} />
        <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: c.fg, opacity: 0.6 }}>{label}</span>
      </div>
      <p className="mt-0.5 truncate text-[12px] font-semibold capitalize leading-tight" style={{ color: c.fg }} title={value}>
        {value}
      </p>
    </div>
  );
}
