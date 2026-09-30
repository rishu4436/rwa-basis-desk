import { searchCatalog } from "./catalog";
import { loadBoard, loadDesk } from "./desk";
import { validBoardIds, validCluster } from "./guard";
import { API_FRICTION, listTools } from "./desk-meta";
import type { BoardRow, DeskSnapshot, TicketAction } from "./types";

export { API_FRICTION, listTools };

function callName(action: TicketAction): string {
  if (action === "buy") return "Prefer";
  if (action === "skip") return "Skip";
  if (action === "wait") return "Wait";
  return "Only one";
}

export function ticketPayload(desk: DeskSnapshot) {
  const t = desk.ticket;
  return {
    asset: desk.cluster.rwaSymbols[0] ?? desk.cluster.id,
    label: desk.cluster.label,
    call: callName(t.action),
    action: t.action,
    headline: t.headline,
    detail: t.detail,
    prefer: t.buySymbol,
    avoid: t.avoidSymbol,
    trap: t.trap?.symbol ?? null,
    trapHoldUsd: t.trap?.holdUsd ?? null,
    executableUsd:
      t.action === "buy"
        ? (desk.wrappers.find((w) =>
            t.buyCryptoId != null ? w.cryptoId === t.buyCryptoId : w.symbol === t.buySymbol,
          )?.capacityUsd ?? null)
        : null,
    spreadBps: t.spreadBps,
    dollarGap: t.dollarGap,
    liquidReferenceUsd: desk.liquidReferenceUsd,
    unit: desk.cluster.unit,
    benchmark: desk.benchmark,
    source: desk.source,
    endpointsUsed: desk.endpointsUsed,
    note: "Gross wrapper basis versus the liquid core. Not a locked-in profit and not a NAV.",
  };
}

function boardPayload(row: BoardRow) {
  return {
    asset: row.symbol,
    call: callName(row.action),
    headline: row.headline,
    prefer: row.buySymbol,
    avoid: row.avoidSymbol,
    trap: row.trapSymbol,
    spreadBps: row.spreadBps,
    dollarGap: row.dollarGap,
    liquidReferenceUsd: row.liquidReferenceUsd,
    error: row.error ?? null,
  };
}

export async function callTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (name === "desk_ticket") {
    const asset = String(args.asset ?? "").trim();
    if (!validCluster(asset)) throw new Error("invalid asset");
    return ticketPayload(await loadDesk(asset));
  }
  if (name === "desk_board") {
    const raw = Array.isArray(args.assets) ? args.assets : [];
    const assets = raw.map((a) => String(a).trim()).filter(Boolean).slice(0, 8);
    if (!assets.length || !validBoardIds(assets)) throw new Error("invalid assets");
    const rows = await loadBoard(assets);
    return { rows: rows.map(boardPayload) };
  }
  if (name === "desk_search") {
    const query = String(args.query ?? "").trim();
    if (query.length < 1 || query.length > 40) throw new Error("invalid query");
    const hits = await searchCatalog(query);
    return {
      hits: hits.slice(0, 12).map((h) => ({
        symbol: h.symbol,
        name: h.name,
        rwaId: h.rwaId,
        assetType: h.assetType,
        wrappers: h.wrappers,
      })),
    };
  }
  if (name === "desk_evidence") {
    const asset = String(args.asset ?? "").trim();
    if (!asset) return { friction: API_FRICTION };
    if (!validCluster(asset)) throw new Error("invalid asset");
    const desk = await loadDesk(asset);
    return {
      asset: desk.cluster.rwaSymbols[0] ?? asset,
      source: desk.source,
      endpointsUsed: desk.endpointsUsed,
      evidence: desk.evidence,
      venueCoverage: desk.venueCoverage,
      benchmark: desk.benchmark,
      friction: API_FRICTION,
    };
  }
  throw new Error(`Unknown tool ${name}`);
}

type Rpc = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

export async function handleRpc(body: Rpc): Promise<Record<string, unknown> | null> {
  const id = body.id ?? null;
  if (body.method?.startsWith("notifications/")) return null;
  try {
    if (body.method === "initialize") {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "basis-desk", version: "0.1.0" },
        },
      };
    }
    if (body.method === "tools/list") {
      return { jsonrpc: "2.0", id, result: { tools: listTools() } };
    }
    if (body.method === "tools/call") {
      const params = body.params ?? {};
      const name = String(params.name ?? "");
      const args = (params.arguments ?? {}) as Record<string, unknown>;
      const data = await callTool(name, args);
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: JSON.stringify(data) }],
        },
      };
    }
    if (body.method === "ping") {
      return { jsonrpc: "2.0", id, result: {} };
    }
    return {
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: `Method not found: ${body.method ?? ""}` },
    };
  } catch (err) {
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32000,
        message: err instanceof Error ? err.message : "Tool failed",
      },
    };
  }
}
