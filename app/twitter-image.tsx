import { ImageResponse } from "next/og";

export const alt = "Lumeo PDF Workspace private browser PDF tools";

export const size = {
  width: 1200,
  height: 600,
};

export const contentType = "image/png";

export default function TwitterImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          overflow: "hidden",
          background: "#1B1D1A",
          color: "#F0EAD6",
          padding: "64px 76px",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 28,
            display: "flex",
            border: "1px solid rgba(232, 223, 200, 0.18)",
            borderRadius: 28,
          }}
        />

        <div
          style={{
            position: "absolute",
            right: 72,
            top: 64,
            width: 300,
            height: 392,
            display: "flex",
            borderRadius: 24,
            border: "2px solid rgba(232, 223, 200, 0.22)",
            background: "#2F322C",
            transform: "rotate(4deg)",
          }}
        >
          {[70, 102, 134].map((top, index) => (
            <div
              key={top}
              style={{
                position: "absolute",
                left: 38,
                right: 38 + index * 20,
                top,
                height: 2,
                display: "flex",
                background:
                  index === 0
                    ? "rgba(240, 234, 214, 0.32)"
                    : "rgba(240, 234, 214, 0.18)",
              }}
            />
          ))}
        </div>

        <div
          style={{
            position: "relative",
            width: 760,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 20,
            }}
          >
            <div
              style={{
                width: 72,
                height: 72,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 36,
                border: "2px solid #C9A84C",
                background: "#1E6B4A",
                color: "#F0EAD6",
                fontSize: 28,
                fontWeight: 700,
              }}
            >
              PDF
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  fontSize: 25,
                  fontWeight: 700,
                  letterSpacing: 1,
                }}
              >
                Lumeo PDF Workspace
              </div>

              <div
                style={{
                  marginTop: 7,
                  fontSize: 15,
                  color: "rgba(240, 234, 214, 0.58)",
                  letterSpacing: 4,
                  textTransform: "uppercase",
                }}
              >
                lumeo.in
              </div>
            </div>
          </div>

          <div
            style={{
              marginTop: 62,
              display: "flex",
              fontFamily: "Georgia, serif",
              fontSize: 65,
              lineHeight: 1.05,
              letterSpacing: -2,
            }}
          >
            Private browser
            <br />
            PDF tools
          </div>

          <div
            style={{
              marginTop: 44,
              display: "flex",
              color: "#C9A84C",
              fontSize: 23,
              fontWeight: 600,
              letterSpacing: 2,
            }}
          >
            Merge &middot; Split &middot; Compress
          </div>
        </div>
      </div>
    ),
    size,
  );
}