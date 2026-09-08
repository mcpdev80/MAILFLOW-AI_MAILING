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

const appearanceBootstrapScript = `
(() => {
  try {
    const raw = localStorage.getItem("mailflow.appearance");
    const stored = raw ? JSON.parse(raw) : null;
    const theme = stored?.theme === "light" || stored?.theme === "dark" || stored?.theme === "system"
      ? stored.theme
      : "system";
    const density = stored?.density === "compact" || stored?.density === "comfortable"
      ? stored.density
      : "comfortable";
    const resolvedTheme = theme === "system"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : theme;
    const root = document.documentElement;
    root.dataset.theme = resolvedTheme;
    root.dataset.density = density;
    root.style.colorScheme = resolvedTheme;
  } catch {
    const resolvedTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    const root = document.documentElement;
    root.dataset.theme = resolvedTheme;
    root.dataset.density = "comfortable";
    root.style.colorScheme = resolvedTheme;
  }
})();`;

export const metadata: Metadata = {
  title: "MailFlow",
  description: "Open source AI email assistant",
};

export default function RootLayout({
  children,
}: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: appearanceBootstrapScript }} />
      </head>
      <body className={`${geist.className} ${geist.variable}`}>
        <AppearanceProvider>
          <I18nProvider>
            <Suspense fallback={null}>{children}</Suspense>
          </I18nProvider>
        </AppearanceProvider>
      </body>
    </html>
  );
}
