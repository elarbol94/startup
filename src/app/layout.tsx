import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { Toaster } from "@/components/ui/sonner";
import { WebVitals } from "@/components/web-vitals";
import { HtmlLocaleSync } from "@/components/html-locale-sync";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

export const instant = false;

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export const metadata: Metadata = {
  title: "Management-Plattform",
  description: "Wiki, Buchhaltung und Projektkoordination in einer App",
  icons: { apple: "/app-icon/apple" },
  appleWebApp: { capable: true, statusBarStyle: "default" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="de"
      data-theme="1b"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <head>
        {/* Not metadata.manifest: the manifest must be fetched with cookies to pass
            Cloudflare Access (see src/app/app.webmanifest/route.ts). */}
        <link rel="manifest" href="/app.webmanifest" crossOrigin="use-credentials" />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <NextIntlClientProvider>
            <HtmlLocaleSync />
            {children}
          </NextIntlClientProvider>
          <WebVitals />
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
