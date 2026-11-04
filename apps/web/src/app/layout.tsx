import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { ThemeProvider } from "@/components/theme-provider";
import { assetUrl } from "@/lib/base-path";
import "./globals.css";

export const metadata: Metadata = {
  title: "MoneyTrack",
  description: "מערכת לניהול ומעקב הוצאות משק בית",
  icons: {
    icon: [
      { url: assetUrl("/favicon.ico") },
      { url: assetUrl("/brand/icon-192.png"), sizes: "192x192", type: "image/png" },
      { url: assetUrl("/brand/icon-512.png"), sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: assetUrl("/brand/apple-touch-icon.png"), sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6f9" },
    { media: "(prefers-color-scheme: dark)", color: "#071428" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // 'strict-dynamic' in the CSP means even same-origin scripts need the nonce.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html dir="rtl" lang="he" suppressHydrationWarning>
      <head>
        {/* React intentionally drops the nonce on the client, so skip the diff. */}
        <script src={assetUrl("/theme-init.js")} nonce={nonce} suppressHydrationWarning />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
