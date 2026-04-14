import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ArtLens – Artwork Comparator",
  description: "Upload two artworks or files and get an instant AI-powered comparison using cutting-edge vision models.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ArtLens",
  },
  openGraph: {
    title: "ArtLens – Artwork Comparator",
    description: "AI-powered side-by-side artwork analysis.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#6c47ff",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>{children}</body>
    </html>
  );
}
