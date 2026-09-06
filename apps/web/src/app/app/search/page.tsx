"use client";

import { useI18n } from "@/lib/i18n";
import { Suspense } from "react";
import { SearchFiltersPanel, SearchResults } from "./search-ui";
import styles from "./search.module.css";
import { useSearchPage } from "./use-search-page";

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <main className={styles.page}>
          <p className="muted">…</p>
        </main>
      }
    >
      <SearchPageContent />
    </Suspense>
  );
}

function SearchPageContent() {
  const { t } = useI18n();
  const search = useSearchPage();
  return (
    <main className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <h1>{t("search.advanced")}</h1>
          <p>{t("search.description")}</p>
        </div>
        <button type="button" className="btn" onClick={search.reset}>
          {t("search.new")}
        </button>
      </header>
      {search.error && <div className={styles.error}>{search.error}</div>}
      <SearchFiltersPanel
        filters={search.filters}
        accounts={search.accounts}
        loading={search.loading}
        setFilter={search.setFilter}
        onSearch={() => search.runSearch(search.filters)}
        onReset={search.reset}
        t={t}
      />
      <SearchResults result={search.result} t={t} />
    </main>
  );
}
