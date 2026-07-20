import { ImageResponse } from "next/og";

export const alt = "Lumeo PDF Workspace private browser PDF tools";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default function OpenGraphImage() {
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
          padding: "68px 76px",
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
            top: 72,
            width: 300,
            height: 410,
            display: "flex",
            borderRadius: 24,
            border: "2px solid rgba(232, 223, 200, 0.22)",
            background: "#2F322C",
            transform: "rotate(4deg)",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 38,
              right: 38,
              top: 70,
              height: 2,
              display: "flex",
              background: "rgba(240, 234, 214, 0.32)",
            }}
          />

          <div
            style={{
              position: "absolute",
              left: 38,
              right: 82,
              top: 102,
              height: 2,
              display: "flex",
              background: "rgba(240, 234, 214, 0.18)",
            }}
          />

          <div
            style={{
              position: "absolute",
              left: 38,
              right: 58,
              top: 134,
              height: 2,
              display: "flex",
              background: "rgba(240, 234, 214, 0.18)",
            }}
          />
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
                width: 76,
                height: 76,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 38,
                border: "2px solid #C9A84C",
                background: "#1E6B4A",
                color: "#F0EAD6",
                fontSize: 30,
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
              marginTop: 72,
              display: "flex",
              fontFamily: "Georgia, serif",
              fontSize: 68,
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
              marginTop: 52,
              display: "flex",
              alignItems: "center",
              color: "#C9A84C",
              fontSize: 24,
              fontWeight: 600,
              letterSpacing: 2,
            }}
          >
            Merge &middot; Split &middot; Compress &middot; Images &harr; PDF
          </div>
        </div>
      </div>
    ),
    size,
  );
}