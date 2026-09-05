"use client";

import { useI18n } from "@/lib/i18n";
import Link from "next/link";
import { SearchFiltersPanel, SearchResults } from "./search-ui";
import { useSearchPage } from "./use-search-page";

export default function SearchPage() {
  const { t } = useI18n();
  const search = useSearchPage();
  return (
    <main className="container">
      <header className="page-header">
        <div>
          <h1>{t("search.title")}</h1>
          <p className="muted">{t("search.description")}</p>
        </div>
        <Link className="btn secondary" href="/app/dashboard">
          {t("nav.dashboard")}
        </Link>
      </header>
      {search.error && <div className="alert error">{search.error}</div>}
      <SearchFiltersPanel
        filters={search.filters}
        accounts={search.accounts}
        loading={search.loading}
        setFilter={search.setFilter}
        onSearch={() => search.runSearch(search.filters)}
        t={t}
      />
      <SearchResults result={search.result} t={t} />
    </main>
  );
}
