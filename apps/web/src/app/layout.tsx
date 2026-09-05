import { I18nProvider } from "@/lib/i18n";
import { WorkspacePreferencesProvider } from "@/lib/workspace-preferences";
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
        <I18nProvider>
          <WorkspacePreferencesProvider>{children}</WorkspacePreferencesProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
