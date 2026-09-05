"use client";

import { type MessageSearchResult, dashboardApi } from "@/lib/dashboard-api";
import { enumLabel, useI18n } from "@/lib/i18n";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

function initialValue(params: URLSearchParams, key: string): string {
  return params.get(key) ?? "";
}

export default function SearchPage() {
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const initial = useMemo(
    () => new URLSearchParams(searchParams.toString()),
    [searchParams],
  );
  const [filters, setFilters] = useState(() => ({
    q: initialValue(initial, "q"),
    sender: initialValue(initial, "sender"),
    account_id: initialValue(initial, "account_id"),
    category: initialValue(initial, "category"),
    subcategory: initialValue(initial, "subcategory"),
    importance: initialValue(initial, "importance"),
    urgency: initialValue(initial, "urgency"),
    action_required: initialValue(initial, "action_required"),
    review_required: initialValue(initial, "review_required"),
    suspicious_content: initialValue(initial, "suspicious_content"),
    tag: initialValue(initial, "tag"),
    destination_folder: initialValue(initial, "destination_folder"),
    classification_source: initialValue(initial, "classification_source"),
    processed_state: initialValue(initial, "processed_state"),
    date_from: initialValue(initial, "date_from"),
    date_to: initialValue(initial, "date_to"),
  }));
  const [result, setResult] = useState<MessageSearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const runSearch = useCallback(
    async (next = filters) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(next)) {
          if (value) params.set(key, value);
        }
        params.set("limit", "100");
        setResult(await dashboardApi.search(params));
        window.history.replaceState(
          null,
          "",
          `/app/search?${params.toString()}`,
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Search failed");
      } finally {
        setLoading(false);
      }
    },
    [filters],
  );

  const initialSearchDone = useRef(false);

  useEffect(() => {
    if (initialSearchDone.current) return;
    initialSearchDone.current = true;
    runSearch(filters);
  }, [filters, runSearch]);

  function setFilter(key: keyof typeof filters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  return (
    <main className="container">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "1rem",
          alignItems: "center",
        }}
      >
        <div>
          <h1>Search</h1>
          <p className="muted">
            Metadata and classification state across your authorized mailboxes.
          </p>
        </div>
        <Link className="btn secondary" href="/app/dashboard">
          {t("nav.dashboard")}
        </Link>
      </div>

      {error && <div className="alert error">{error}</div>}

      <section className="card">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
            gap: "0.65rem",
          }}
        >
          <label className="field">
            <span>Sender / subject</span>
            <input
              value={filters.q}
              onChange={(event) => setFilter("q", event.target.value)}
            />
          </label>
          <label className="field">
            <span>Sender</span>
            <input
              value={filters.sender}
              onChange={(event) => setFilter("sender", event.target.value)}
            />
          </label>
          <label className="field">
            <span>{t("review.category")}</span>
            <select
              value={filters.category}
              onChange={(event) => setFilter("category", event.target.value)}
            >
              <option value="">All</option>
              {[
                "work",
                "private",
                "finance",
                "orders",
                "appointments",
                "newsletters",
                "notifications",
                "other",
              ].map((value) => (
                <option key={value} value={value}>
                  {enumLabel(t, "category", value)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t("review.importance")}</span>
            <select
              value={filters.importance}
              onChange={(event) => setFilter("importance", event.target.value)}
            >
              <option value="">All</option>
              {["critical", "high", "normal", "low", "unknown"].map((value) => (
                <option key={value} value={value}>
                  {enumLabel(t, "importance", value)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t("review.urgency")}</span>
            <select
              value={filters.urgency}
              onChange={(event) => setFilter("urgency", event.target.value)}
            >
              <option value="">All</option>
              {["immediate", "today", "this_week", "none", "unknown"].map(
                (value) => (
                  <option key={value} value={value}>
                    {enumLabel(t, "urgency", value)}
                  </option>
                ),
              )}
            </select>
          </label>
          <label className="field">
            <span>{t("review.actionRequired")}</span>
            <select
              value={filters.action_required}
              onChange={(event) =>
                setFilter("action_required", event.target.value)
              }
            >
              <option value="">All</option>
              {["yes", "no", "unknown"].map((value) => (
                <option key={value} value={value}>
                  {enumLabel(t, "action_required", value)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Review</span>
            <select
              value={filters.review_required}
              onChange={(event) =>
                setFilter("review_required", event.target.value)
              }
            >
              <option value="">All</option>
              <option value="true">Required</option>
              <option value="false">Not required</option>
            </select>
          </label>
          <label className="field">
            <span>Security</span>
            <select
              value={filters.suspicious_content}
              onChange={(event) =>
                setFilter("suspicious_content", event.target.value)
              }
            >
              <option value="">All</option>
              <option value="true">Suspicious</option>
              <option value="false">Normal</option>
            </select>
          </label>
          <label className="field">
            <span>Classification source</span>
            <select
              value={filters.classification_source}
              onChange={(event) =>
                setFilter("classification_source", event.target.value)
              }
            >
              <option value="">All</option>
              <option value="decision_memory">DecisionMemory</option>
              <option value="fast_model">Fast model</option>
              <option value="deep_model">Deep model</option>
            </select>
          </label>
          <label className="field">
            <span>Tag</span>
            <input
              value={filters.tag}
              onChange={(event) => setFilter("tag", event.target.value)}
            />
          </label>
          <label className="field">
            <span>Destination folder</span>
            <input
              value={filters.destination_folder}
              onChange={(event) =>
                setFilter("destination_folder", event.target.value)
              }
            />
          </label>
          <label className="field">
            <span>From</span>
            <input
              type="date"
              value={filters.date_from}
              onChange={(event) => setFilter("date_from", event.target.value)}
            />
          </label>
          <label className="field">
            <span>To</span>
            <input
              type="date"
              value={filters.date_to}
              onChange={(event) => setFilter("date_to", event.target.value)}
            />
          </label>
        </div>
        <button
          type="button"
          className="btn"
          style={{ marginTop: "0.75rem" }}
          disabled={loading}
          onClick={() => runSearch()}
        >
          {loading ? t("common.loading") : "Search"}
        </button>
      </section>

      <div style={{ margin: "1rem 0" }}>
        <strong>{result?.total ?? 0}</strong> results
      </div>

      <div style={{ display: "grid", gap: "0.65rem" }}>
        {result?.items.map((item) => (
          <article className="card" key={item.id}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "1rem",
                flexWrap: "wrap",
              }}
            >
              <div>
                <strong>{item.subject || t("review.noSubject")}</strong>
                <div className="muted">
                  {item.from_email} · {item.account_label} ·{" "}
                  {new Date(item.processed_at).toLocaleString()}
                </div>
              </div>
              <Link
                className="btn secondary"
                href={`/app/mail?account=${encodeURIComponent(item.account_id)}&folder=${encodeURIComponent(item.folder)}&uid=${item.uid}`}
              >
                {t("review.openMessage")}
              </Link>
            </div>
            <div
              style={{
                display: "flex",
                gap: "0.4rem",
                flexWrap: "wrap",
                marginTop: "0.6rem",
              }}
            >
              <span className="pill">
                {enumLabel(t, "category", item.category)}
              </span>
              <span className="pill">
                {enumLabel(t, "importance", item.importance)}
              </span>
              <span className="pill">
                {enumLabel(t, "urgency", item.urgency)}
              </span>
              <span className="pill">{item.classification_source}</span>
              <span className="pill">{item.processed_state}</span>
              {item.review_required && <span className="pill">Review</span>}
              {item.suspicious_content && (
                <span className="pill off">Security</span>
              )}
            </div>
            <div className="muted" style={{ marginTop: "0.45rem" }}>
              {item.destination_folder}
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
