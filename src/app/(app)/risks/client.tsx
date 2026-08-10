"use client";

import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge, severityBadge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { Calendar, User } from "lucide-react";

type UserStub = { id: string; name: string; email: string };

type RiskRow = {
  id: string;
  ref: string;
  title: string;
  riskType: string;
  residualRating: string;
  status: string;
  businessService: string | null;
  owner: UserStub | null;
  targetDate: string | null;
  reviewDate: string | null;
};

const STATUS_MAP: Record<string, string> = {
  OPEN: "bg-slate-100 text-slate-700 border-slate-200",
  UNDER_ASSESSMENT: "bg-blue-50 text-blue-700 border-blue-200",
  TREATMENT_PLANNED: "bg-amber-50 text-amber-700 border-amber-200",
  IN_REMEDIATION: "bg-teal-50 text-teal-700 border-teal-200",
  MONITORING: "bg-purple-50 text-purple-700 border-purple-200",
  ACCEPTED: "bg-slate-100 text-slate-500 border-slate-200",
  CLOSED: "bg-green-50 text-green-700 border-green-200",
};

const STATUS_LABELS: Record<string, string> = {
  OPEN: "Open",
  UNDER_ASSESSMENT: "Under Assessment",
  TREATMENT_PLANNED: "Treatment Planned",
  IN_REMEDIATION: "In Remediation",
  MONITORING: "Monitoring",
  ACCEPTED: "Accepted",
  CLOSED: "Closed",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${STATUS_MAP[status] ?? STATUS_MAP.OPEN}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

async function patchRisk(id: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/risks/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.ok ? res.json() : null;
}

function OwnerCell({
  riskId,
  owner,
  users,
  onUpdated,
}: {
  riskId: string;
  owner: UserStub | null;
  users: UserStub[];
  onUpdated: (id: string, patch: Partial<RiskRow>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = users.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  );

  async function select(userId: string | null) {
    const result = await patchRisk(riskId, { ownerId: userId });
    if (result) {
      const newOwner = userId ? users.find((u) => u.id === userId) ?? null : null;
      onUpdated(riskId, { owner: newOwner });
    }
    setOpen(false);
    setSearch("");
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded px-1.5 py-1 text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
      >
        {owner ? (
          <>
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-[9px] font-bold text-green-700 dark:bg-green-900 dark:text-green-300">
              {owner.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
            </div>
            <span>{owner.name.split(" ")[0]}</span>
          </>
        ) : (
          <>
            <User className="h-3.5 w-3.5 text-slate-300" />
            <span className="italic text-slate-400">Unowned</span>
          </>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 w-56 rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
            <div className="p-2">
              <input
                autoFocus
                type="text"
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs outline-none focus:border-green-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              />
            </div>
            <div className="max-h-48 overflow-y-auto pb-1">
              <button
                onClick={() => select(null)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <span className="italic">Unassigned</span>
              </button>
              {filtered.map((u) => (
                <button
                  key={u.id}
                  onClick={() => select(u.id)}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-800 ${owner?.id === u.id ? "font-semibold text-green-600 dark:text-indigo-400" : "text-slate-700 dark:text-slate-300"}`}
                >
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-100 text-[9px] font-bold text-green-700 dark:bg-green-900 dark:text-green-300">
                    {u.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate">{u.name}</p>
                    <p className="truncate text-slate-400">{u.email}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ReviewDateCell({
  riskId,
  reviewDate,
  onUpdated,
}: {
  riskId: string;
  reviewDate: string | null;
  onUpdated: (id: string, patch: Partial<RiskRow>) => void;
}) {
  async function handleChange(val: string) {
    const result = await patchRisk(riskId, { reviewDate: val || null });
    if (result) onUpdated(riskId, { reviewDate: val || null });
  }

  const isOverdue = reviewDate && new Date(reviewDate) < new Date();

  return (
    <div className="flex items-center gap-1">
      <Calendar className={`h-3 w-3 shrink-0 ${isOverdue ? "text-red-400" : "text-slate-300"}`} />
      <input
        type="date"
        value={reviewDate ? reviewDate.slice(0, 10) : ""}
        onChange={(e) => handleChange(e.target.value)}
        className={`rounded border px-1.5 py-0.5 text-xs outline-none focus:border-green-400 dark:bg-slate-900 ${
          isOverdue
            ? "border-red-200 bg-red-50 text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400"
            : "border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:text-slate-300"
        }`}
      />
    </div>
  );
}

interface Props {
  risks: RiskRow[];
  users: UserStub[];
}

export function RisksClient({ risks: initialRisks, users }: Props) {
  const [risks, setRisks] = useState(initialRisks);

  function onUpdated(id: string, patch: Partial<RiskRow>) {
    setRisks((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  return (
    <div className="rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <Table>
        <TableHeader>
          <TableRow className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/50">
            <TableHead>Ref</TableHead>
            <TableHead>Risk</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Residual</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Business Service</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead>Review Date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {risks.map((r) => (
            <TableRow key={r.id}>
              <TableCell>
                <span className="font-mono text-xs text-slate-500">{r.ref}</span>
              </TableCell>
              <TableCell>
                <span className="font-medium text-slate-800 dark:text-slate-200">{r.title}</span>
              </TableCell>
              <TableCell>
                <Badge variant="default" className="text-[10px]">
                  {r.riskType.replace(/_/g, " ")}
                </Badge>
              </TableCell>
              <TableCell>{severityBadge(r.residualRating)}</TableCell>
              <TableCell><StatusBadge status={r.status} /></TableCell>
              <TableCell>
                <span className="text-xs text-slate-600 dark:text-slate-400">
                  {r.businessService ?? "—"}
                </span>
              </TableCell>
              <TableCell>
                <OwnerCell
                  riskId={r.id}
                  owner={r.owner}
                  users={users}
                  onUpdated={onUpdated}
                />
              </TableCell>
              <TableCell>
                <ReviewDateCell
                  riskId={r.id}
                  reviewDate={r.reviewDate}
                  onUpdated={onUpdated}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
