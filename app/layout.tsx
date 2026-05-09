import type { Metadata, Viewport } from "next";
import { Poppins, Archivo_Black, Caveat, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { ServiceWorkerRegistrar } from "@/components/pwa/service-worker-registrar";
import { InstallBanner } from "@/components/pwa/install-banner";
import { OfflineBanner } from "@/components/pwa/offline-banner";
import "./globals.css";

const poppins = Poppins({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

const archivoBlack = Archivo_Black({
  variable: "--font-display",
  subsets: ["latin"],
  weight: "400",
});

const caveat = Caveat({
  variable: "--font-hand",
  subsets: ["latin"],
  weight: ["600", "700"],
});

const jetMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "TLC Management Platform",
  description: "Field service management for TLC Landscape — by Watt Systems",
  applicationName: "TLC",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "TLC",
    statusBarStyle: "default",
    startupImage: [
      { url: "/icons/apple-splash-640-1136.png", media: "(device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2)" },
      { url: "/icons/apple-splash-750-1334.png", media: "(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2)" },
      { url: "/icons/apple-splash-1125-2436.png", media: "(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3)" },
      { url: "/icons/apple-splash-1170-2532.png", media: "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)" },
      { url: "/icons/apple-splash-1290-2796.png", media: "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)" },
    ],
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#F15A24",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${poppins.variable} ${archivoBlack.variable} ${caveat.variable} ${jetMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        {children}
        <Toaster position="bottom-right" richColors closeButton />
        <ServiceWorkerRegistrar />
        <OfflineBanner />
        <InstallBanner />
      </body>
    </html>
  );
}
