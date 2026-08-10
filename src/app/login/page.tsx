"use client";

import Image from "next/image";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const result = await signIn("credentials", {
      email: form.get("email") as string,
      password: form.get("password") as string,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("Invalid email or password.");
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-4">
          <Image src="/icon_veriqas.png" alt="VERIQAS Icon" width={56} height={56} priority />
          <Image
            src="/logo_veriqas.png"
            alt="VERIQAS"
            width={140}
            height={32}
            priority
            className="brightness-0 invert"
          />
          <p className="text-xs text-slate-500">Verified Quantum Assurance &amp; Governance</p>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900 p-6 shadow-xl">
          <h2 className="mb-5 text-sm font-semibold text-slate-200">Sign in to your account</h2>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400" htmlFor="email">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                defaultValue="admin@northstar.com"
                className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-[#f8781e] focus:outline-none focus:ring-1 focus:ring-[#f8781e]/40"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                defaultValue="Senqor2025!"
                className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-[#f8781e] focus:outline-none focus:ring-1 focus:ring-[#f8781e]/40"
              />
            </div>

            {error && (
              <p className="rounded border border-red-800 bg-red-950 px-3 py-2 text-xs text-red-400">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 flex w-full items-center justify-center rounded bg-[#f8781e] px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-[#d4611a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-[11px] text-slate-600">
          Northstar Financial Group · POC v0.1
        </p>
      </div>
    </div>
  );
}
