import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lumeo",
    short_name: "Lumeo",
    description: "Simple, private PDF tools for everyday documents.",
    start_url: "/",
    display: "standalone",
    background_color: "#0C1220",
    theme_color: "#1E6B4A",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
