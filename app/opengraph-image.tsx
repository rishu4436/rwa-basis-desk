import { ImageResponse } from "next/og";

export const alt = "Basis Desk — cheapest liquid way to own the same real-world asset";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0b0d10",
          padding: "64px 72px",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: "#161A22",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              paddingLeft: 12,
              gap: 6,
            }}
          >
            <div
              style={{
                width: 32,
                height: 8,
                borderRadius: 2,
                background: "#E0B44A",
              }}
            />
            <div
              style={{
                width: 20,
                height: 8,
                borderRadius: 2,
                background: "#E0B44A",
              }}
            />
          </div>
          <div
            style={{
              fontSize: 28,
              color: "#ffffff",
              fontWeight: 600,
              letterSpacing: "-0.02em",
            }}
          >
            Basis Desk
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div
            style={{
              fontSize: 52,
              lineHeight: 1.12,
              color: "#ffffff",
              fontWeight: 600,
              letterSpacing: "-0.03em",
              maxWidth: 1000,
            }}
          >
            Find the cheapest liquid way to own the same real-world asset.
          </div>
          <div style={{ fontSize: 26, color: "rgba(255,255,255,0.55)", maxWidth: 860 }}>
            Same underlying. Different wrappers. Different liquidity.
          </div>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            color: "rgba(255,255,255,0.4)",
            fontSize: 22,
          }}
        >
          <span>CoinMarketCap RWA API</span>
          <span style={{ color: "#E0B44A" }}>rwa-basis-desk.vercel.app</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
