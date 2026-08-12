"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, Loader2, Shield } from "lucide-react";

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState<"form" | "done">("form");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adminEmail, setAdminEmail] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const orgName = form.get("orgName") as string;
    const email = form.get("adminEmail") as string;
    const password = form.get("adminPassword") as string;
    const confirm = form.get("confirmPassword") as string;

    if (password !== confirm) {
      setError("Passwords do not match.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgName, adminEmail: email, adminPassword: password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Setup failed.");
        return;
      }
      setAdminEmail(data.adminEmail);
      setStep("done");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-4">
          <Image src="/icon_veriqas.png" alt="VERIQAS" width={56} height={56} priority />
          <Image src="/logo_veriqas.png" alt="VERIQAS" width={140} height={32} priority className="brightness-0 invert" />
          <p className="text-xs text-slate-500">Verified Quantum Assurance &amp; Governance</p>
        </div>

        {step === "done" ? (
          <div className="rounded-xl border border-green-800 bg-green-950/40 p-8 text-center shadow-xl">
            <CheckCircle className="mx-auto mb-4 h-10 w-10 text-green-400" />
            <h2 className="mb-2 text-base font-semibold text-slate-100">Platform configured</h2>
            <p className="mb-6 text-sm text-slate-400">
              Your VERIQAS instance is ready. Sign in with <span className="font-mono text-slate-300">{adminEmail}</span>.
            </p>
            <button
              onClick={() => router.push("/login")}
              className="w-full rounded-lg bg-[#f8781e] px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-[#d4611a] transition-colors"
            >
              Go to Sign In
            </button>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
            <div className="mb-5 flex items-center gap-2">
              <Shield className="h-4 w-4 text-[#f8781e]" />
              <h2 className="text-sm font-semibold text-slate-200">Initial Platform Setup</h2>
            </div>

            <p className="mb-5 text-xs text-slate-400 leading-relaxed">
              Configure your organisation and create the administrator account. This can only be done once.
            </p>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-400" htmlFor="orgName">
                  Organisation name
                </label>
                <input
                  id="orgName" name="orgName" type="text" required
                  placeholder="Acme Corporation"
                  className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-[#f8781e] focus:outline-none focus:ring-1 focus:ring-[#f8781e]/40"
                />
              </div>

              <div className="border-t border-slate-800 pt-4">
                <p className="mb-3 text-xs font-medium text-slate-400">Administrator account</p>
                <div className="space-y-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-400" htmlFor="adminEmail">
                      Email address
                    </label>
                    <input
                      id="adminEmail" name="adminEmail" type="email" required
                      placeholder="admin@yourcompany.com"
                      className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-[#f8781e] focus:outline-none focus:ring-1 focus:ring-[#f8781e]/40"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-400" htmlFor="adminPassword">
                      Password <span className="text-slate-500">(min. 10 characters)</span>
                    </label>
                    <input
                      id="adminPassword" name="adminPassword" type="password" required minLength={10}
                      className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-[#f8781e] focus:outline-none focus:ring-1 focus:ring-[#f8781e]/40"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-400" htmlFor="confirmPassword">
                      Confirm password
                    </label>
                    <input
                      id="confirmPassword" name="confirmPassword" type="password" required minLength={10}
                      className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-[#f8781e] focus:outline-none focus:ring-1 focus:ring-[#f8781e]/40"
                    />
                  </div>
                </div>
              </div>

              {error && (
                <p className="rounded border border-red-800 bg-red-950 px-3 py-2 text-xs text-red-400">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded bg-[#f8781e] px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-[#d4611a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {loading ? "Configuring…" : "Set up VERIQAS"}
              </button>
            </form>
          </div>
        )}

        <p className="mt-6 text-center text-[11px] text-slate-600">
          VERIQAS · Verified Quantum Assurance and Governance
        </p>
      </div>
    </div>
  );
}
