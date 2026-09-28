import Link from "next/link";
import { LogoMark } from "@/components/logo";

export function JudgeShell({
  title,
  lede,
  children,
}: {
  title: string;
  lede: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#080A0D] text-[#F1EEE6]">
      <header className="border-b border-white/[0.06]">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <LogoMark className="h-7 w-7" />
            <span className="text-sm font-semibold">Basis Desk</span>
          </Link>
          <nav className="flex gap-4 text-[13px] text-[#858B96]">
            <Link href="/desk" className="hover:text-white">
              Desk
            </Link>
            <Link href="/methodology" className="hover:text-white">
              Method
            </Link>
            <Link href="/feedback" className="hover:text-white">
              API
            </Link>
            <Link href="/mcp" className="hover:text-white">
              MCP
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-white/60">{lede}</p>
        <div className="mt-8 space-y-6 text-sm leading-6 text-white/75">{children}</div>
      </main>
    </div>
  );
}
