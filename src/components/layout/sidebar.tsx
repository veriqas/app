"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { navSections } from "./nav-config";

export function Sidebar({ permissions = [], role }: { permissions?: string[]; role?: string }) {
  const pathname = usePathname();
  const granted = new Set(permissions);

  // Hide what this session cannot open, and drop a section that ends up empty.
  const sections = navSections
    .map(s => ({ ...s, items: s.items.filter(i => !i.permission || granted.has(i.permission)) }))
    .filter(s => s.items.length > 0);

  return (
    <aside
      className="flex h-screen w-[220px] shrink-0 flex-col"
      style={{ background: "#0C1524", borderRight: "1px solid rgba(255,255,255,0.06)" }}
    >
      {/* Logo */}
      <div
        className="flex h-[60px] items-center justify-center"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <Image
          src="/logo_veriqas.png"
          alt="VERIQAS"
          width={120}
          height={28}
          priority
          className="h-7 w-auto"
        />
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        {sections.map((section) => (
          <div key={section.label} className="mb-5">
            <p
              className="mb-1.5 px-2 text-[10px] font-700 uppercase tracking-[0.12em]"
              style={{ color: "rgba(141,160,184,0.5)", fontWeight: 700 }}
            >
              {section.label}
            </p>
            {section.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2 py-[7px] text-[13px] transition-all duration-150",
                    active
                      ? "font-600"
                      : "font-400 hover:bg-white/5"
                  )}
                  style={{
                    fontWeight: active ? 600 : 400,
                    color: active ? "#FFFFFF" : "#8DA0B8",
                    background: active ? "rgba(248,120,30,0.12)" : undefined,
                  }}
                >
                  <item.icon
                    className="h-[14px] w-[14px] shrink-0"
                    style={{ color: active ? "#f8781e" : "currentColor", opacity: active ? 1 : 0.7 }}
                  />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div
        className="px-5 py-3"
        style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
      >
        <p className="text-[10px] font-medium tracking-wide" style={{ color: "rgba(141,160,184,0.4)" }}>
          VERIQAS · v0.1.0
        </p>
      </div>
    </aside>
  );
}
