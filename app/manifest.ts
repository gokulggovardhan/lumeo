import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lumeo PDF Workspace",
    short_name: "Lumeo PDF",
    description: "Premium private browser-first PDF tools.",
    start_url: "/",
    display: "standalone",
    background_color: "#1B1D1A",
    theme_color: "#1E6B4A",
    icons: [
      {
        src: "/android-chrome-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/android-chrome-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
