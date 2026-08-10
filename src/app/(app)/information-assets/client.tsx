"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AssetSuggestion } from "@/lib/information-assets/suggestions";
import { Plus, Pencil, Trash2, Sparkles, X, ChevronDown, Check } from "lucide-react";

// â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface AssetRow {
  id: string;
  ref: string;
  name: string;
  description: string | null;
  dataCategory: string;
  classificationConfidentiality: string;
  retentionYears: number | null;
  requiredConfidentialityYears: number | null;
  regulatoryRelevance: string[];
  hndlRisk: string;
  createdAt: string;
}

interface FormState {
  name: string;
  description: string;
  dataCategory: string;
  classificationConfidentiality: string;
  retentionYears: string;
  requiredConfidentialityYears: string;
  regulatoryRelevance: string[];
  hndlRisk: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  description: "",
  dataCategory: "APPLICATION_DATA",
  classificationConfidentiality: "CONFIDENTIAL",
  retentionYears: "",
  requiredConfidentialityYears: "",
  regulatoryRelevance: [],
  hndlRisk: "UNKNOWN",
};

// â”€â”€ Style constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const HNDL_META: Record<string, { label: string; color: string; bg: string }> = {
  CRITICAL:       { label: "Critical HNDL",    color: "#EF4444", bg: "#FEF2F2" },
  HIGH:           { label: "High HNDL",         color: "#F97316", bg: "#FFF7ED" },
  MEDIUM:         { label: "Medium HNDL",       color: "#F59E0B", bg: "#FFFBEB" },
  LOW:            { label: "Low HNDL",          color: "#10B981", bg: "#ECFDF5" },
  NOT_APPLICABLE: { label: "Not Applicable",    color: "#8A95A3", bg: "#F5F5F7" },
  UNKNOWN:        { label: "Unassessed",        color: "#CBD3DF", bg: "#F5F5F7" },
};

const DATA_CATEGORIES = [
  "PERSONAL_DATA", "FINANCIAL", "HEALTH_DATA", "CREDENTIALS", "CRYPTOGRAPHIC",
  "LEGAL", "COMMUNICATIONS", "OPERATIONAL", "APPLICATION_DATA", "OTHER",
];

const REGULATORY_OPTIONS = ["GDPR", "PCI-DSS", "HIPAA", "CCPA", "SOX", "ISO27001", "SOC2", "NIST-PQC"];

const HNDL_OPTIONS = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "NOT_APPLICABLE", "UNKNOWN"];

const CLASSIFICATION_OPTIONS = ["TOP_SECRET", "SECRET", "CONFIDENTIAL", "INTERNAL", "PUBLIC"];

// â”€â”€ Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function InformationAssetsClient({
  initialAssets,
  suggestions,
}: {
  initialAssets: AssetRow[];
  suggestions: AssetSuggestion[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [assets, setAssets] = useState<AssetRow[]>(initialAssets);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(suggestions.length > 0);
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(new Set());
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const pendingSuggestions = suggestions.filter(
    s => !acceptedIds.has(s.id) && !dismissedIds.has(s.id)
  );

  // â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function openAdd() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setFormError("");
    setShowModal(true);
  }

  function openEdit(a: AssetRow) {
    setForm({
      name: a.name,
      description: a.description ?? "",
      dataCategory: a.dataCategory,
      classificationConfidentiality: a.classificationConfidentiality,
      retentionYears: a.retentionYears?.toString() ?? "",
      requiredConfidentialityYears: a.requiredConfidentialityYears?.toString() ?? "",
      regulatoryRelevance: a.regulatoryRelevance,
      hndlRisk: a.hndlRisk,
    });
    setEditingId(a.id);
    setFormError("");
    setShowModal(true);
  }

  function prefillFromSuggestion(s: AssetSuggestion) {
    setForm({
      name: s.name,
      description: s.description,
      dataCategory: s.dataCategory,
      classificationConfidentiality: "CONFIDENTIAL",
      retentionYears: s.retentionYears?.toString() ?? "",
      requiredConfidentialityYears: s.retentionYears?.toString() ?? "",
      regulatoryRelevance: s.regulatoryRelevance,
      hndlRisk: s.hndlRisk,
    });
    setEditingId(null);
    setFormError("");
    setShowModal(true);
    setAcceptedIds(prev => new Set([...prev, s.id]));
  }

  function toggleRegulatory(tag: string) {
    setForm(f => ({
      ...f,
      regulatoryRelevance: f.regulatoryRelevance.includes(tag)
        ? f.regulatoryRelevance.filter(r => r !== tag)
        : [...f.regulatoryRelevance, tag],
    }));
  }

  // â”€â”€ CRUD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async function handleSave() {
    if (!form.name.trim()) { setFormError("Name is required"); return; }
    setSaving(true);
    setFormError("");
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        dataCategory: form.dataCategory,
        classificationConfidentiality: form.classificationConfidentiality,
        retentionYears: form.retentionYears ? parseInt(form.retentionYears) : null,
        requiredConfidentialityYears: form.requiredConfidentialityYears ? parseInt(form.requiredConfidentialityYears) : null,
        regulatoryRelevance: form.regulatoryRelevance,
        hndlRisk: form.hndlRisk,
      };

      if (editingId) {
        await fetch(`/api/information-assets/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        setAssets(prev => prev.map(a => a.id === editingId ? { ...a, ...payload } : a));
      } else {
        const res = await fetch("/api/information-assets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const { asset } = await res.json();
        setAssets(prev => [asset, ...prev]);
      }
      setShowModal(false);
      startTransition(() => router.refresh());
    } catch {
      setFormError("Failed to save — please try again");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await fetch(`/api/information-assets/${id}`, { method: "DELETE" });
      setAssets(prev => prev.filter(a => a.id !== id));
      startTransition(() => router.refresh());
    } finally {
      setDeletingId(null);
    }
  }

  // â”€â”€ Render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const hndlCounts = HNDL_OPTIONS.reduce((acc, k) => {
    acc[k] = assets.filter(a => a.hndlRisk === k).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div>
      {/* â”€â”€ Header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 style={{ fontSize: "20px", fontWeight: 700, color: "#0F1923", letterSpacing: "-0.02em" }}>
            Information Assets
          </h1>
          <p className="mt-1" style={{ fontSize: "12px", color: "#8A95A3" }}>
            {assets.length} registered asset{assets.length !== 1 ? "s" : ""}
            {pendingSuggestions.length > 0 && (
              <> · <span style={{ color: "#F59E0B", fontWeight: 600 }}>{pendingSuggestions.length} suggestion{pendingSuggestions.length !== 1 ? "s" : ""} from scans</span></>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {suggestions.length > 0 && (
            <button
              onClick={() => setShowSuggestions(v => !v)}
              className="flex items-center gap-2 rounded-lg px-3 py-2 transition-opacity hover:opacity-80"
              style={{ background: "#FFFBEB", border: "1px solid #F59E0B" }}
            >
              <Sparkles className="h-3.5 w-3.5" style={{ color: "#F59E0B" }} />
              <span style={{ fontSize: "12px", fontWeight: 600, color: "#92400E" }}>
                {pendingSuggestions.length} Scan Suggestion{pendingSuggestions.length !== 1 ? "s" : ""}
              </span>
            </button>
          )}
          <button
            onClick={openAdd}
            className="flex items-center gap-2 rounded-lg px-4 py-2 transition-opacity hover:opacity-80"
            style={{ background: "#0C1524" }}
          >
            <Plus className="h-4 w-4" style={{ color: "#f8781e" }} />
            <span style={{ fontSize: "13px", fontWeight: 600, color: "#FFFFFF" }}>Add Asset</span>
          </button>
        </div>
      </div>

      {/* â”€â”€ HNDL summary strip â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {assets.length > 0 && (
        <div className="mb-6 grid grid-cols-3 gap-3 sm:grid-cols-6">
          {HNDL_OPTIONS.map(k => {
            const m = HNDL_META[k];
            const count = hndlCounts[k] ?? 0;
            return (
              <div
                key={k}
                className="rounded-xl px-4 py-3"
                style={{ background: "#FFFFFF", border: `1px solid ${count > 0 ? m.color + "40" : "rgba(0,0,0,0.06)"}`, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
              >
                <p style={{ fontSize: "9px", fontWeight: 700, color: "#8A95A3", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "4px" }}>
                  {m.label.replace(" HNDL", "")}
                </p>
                <p style={{ fontSize: "22px", fontWeight: 800, color: count > 0 ? m.color : "#CBD3DF", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                  {count}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* â”€â”€ Suggestions panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {showSuggestions && pendingSuggestions.length > 0 && (
        <div
          className="mb-6 rounded-xl overflow-hidden"
          style={{ border: "1px solid #F59E0B40", background: "#FFFBEB" }}
        >
          <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: "1px solid #F59E0B30" }}>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" style={{ color: "#F59E0B" }} />
              <span style={{ fontSize: "12px", fontWeight: 700, color: "#92400E" }}>
                Suggested from scan observations — review and add
              </span>
            </div>
            <button onClick={() => setShowSuggestions(false)}>
              <X className="h-4 w-4" style={{ color: "#92400E" }} />
            </button>
          </div>
          <div className="divide-y" style={{ borderColor: "#F59E0B20" }}>
            {pendingSuggestions.map(s => {
              const hndl = HNDL_META[s.hndlRisk];
              return (
                <div key={s.id} className="flex items-start gap-4 px-5 py-3.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p style={{ fontSize: "13px", fontWeight: 600, color: "#0F1923" }}>{s.name}</p>
                      <span
                        className="rounded-full px-2 py-0.5"
                        style={{ fontSize: "9px", fontWeight: 700, color: hndl.color, background: hndl.bg }}
                      >
                        {hndl.label}
                      </span>
                      <span style={{ fontSize: "10px", color: "#8A95A3", background: "#F5F5F7", borderRadius: "4px", padding: "1px 6px" }}>
                        {s.confidence}% confidence
                      </span>
                    </div>
                    <p style={{ fontSize: "11px", color: "#92400E" }}>{s.source}</p>
                    {s.regulatoryRelevance.length > 0 && (
                      <div className="flex gap-1 mt-1">
                        {s.regulatoryRelevance.map(r => (
                          <span key={r} style={{ fontSize: "9px", color: "#4A5568", background: "#F5F5F7", borderRadius: "4px", padding: "1px 6px", fontWeight: 600 }}>
                            {r}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => prefillFromSuggestion(s)}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-opacity hover:opacity-80"
                      style={{ background: "#0C1524", fontSize: "11px", fontWeight: 600, color: "#FFFFFF" }}
                    >
                      <Check className="h-3 w-3" style={{ color: "#f8781e" }} />
                      Add & Review
                    </button>
                    <button
                      onClick={() => setDismissedIds(prev => new Set([...prev, s.id]))}
                      className="rounded-lg px-3 py-1.5 transition-opacity hover:opacity-70"
                      style={{ background: "transparent", border: "1px solid #F59E0B60", fontSize: "11px", color: "#92400E" }}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* â”€â”€ Asset register table â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.07)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
      >
        <div className="px-5 py-3.5" style={{ borderBottom: "1px solid #F5F5F7" }}>
          <p style={{ fontSize: "11px", fontWeight: 700, color: "#8A95A3", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Registered Assets
          </p>
        </div>

        {assets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <p style={{ fontSize: "14px", fontWeight: 600, color: "#0F1923" }}>No information assets registered</p>
            <p style={{ fontSize: "12px", color: "#8A95A3" }}>
              Add assets manually or use the scan suggestions above
            </p>
            <button
              onClick={openAdd}
              className="mt-2 flex items-center gap-2 rounded-lg px-4 py-2 transition-opacity hover:opacity-80"
              style={{ background: "#0C1524" }}
            >
              <Plus className="h-4 w-4" style={{ color: "#f8781e" }} />
              <span style={{ fontSize: "13px", fontWeight: 600, color: "#FFFFFF" }}>Add First Asset</span>
            </button>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#F7F9FC" }}>
                  {["Ref", "Name", "Category", "HNDL Risk", "Retention", "Regulatory", "Classification", ""].map(h => (
                    <th
                      key={h}
                      style={{ padding: "8px 16px", textAlign: "left", fontSize: "10px", fontWeight: 700, color: "#8A95A3", letterSpacing: "0.07em", textTransform: "uppercase", borderBottom: "1px solid #F0F4F8", whiteSpace: "nowrap" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {assets.map((a, i) => {
                  const hndl = HNDL_META[a.hndlRisk] ?? HNDL_META["UNKNOWN"];
                  return (
                    <tr
                      key={a.id}
                      style={{ borderBottom: "1px solid #F5F5F7", background: i % 2 === 1 ? "#FAFAFA" : "#FFFFFF" }}
                    >
                      <td style={{ padding: "10px 16px", fontSize: "10px", fontFamily: "monospace", color: "#CBD3DF", whiteSpace: "nowrap" }}>
                        {a.ref}
                      </td>
                      <td style={{ padding: "10px 16px", minWidth: "180px" }}>
                        <p style={{ fontSize: "13px", fontWeight: 600, color: "#0F1923" }}>{a.name}</p>
                        {a.description && (
                          <p className="truncate" style={{ fontSize: "11px", color: "#8A95A3", maxWidth: "220px" }}>{a.description}</p>
                        )}
                      </td>
                      <td style={{ padding: "10px 16px", fontSize: "11px", color: "#4A5568", whiteSpace: "nowrap" }}>
                        {a.dataCategory.replace(/_/g, " ")}
                      </td>
                      <td style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>
                        <span
                          className="rounded-full px-2 py-0.5"
                          style={{ fontSize: "10px", fontWeight: 700, color: hndl.color, background: hndl.bg }}
                        >
                          {hndl.label}
                        </span>
                      </td>
                      <td style={{ padding: "10px 16px", fontSize: "12px", color: "#4A5568", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                        {a.retentionYears ? `${a.retentionYears}y` : "—"}
                        {a.requiredConfidentialityYears ? ` / ${a.requiredConfidentialityYears}y conf.` : ""}
                      </td>
                      <td style={{ padding: "10px 16px", minWidth: "140px" }}>
                        <div className="flex flex-wrap gap-1">
                          {a.regulatoryRelevance.map(r => (
                            <span key={r} style={{ fontSize: "9px", fontWeight: 700, color: "#4A5568", background: "#F5F5F7", borderRadius: "4px", padding: "1px 6px" }}>
                              {r}
                            </span>
                          ))}
                          {a.regulatoryRelevance.length === 0 && <span style={{ fontSize: "11px", color: "#CBD3DF" }}>—</span>}
                        </div>
                      </td>
                      <td style={{ padding: "10px 16px", fontSize: "11px", color: "#4A5568", whiteSpace: "nowrap" }}>
                        {a.classificationConfidentiality}
                      </td>
                      <td style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openEdit(a)}
                            className="rounded p-1.5 transition-colors hover:bg-slate-100"
                            title="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" style={{ color: "#8A95A3" }} />
                          </button>
                          <button
                            onClick={() => handleDelete(a.id)}
                            disabled={deletingId === a.id}
                            className="rounded p-1.5 transition-colors hover:bg-red-50"
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" style={{ color: deletingId === a.id ? "#CBD3DF" : "#EF4444" }} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* â”€â”€ Add / Edit Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div
            className="w-full max-w-lg rounded-2xl overflow-hidden"
            style={{ background: "#FFFFFF", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}
          >
            {/* Modal header */}
            <div
              className="flex items-center justify-between px-6 py-4"
              style={{ background: "#0C1524", borderBottom: "1px solid rgba(255,255,255,0.08)" }}
            >
              <p style={{ fontSize: "14px", fontWeight: 700, color: "#FFFFFF" }}>
                {editingId ? "Edit Information Asset" : "Add Information Asset"}
              </p>
              <button onClick={() => setShowModal(false)}>
                <X className="h-4 w-4" style={{ color: "rgba(255,255,255,0.5)" }} />
              </button>
            </div>

            {/* Modal body */}
            <div className="px-6 py-5 space-y-4" style={{ maxHeight: "70vh", overflowY: "auto" }}>
              {/* Name */}
              <div>
                <label style={labelStyle}>Asset Name *</label>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Customer Payment Records"
                  style={inputStyle}
                />
              </div>

              {/* Description */}
              <div>
                <label style={labelStyle}>Description</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Brief description of this data set..."
                  rows={2}
                  style={{ ...inputStyle, resize: "none" }}
                />
              </div>

              {/* Data Category + HNDL Risk */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label style={labelStyle}>Data Category</label>
                  <select
                    value={form.dataCategory}
                    onChange={e => setForm(f => ({ ...f, dataCategory: e.target.value }))}
                    style={inputStyle}
                  >
                    {DATA_CATEGORIES.map(c => (
                      <option key={c} value={c}>{c.replace(/_/g, " ")}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>HNDL Risk</label>
                  <select
                    value={form.hndlRisk}
                    onChange={e => setForm(f => ({ ...f, hndlRisk: e.target.value }))}
                    style={{ ...inputStyle, color: HNDL_META[form.hndlRisk]?.color ?? "#0F1923" }}
                  >
                    {HNDL_OPTIONS.map(h => (
                      <option key={h} value={h}>{HNDL_META[h]?.label ?? h}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Retention + Confidentiality years */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label style={labelStyle}>Retention (years)</label>
                  <input
                    type="number"
                    min={0}
                    value={form.retentionYears}
                    onChange={e => setForm(f => ({ ...f, retentionYears: e.target.value }))}
                    placeholder="e.g. 7"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Confidentiality required (years)</label>
                  <input
                    type="number"
                    min={0}
                    value={form.requiredConfidentialityYears}
                    onChange={e => setForm(f => ({ ...f, requiredConfidentialityYears: e.target.value }))}
                    placeholder="e.g. 10"
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Classification */}
              <div>
                <label style={labelStyle}>Confidentiality Classification</label>
                <select
                  value={form.classificationConfidentiality}
                  onChange={e => setForm(f => ({ ...f, classificationConfidentiality: e.target.value }))}
                  style={inputStyle}
                >
                  {CLASSIFICATION_OPTIONS.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {/* Regulatory relevance */}
              <div>
                <label style={labelStyle}>Regulatory Relevance</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {REGULATORY_OPTIONS.map(r => {
                    const active = form.regulatoryRelevance.includes(r);
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => toggleRegulatory(r)}
                        style={{
                          fontSize: "11px",
                          fontWeight: 600,
                          padding: "4px 10px",
                          borderRadius: "20px",
                          border: `1px solid ${active ? "#0C1524" : "#E2E8F0"}`,
                          background: active ? "#0C1524" : "#FFFFFF",
                          color: active ? "#f8781e" : "#8A95A3",
                          cursor: "pointer",
                          transition: "all 0.15s",
                        }}
                      >
                        {r}
                      </button>
                    );
                  })}
                </div>
              </div>

              {formError && (
                <p style={{ fontSize: "12px", color: "#EF4444" }}>{formError}</p>
              )}
            </div>

            {/* Modal footer */}
            <div
              className="flex items-center justify-end gap-3 px-6 py-4"
              style={{ borderTop: "1px solid #F5F5F7" }}
            >
              <button
                onClick={() => setShowModal(false)}
                style={{ fontSize: "13px", color: "#8A95A3", padding: "8px 16px", borderRadius: "8px", background: "transparent", cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 rounded-lg px-5 py-2 transition-opacity hover:opacity-80"
                style={{ background: "#0C1524", opacity: saving ? 0.6 : 1, cursor: saving ? "default" : "pointer" }}
              >
                <span style={{ fontSize: "13px", fontWeight: 600, color: "#FFFFFF" }}>
                  {saving ? "Saving…" : editingId ? "Save Changes" : "Add Asset"}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// â”€â”€ Shared input styles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "11px",
  fontWeight: 700,
  color: "#8A95A3",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  marginBottom: "5px",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  fontSize: "13px",
  color: "#0F1923",
  background: "#F7F9FC",
  border: "1px solid #E2E8F0",
  borderRadius: "8px",
  padding: "8px 12px",
  outline: "none",
  boxSizing: "border-box",
};
