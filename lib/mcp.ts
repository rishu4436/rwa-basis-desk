import { searchCatalog } from "./catalog";
import { loadBoard, loadDesk } from "./desk";
import type { BoardRow, DeskSnapshot, TicketAction } from "./types";

export const API_FRICTION = [
  "market-pairs/list returns error_code 1006 on the hackathon Startup plan. The desk keeps the basis call and labels venue coverage as plan-gated.",
  "No underlying NAV or exchange print on the RWA family. The liquid reference is wrapper versus wrapper. Any Yahoo print is a labeled benchmark and is not mixed into the ticket.",
  "No RWA history endpoint. 30-day spread joins each wrapper crypto_id into /v2/cryptocurrency/ohlcv/historical.",
  "Gold units are inconsistent (troy ounce and gram). Gram tokens are scaled before any price sort.",
  "One underlying can be many rwa_ids. Clustering by ticker family is required.",
  "quotes/latest data is sometimes keyed rwa_assets and sometimes assets. Parsers accept both.",
] as const;

const TOOLS = [
  {
    name: "desk_ticket",
    description:
      "Prefer, Skip, or Wait for one real-world asset. Dollars, named trap, liquid reference, and labeled benchmark.",
    inputSchema: {
      type: "object",
      properties: {
        asset: {
          type: "string",
          description: "TradFi ticker such as GOLD, NVDA, SPY, AAPL.",
        },
      },
      required: ["asset"],
    },
  },
  {
    name: "desk_board",
    description:
      "Ranked Prefer / Skip / Wait calls for up to 8 tickers. Prefer and Skip sort ahead of Wait.",
    inputSchema: {
      type: "object",
      properties: {
        assets: {
          type: "array",
          items: { type: "string" },
          description: "Tickers, max 8.",
        },
      },
      required: ["assets"],
    },
  },
  {
    name: "desk_search",
    description: "Find a tokenized real-world asset by tradfi ticker or name.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
      },
      required: ["query"],
    },
  },
  {
    name: "desk_evidence",
    description:
      "Endpoints used on a desk load, plus the API frictions this product hit.",
    inputSchema: {
      type: "object",
      properties: {
        asset: {
          type: "string",
          description: "Optional ticker. Omit for the friction list only.",
        },
      },
    },
  },
] as const;

export function listTools() {
  return TOOLS;
}

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
    if (!asset) throw new Error("asset is required");
    return ticketPayload(await loadDesk(asset));
  }
  if (name === "desk_board") {
    const raw = Array.isArray(args.assets) ? args.assets : [];
    const assets = raw.map((a) => String(a).trim()).filter(Boolean).slice(0, 8);
    if (!assets.length) throw new Error("assets is required");
    const rows = await loadBoard(assets);
    return { rows: rows.map(boardPayload) };
  }
  if (name === "desk_search") {
    const query = String(args.query ?? "").trim();
    if (!query) throw new Error("query is required");
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
