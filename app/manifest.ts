import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lumeo",
    short_name: "Lumeo",
    description: "Premium online creative studio for polished short videos.",
    start_url: "/",
    display: "standalone",
    background_color: "#07070A",
    theme_color: "#F3E7C8",
    icons: [
      {
        src: "/lumeo-mark.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
