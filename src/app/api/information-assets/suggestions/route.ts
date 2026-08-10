import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { generateSuggestions } from "@/lib/information-assets/suggestions";

export async function GET() {
  const ctx = await getServerSession();
  if (!ctx?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const suggestions = await generateSuggestions(ctx.tenantId);
  return NextResponse.json({ suggestions });
}
