"use client";

import { Bell, Search, ChevronDown } from "lucide-react";
import Image from "next/image";

interface TopbarProps {
  title: string;
  breadcrumbs?: { label: string; href?: string }[];
  actions?: React.ReactNode;
}

export function Topbar({ title, breadcrumbs, actions }: TopbarProps) {
  return (
    <header
      className="flex h-[60px] shrink-0 items-center justify-between px-7"
      style={{
        background: "#FFFFFF",
        borderBottom: "1px solid rgba(0,0,0,0.07)",
      }}
    >
      <nav className="flex items-center gap-1.5 text-[12px]" style={{ color: "#8A95A3" }}>
        {breadcrumbs?.map((b, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <span style={{ color: "#CBD3DF" }}>/</span>}
            {b.href ? (
              <a href={b.href} className="transition-colors hover:text-slate-700">{b.label}</a>
            ) : (
              <span style={{ color: "#4A5568", fontWeight: 500 }}>{b.label}</span>
            )}
          </span>
        ))}
        {!breadcrumbs && (
          <span style={{ color: "#0F1923", fontWeight: 600, fontSize: "13px" }}>{title}</span>
        )}
      </nav>

      <div className="flex items-center gap-1">
        {actions}
        <button
          className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-slate-100"
          aria-label="Search"
        >
          <Search className="h-4 w-4" style={{ color: "#8A95A3" }} />
        </button>
        <button
          className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-slate-100"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" style={{ color: "#8A95A3" }} />
        </button>
        <button
          className="ml-1 flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-100"
        >
          <Image
            src="/icon_veriqas.png"
            alt="VERIQAS"
            width={28}
            height={28}
            className="rounded-full"
          />
          <span className="text-[13px] font-500" style={{ color: "#0F1923", fontWeight: 500 }}>Admin</span>
          <ChevronDown className="h-3 w-3" style={{ color: "#8A95A3" }} />
        </button>
      </div>
    </header>
  );
}
