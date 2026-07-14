import type { SVGProps } from "react";

const paths: Record<string, string> = {
  overview: "M4 12h6V4H4v8Zm10 8h6V4h-6v16ZM4 20h6v-6H4v6Z",
  analytics: "M5 19V9m7 10V5m7 14v-7",
  tools: "M5 7h14M7 12h10M9 17h6",
  homepage: "M4 11 12 5l8 6v8a1 1 0 0 1-1 1h-5v-5h-4v5H5a1 1 0 0 1-1-1v-8Z",
  flags: "M6 21V5m0 0h11l-2 4 2 4H6",
  announcements: "M5 9v6l4-2h4l6 4V7l-6 4H9L5 9Z",
  seo: "M4 6h16M4 12h10M4 18h7",
  audit: "M6 4h12v16H6V4Zm3 5h6M9 13h6M9 17h3",
  system: "M12 3v3m0 12v3m9-9h-3M6 12H3m15.4-6.4-2.1 2.1M7.7 16.3l-2.1 2.1m12.8 0-2.1-2.1M7.7 7.7 5.6 5.6",
  settings: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v3m0 12v3M4.9 4.9 7 7m10 10 2.1 2.1M3 12h3m12 0h3M4.9 19.1 7 17m10-10 2.1-2.1",
  design: "M4 6h16M6 6v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6M8 10h8M8 14h5",
  guide: "M5 5.5A2.5 2.5 0 0 1 7.5 3H20v15H8a3 3 0 0 0-3 3V5.5Zm0 0V21m4-13h7m-7 4h7m-7 4h4",
};

export function AdminIcon({
  name,
  className = "h-4 w-4",
  ...props
}: SVGProps<SVGSVGElement> & { name: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
      {...props}
    >
      <path
        d={paths[name] ?? paths.overview}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={name === "overview" ? "currentColor" : "none"}
        fillOpacity={name === "overview" ? 0.14 : 0}
      />
    </svg>
  );
}
