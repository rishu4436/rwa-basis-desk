import type { Metadata } from "next";
import { JudgeShell } from "@/components/judge-shell";
import { listTools } from "@/lib/desk-meta";

export const metadata: Metadata = {
  title: "MCP",
  description: "Basis Desk tools for any MCP client. The CMC key stays on the server.",
};

const curl = `curl -s https://rwa-basis-desk.vercel.app/api/mcp \\
  -H 'content-type: application/json' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"desk_ticket","arguments":{"asset":"NVDA"}}}'`;

export default function McpPage() {
  const tools = listTools();
  return (
    <JudgeShell
      title="MCP"
      lede="Same engine as the desk, over Streamable HTTP. Agents see Prefer / Skip / Wait. The CoinMarketCap key never leaves the server."
    >
      <section>
        <h2 className="text-base font-medium text-white">Endpoint</h2>
        <p className="font-mono text-[13px] text-white/70">POST /api/mcp</p>
        <p className="mt-2">
          Methods: <span className="font-mono">initialize</span>,{" "}
          <span className="font-mono">tools/list</span>,{" "}
          <span className="font-mono">tools/call</span>, <span className="font-mono">ping</span>.
        </p>
      </section>
      <section>
        <h2 className="text-base font-medium text-white">Tools</h2>
        <ul className="mt-2 space-y-3">
          {tools.map((tool) => (
            <li key={tool.name}>
              <span className="font-mono text-gold-400">{tool.name}</span>
              <span className="mt-1 block text-white/60">{tool.description}</span>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="text-base font-medium text-white">Try it</h2>
        <pre className="overflow-x-auto rounded-lg border border-white/10 bg-white/[0.03] p-3 text-[12px] leading-5 text-white/70">
          {curl}
        </pre>
      </section>
    </JudgeShell>
  );
}
