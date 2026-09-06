import { AppearanceProvider } from "@/lib/appearance-preferences";
import { I18nProvider } from "@/lib/i18n";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MailFlow",
  description: "Open source AI email assistant",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <AppearanceProvider>
          <I18nProvider>{children}</I18nProvider>
        </AppearanceProvider>
      </body>
    </html>
  );
}
