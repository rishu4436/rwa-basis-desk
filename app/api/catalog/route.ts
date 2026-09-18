import { NextRequest, NextResponse } from "next/server";
import { CmcError } from "@/lib/cmc";
import { listPopular, searchCatalog } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const type = req.nextUrl.searchParams.get("type") ?? "";
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
