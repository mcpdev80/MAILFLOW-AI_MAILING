import { AppearanceProvider } from "@/lib/appearance-preferences";
import { I18nProvider } from "@/lib/i18n";
import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist",
});

export const metadata: Metadata = {
  title: "MailFlow",
  description: "Open source AI email assistant",
};

export default function RootLayout({
  children,
}: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={geist.variable}>
        <AppearanceProvider>
          <I18nProvider>
            <Suspense fallback={null}>{children}</Suspense>
          </I18nProvider>
        </AppearanceProvider>
      </body>
    </html>
  );
}
