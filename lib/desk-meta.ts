/** Tool names and API notes safe to import from pages. No API client. */

export const API_FRICTION = [
  "market-pairs/list returns error_code 1006 on the hackathon Startup plan. The desk labels venue coverage as plan-gated and will not turn a missing book into a Prefer or a size.",
  "No underlying NAV or exchange print on the RWA family. The liquid reference is wrapper versus wrapper. Any Yahoo print is a labeled benchmark and is not mixed into the ticket.",
  "No RWA history endpoint. 30-day spread joins each wrapper crypto_id into /v2/cryptocurrency/ohlcv/historical.",
  "Gold units are inconsistent (troy ounce and gram). Gram tokens are scaled before any price sort.",
  "One underlying can be many rwa_ids. Clustering by ticker family is required.",
  "quotes/latest data is sometimes keyed rwa_assets and sometimes assets. Parsers accept both.",
] as const;

export const MCP_TOOLS = [
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
  return MCP_TOOLS;
}
