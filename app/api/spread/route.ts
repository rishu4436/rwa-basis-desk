import { NextRequest, NextResponse } from "next/server";
import { CmcError } from "@/lib/cmc";
import { loadSpread } from "@/lib/spread";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const cluster = req.nextUrl.searchParams.get("cluster") || "gold";
  try {
    const series = await loadSpread(cluster);
    return NextResponse.json(series);
  } catch (err) {
    const status = err instanceof CmcError && err.status === 401 ? 401 : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Spread failed" },
      { status },
    );
  }
}
