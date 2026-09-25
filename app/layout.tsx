import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

const SITE = "https://rwa-basis-desk.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: "Basis Desk — RWA wrapper relative value",
    template: "%s — Basis Desk",
  },
  description:
    "Find the cheapest liquid way to own the same real-world asset. Basis Desk compares tokenized wrappers, drops thin liquidity, and prints an execution-aware ticket.",
  icons: { icon: "/logo.svg" },
  openGraph: {
    type: "website",
    siteName: "Basis Desk",
    title: "Basis Desk — RWA wrapper relative value",
    description:
      "Find the cheapest liquid way to own the same real-world asset.",
    url: SITE,
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Basis Desk" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Basis Desk — RWA wrapper relative value",
    description:
      "Find the cheapest liquid way to own the same real-world asset.",
    images: ["/opengraph-image"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`${sans.variable} ${mono.variable} font-sans antialiased min-h-screen`}
      >
        {children}
      </body>
    </html>
  );
}
