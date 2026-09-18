import { NextRequest, NextResponse } from "next/server";
import { CmcError } from "@/lib/cmc";
import { loadBoard } from "@/lib/desk";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("ids") ?? "";
  const ids = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (!ids.length) {
    return NextResponse.json({ rows: [] });
  }
  try {
    const rows = await loadBoard(ids);
    return NextResponse.json({ rows });
  } catch (err) {
    const status = err instanceof CmcError && err.status === 401 ? 401 : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Board failed" },
      { status },
    );
  }
}
