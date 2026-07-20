import type { Metadata, Viewport } from "next";
import { Fraunces, IBM_Plex_Mono, Inter } from "next/font/google";
import { AnalyticsPageView } from "@/components/analytics/AnalyticsPageView";
import { AnalyticsProvider } from "@/components/analytics/AnalyticsProvider";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import "./globals.css";

const inter = Inter({
  variable: "--font-manrope",
  subsets: ["latin"],
  display: "swap",
});

const fraunces = Fraunces({
  variable: "--font-dm-serif",
  subsets: ["latin"],
  weight: "variable",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: "500",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://lumeo.in"),
  title: {
    default:
      "Lumeo PDF - Private Browser PDF Tools | Merge, Split & Convert PDFs",
    template: "%s | Lumeo PDF",
  },
  description:
    "Merge, split, compress, and convert PDFs privately with Lumeo PDF Workspace. Fast browser-first PDF tools where your files stay on your device.",
  applicationName: "Lumeo PDF",
  authors: [{ name: "Lumeo PDF" }],
  creator: "Lumeo PDF",
  publisher: "Lumeo PDF",
  keywords: [
    "PDF tools",
    "merge PDF",
    "split PDF",
    "compress PDF",
    "JPG to PDF",
    "PDF to JPG",
    "private PDF workspace",
    "browser PDF tools",
    "Lumeo PDF",
    "Lumeo",
  ],
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png" },
      {
        url: "/android-chrome-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        url: "/android-chrome-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    url: "https://lumeo.in",
    siteName: "Lumeo PDF",
    title: "Lumeo PDF Workspace",
    description: "Private browser-first PDF tools for everyday documents.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Lumeo PDF Workspace",
    description: "Private PDF tools that run in your browser.",
  },
};

// viewportFit "cover" lets iOS content extend under the notch/home-indicator
// area, using env(safe-area-inset-*) in CSS to stay clear of it; themeColor
// tints the Android/Chrome address bar to match the brand outside of the
// installed-PWA context (the manifest's theme_color only applies once
// installed).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1E6B4A",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${fraunces.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AnalyticsProvider>
          <a href="#main-content" className="aura-skip-link">
            Skip to content
          </a>
          <AnnouncementBanner />
          <AnalyticsPageView />
          {children}
        </AnalyticsProvider>
      </body>
    </html>
  );
}
