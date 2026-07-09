import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://lumeo.in"),
  title: "Lumeo PDF Workspace – Simple, Private PDF Tools",
  description:
    "Merge, split, compress, and convert PDF files with a clean, privacy-first PDF workspace for everyday documents.",
  applicationName: "Lumeo",
  authors: [{ name: "Lumeo" }],
  creator: "Lumeo",
  publisher: "Lumeo",
  keywords: [
    "PDF tools",
    "merge PDF",
    "split PDF",
    "compress PDF",
    "JPG to PDF",
    "PDF to JPG",
    "private PDF workspace",
    "Lumeo",
  ],
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/lumeo-mark.svg",
  },
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    url: "https://lumeo.in",
    siteName: "Lumeo",
    title: "Lumeo PDF Workspace – Simple, Private PDF Tools",
    description:
      "Merge, split, compress, and convert PDF files with a clean, privacy-first PDF workspace for everyday documents.",
    images: [
      {
        url: "/og-image.svg",
        width: 1200,
        height: 630,
        alt: "Lumeo PDF Workspace - Simple, private PDF tools.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Lumeo PDF Workspace – Simple, Private PDF Tools",
    description:
      "Merge, split, compress, and convert PDF files with a clean, privacy-first PDF workspace for everyday documents.",
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
