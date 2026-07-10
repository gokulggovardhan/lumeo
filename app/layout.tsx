import type { Metadata } from "next";
import { DM_Sans, DM_Serif_Display } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

const dmSerif = DM_Serif_Display({
  variable: "--font-dm-serif",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://lumeo.in"),
  title: "Lumeo PDF - Private Browser PDF Tools | Merge, Split & Convert PDFs",
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
      { url: "/android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/android-chrome-512x512.png", sizes: "512x512", type: "image/png" },
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
    images: [
      {
        url: "/og-image.svg",
        width: 1200,
        height: 630,
        alt: "Lumeo PDF Workspace",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Lumeo PDF Workspace",
    description: "Private PDF tools that run in your browser.",
    images: ["/og-image.svg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${dmSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
