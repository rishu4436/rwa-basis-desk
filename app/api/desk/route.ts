import { NextRequest, NextResponse } from "next/server";
import { UnknownAssetError } from "@/lib/catalog";
import { CmcError } from "@/lib/cmc";
import { loadDesk } from "@/lib/desk";
import { allowRequest, clientIp, validCluster } from "@/lib/guard";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const cluster = (req.nextUrl.searchParams.get("cluster") || "gold").trim();
  if (!validCluster(cluster)) {
    return NextResponse.json({ error: "Invalid cluster." }, { status: 400 });
  }
  if (!allowRequest(`desk:${clientIp(req)}`, 20, 60_000)) {
    return NextResponse.json({ error: "Too many desk requests." }, { status: 429 });
  }
  try {
    const desk = await loadDesk(cluster);
    return NextResponse.json(desk);
  } catch (err) {
    const status =
      err instanceof UnknownAssetError
        ? 404
        : err instanceof CmcError && err.status === 401
          ? 401
          : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Desk failed" },
      { status },
    );
  }
}
