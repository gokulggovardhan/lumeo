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
  title: "Lumeo - Premium Online Video Editor for Creators",
  description:
    "Create, edit, reframe, title, and export polished videos for reels, shorts, podcasts, education, social media, and creator workflows with Lumeo.",
  applicationName: "Lumeo",
  authors: [{ name: "Lumeo" }],
  creator: "Lumeo",
  publisher: "Lumeo",
  keywords: [
    "online video editor",
    "creator studio",
    "video editing workspace",
    "reels editor",
    "shorts editor",
    "social media video editor",
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
    title: "Lumeo - Premium Online Video Editor for Creators",
    description:
      "Create, edit, reframe, title, and export polished videos for reels, shorts, podcasts, education, social media, and creator workflows with Lumeo.",
    images: [
      {
        url: "/og-image.svg",
        width: 1200,
        height: 630,
        alt: "Lumeo Studio - Create clean short videos.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Lumeo - Premium Online Video Editor for Creators",
    description:
      "Create, edit, reframe, title, and export polished videos for reels, shorts, podcasts, education, social media, and creator workflows with Lumeo.",
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
