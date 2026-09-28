import { NextRequest, NextResponse } from "next/server";
import { allowRequest, clientIp } from "@/lib/guard";
import { handleRpc } from "@/lib/mcp";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!allowRequest(`mcp:${clientIp(req)}`, 20, 60_000)) {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32000, message: "Too many MCP requests." } },
      { status: 429 },
    );
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
      { status: 400 },
    );
  }
  const messages = Array.isArray(body) ? body : [body];
  const replies = [];
  for (const msg of messages) {
    if (!msg || typeof msg !== "object") continue;
    const reply = await handleRpc(msg as { method?: string; id?: string | number | null; params?: Record<string, unknown> });
    if (reply) replies.push(reply);
  }
  if (Array.isArray(body)) {
    return NextResponse.json(replies);
  }
  return NextResponse.json(replies[0] ?? { jsonrpc: "2.0", id: null, result: {} });
}

export async function GET() {
  return NextResponse.json({
    name: "basis-desk",
    transport: "streamable-http",
    endpoint: "/api/mcp",
    tools: ["desk_ticket", "desk_board", "desk_search", "desk_evidence"],
  });
}
