import { NextRequest, NextResponse } from "next/server";
import { CmcError } from "@/lib/cmc";
import { listPopular, searchCatalog } from "@/lib/catalog";
import { allowRequest, clientIp, validCatalogType } from "@/lib/guard";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const type = (req.nextUrl.searchParams.get("type") ?? "").trim();
  if (q.length > 40) {
    return NextResponse.json({ error: "Query is too long." }, { status: 400 });
  }
  if (!validCatalogType(type)) {
    return NextResponse.json({ error: "Invalid asset type." }, { status: 400 });
  }
  if (q.length === 1) {
    return NextResponse.json({ results: [] });
  }
  if (!allowRequest(`catalog:${clientIp(req)}`, 30, 60_000)) {
    return NextResponse.json({ error: "Too many catalog requests." }, { status: 429 });
  }
  try {
    const results = q.trim()
      ? await searchCatalog(q, type)
      : await listPopular(40, type);
    return NextResponse.json({ results });
  } catch (err) {
    const status = err instanceof CmcError && err.status === 401 ? 401 : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Catalog failed" },
      { status },
    );
  }
}
