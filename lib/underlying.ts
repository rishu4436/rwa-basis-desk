import { asArray, cmcGet, num } from "./cmc";
import type { UnderlyingInfo } from "./types";

function rwaAssets(data: unknown): Record<string, unknown>[] {
  const root = (data ?? {}) as Record<string, unknown>;
  return asArray<Record<string, unknown>>(root.rwa_assets ?? root.assets ?? []);
}

function firstParagraphs(md: string): string {
  const plain = md
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/#{1,6}\s+/g, "")
    .replace(/\*\*/g, "")
    .replace(/\s+\n/g, "\n")
    .trim();
  const parts = plain
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n/g, " ").trim())
    .filter(
      (p) =>
        p.length > 60 &&
        !/^(what|how|why|who|which)\b/i.test(p) &&
        !p.endsWith("?"),
    );
  const text = (parts.slice(0, 2).join(" ") || plain).slice(0, 520);
  return text.trim();
}

export async function loadUnderlying(
  rwaId: number,
  extras?: {
    tokenizedMcap?: number | null;
    tokenizedVolume?: number | null;
  },
): Promise<UnderlyingInfo | null> {
  const res = await cmcGet("/v5/real-world-assets/info", { rwa_id: rwaId });
  const asset = rwaAssets(res.data)[0];
  if (!asset) return null;
  const aboutRaw = asset.about;
  let about: string | null = null;
  if (typeof aboutRaw === "string") about = firstParagraphs(aboutRaw);
  else if (aboutRaw && typeof aboutRaw === "object") {
    const desc = (aboutRaw as Record<string, unknown>).description;
    if (typeof desc === "string") about = firstParagraphs(desc);
  }
  const founded = asset.founded != null ? String(asset.founded).slice(0, 10) : null;
  return {
    rwaId,
    name: String(asset.name ?? ""),
    symbol: String(asset.symbol ?? ""),
    assetType: String(asset.asset_type ?? ""),
    website: asset.website ? String(asset.website) : null,
    industry: asset.industry ? String(asset.industry) : null,
    cik: asset.cik ? String(asset.cik) : null,
    founded,
    employees: num(asset.employees),
    primaryExchange: asset.primary_exchange
      ? String(asset.primary_exchange)
      : null,
    about,
    tokenizedMcap: extras?.tokenizedMcap ?? num(asset.tokenized_market_cap),
    tokenizedVolume: extras?.tokenizedVolume ?? num(asset.tokenized_volume_24h),
  };
}
