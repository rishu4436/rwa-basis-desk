import type { Metadata } from "next";
import DeskClient from "./desk-client";

const SITE = "https://rwa-basis-desk.vercel.app";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ asset?: string }>;
}): Promise<Metadata> {
  const sp = (await searchParams) ?? {};
  const raw = typeof sp.asset === "string" ? sp.asset.trim() : "";
  const symbol = (raw || "GOLD").toUpperCase();
  const title = `${symbol} wrapper desk`;
  const description = `Which tokenized ${symbol} wrapper to trade, where to trade it, and whether the gap is real.`;
  const url = `${SITE}/desk?asset=${encodeURIComponent(raw || "GOLD")}`;
  return {
    title,
    description,
    openGraph: {
      type: "website",
      siteName: "Basis Desk",
      title: `${title} — Basis Desk`,
      description,
      url,
      images: [
        {
          url: "/opengraph-image",
          width: 1200,
          height: 630,
          alt: `${symbol} wrapper desk — Basis Desk`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} — Basis Desk`,
      description,
      images: ["/opengraph-image"],
    },
    alternates: { canonical: url },
  };
}

export default function DeskPage() {
  return <DeskClient />;
}
