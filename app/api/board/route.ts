import { NextRequest, NextResponse } from "next/server";
import { CmcError } from "@/lib/cmc";
import { loadBoard } from "@/lib/desk";
import { allowRequest, clientIp, validBoardIds } from "@/lib/guard";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("ids") ?? "";
  const ids = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (!ids.length) {
    return NextResponse.json({ rows: [] });
  }
  if (!validBoardIds(ids)) {
    return NextResponse.json({ error: "Invalid board ids." }, { status: 400 });
  }
  if (!allowRequest(`board:${clientIp(req)}`, 8, 60_000)) {
    return NextResponse.json({ error: "Too many board requests." }, { status: 429 });
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
