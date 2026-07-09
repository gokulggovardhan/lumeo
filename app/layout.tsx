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
  title: "Lumeo PDF Workspace - Simple, Private PDF Tools",
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
    icon: "/brand/lumeo-pdf-mark.png",
    shortcut: "/brand/lumeo-pdf-mark.png",
    apple: "/brand/lumeo-pdf-mark.png",
  },
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    url: "https://lumeo.in",
    siteName: "Lumeo",
    title: "Lumeo PDF Workspace - Simple, Private PDF Tools",
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
    title: "Lumeo PDF Workspace - Simple, Private PDF Tools",
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
      className={`${dmSans.variable} ${dmSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
