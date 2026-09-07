import { AppearanceProvider } from "@/lib/appearance-preferences";
import { I18nProvider } from "@/lib/i18n";
import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-manrope",
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
      <body className={manrope.variable}>
        <AppearanceProvider>
          <I18nProvider>
            <Suspense fallback={null}>{children}</Suspense>
          </I18nProvider>
        </AppearanceProvider>
      </body>
    </html>
  );
}
