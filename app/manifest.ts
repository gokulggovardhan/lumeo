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
        src: "/brand/lumeo-pdf-mark.png",
        sizes: "1254x1254",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
