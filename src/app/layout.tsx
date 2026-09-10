import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { Toaster } from "@/components/ui/sonner";
import { FocusModeProvider } from "@/components/focus-mode";
import { WebVitals } from "@/components/web-vitals";
import { HtmlLocaleSync } from "@/components/html-locale-sync";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

export const unstable_instant = false;

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export const metadata: Metadata = {
  title: "management-platform",
  description: "Wiki, Buchhaltung und Projektkoordination in einer App",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="de"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <NextIntlClientProvider>
            <HtmlLocaleSync />
            <FocusModeProvider>{children}</FocusModeProvider>
          </NextIntlClientProvider>
          <WebVitals />
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
