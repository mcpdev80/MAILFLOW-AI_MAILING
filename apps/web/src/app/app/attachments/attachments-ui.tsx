"use client";

import {
  type AttachmentDetail,
  type AttachmentFolder,
  attachmentDownloadUrl,
  sourceMailUrl,
} from "@/lib/attachments-api";
import { useI18n } from "@/lib/i18n";
import Link from "next/link";
import { useState } from "react";
import styles from "./attachments.module.css";
import { useAttachmentsPage } from "./use-attachments-page";

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 ** 2).toFixed(1)} MB`;
}

function FolderTree({
  folders,
  selected,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: {
  folders: AttachmentFolder[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  onCreate: (name: string, parentId?: string | null) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const roots = folders.filter((folder) => folder.parent_id == null);
  const renderFolder = (
    folder: AttachmentFolder,
    depth = 0,
  ): React.ReactNode => (
    <div key={folder.id}>
      <button
        className={`${styles.folderRow} ${selected === folder.id ? styles.folderActive : ""}`}
        style={{ paddingLeft: 10 + depth * 16 }}
        onClick={() => onSelect(folder.id)}
      >
        <span>▸</span>
        <span className={styles.folderName}>{folder.name}</span>
        <small>{folder.managed_by === "ai" ? "AI" : ""}</small>
      </button>
      {folders
        .filter((child) => child.parent_id === folder.id)
        .map((child) => renderFolder(child, depth + 1))}
    </div>
  );
  return (
    <aside className={styles.folderPanel}>
      <div className={styles.panelTitle}>{t("attachments.folders")}</div>
      <button
        className={`${styles.folderRow} ${selected == null ? styles.folderActive : ""}`}
        onClick={() => onSelect(null)}
      >
        {t("attachments.allDocuments")}
      </button>
      <div className={styles.folderList}>
        {roots.map((folder) => renderFolder(folder))}
      </div>
      {selected && (
        <div className={styles.folderActions}>
          <button
            onClick={() => {
              const current = folders.find((item) => item.id === selected);
              const next = window.prompt(
                t("attachments.rename"),
                current?.name ?? "",
              );
              if (next?.trim()) void onRename(selected, next.trim());
            }}
          >
            {t("attachments.rename")}
          </button>
          <button onClick={() => void onDelete(selected)}>
            {t("attachments.delete")}
          </button>
        </div>
      )}
      {creating ? (
        <form
          className={styles.newFolder}
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim()) return;
            void onCreate(name.trim(), selected).then(() => {
              setName("");
              setCreating(false);
            });
          }}
        >
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
            placeholder={t("attachments.newFolder")}
          />
          <div>
            <button type="submit">{t("attachments.save")}</button>
            <button type="button" onClick={() => setCreating(false)}>
              {t("attachments.cancel")}
            </button>
          </div>
        </form>
      ) : (
        <button
          className={styles.createFolder}
          onClick={() => setCreating(true)}
        >
          + {t("attachments.createFolder")}
        </button>
      )}
    </aside>
  );
}

function DetailPanel({
  detail,
  folders,
  onClose,
  onMove,
}: {
  detail: AttachmentDetail;
  folders: AttachmentFolder[];
  onClose: () => void;
  onMove: (folderId: string | null, remember: boolean) => Promise<void>;
}) {
  const { t } = useI18n();
  const [moveTo, setMoveTo] = useState(detail.folder_id ?? "");
  const [remember, setRemember] = useState(false);
  const isImage = detail.mime_type.startsWith("image/");
  const isPdf = detail.mime_type === "application/pdf";
  return (
    <section className={styles.detailPanel}>
      <div className={styles.detailHeader}>
        <div>
          <h2>{detail.canonical_filename}</h2>
          <p>
            {formatBytes(detail.size_bytes)} · {detail.mime_type}
          </p>
        </div>
        <button onClick={onClose} aria-label={t("attachments.cancel")}>
          ×
        </button>
      </div>
      <div className={styles.preview}>
        {isImage ? (
          <img
            src={attachmentDownloadUrl(detail.id)}
            alt={detail.canonical_filename}
          />
        ) : isPdf ? (
          <iframe
            src={attachmentDownloadUrl(detail.id)}
            title={detail.canonical_filename}
          />
        ) : detail.extracted_text ? (
          <pre>{detail.extracted_text}</pre>
        ) : (
          <p>{t("attachments.previewUnavailable")}</p>
        )}
      </div>
      <div className={styles.detailMeta}>
        <div>
          <span>{t("attachments.type")}</span>
          <strong>{detail.document_type ?? detail.mime_type}</strong>
        </div>
        <div>
          <span>{t("attachments.category")}</span>
          <strong>
            {[detail.category, detail.subcategory]
              .filter(Boolean)
              .join(" / ") || "—"}
          </strong>
        </div>
        <div>
          <span>{t("attachments.sources")}</span>
          <strong>
            {t("attachments.foundIn").replace(
              "{count}",
              String(detail.source_count),
            )}
          </strong>
        </div>
      </div>
      <div className={styles.moveBox}>
        <select
          value={moveTo}
          onChange={(event) => setMoveTo(event.target.value)}
        >
          <option value="">{t("attachments.noFolder")}</option>
          {folders.map((folder) => (
            <option value={folder.id} key={folder.id}>
              {folder.name}
            </option>
          ))}
        </select>
        <label>
          <input
            type="checkbox"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
          />{" "}
          {t("attachments.remember")}
        </label>
        <button
          className="btn"
          onClick={() => void onMove(moveTo || null, remember)}
        >
          {t("attachments.move")}
        </button>
      </div>
      <div className={styles.sources}>
        {detail.sources.map((source) => (
          <Link
            href={sourceMailUrl(source)}
            key={source.id}
            className={styles.sourceRow}
          >
            <span>
              <strong>{source.from_email}</strong>
              <small>{source.subject}</small>
            </span>
            <span>
              {source.received_at
                ? new Date(source.received_at).toLocaleDateString()
                : ""}
            </span>
          </Link>
        ))}
      </div>
      <a className="btn" href={attachmentDownloadUrl(detail.id)}>
        {t("attachments.download")}
      </a>
    </section>
  );
}

export function AttachmentsUI() {
  const { t } = useI18n();
  const state = useAttachmentsPage();
  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1>{t("attachments.title")}</h1>
          <p>{t("attachments.subtitle")}</p>
        </div>
        <input
          className={styles.search}
          value={state.query}
          onChange={(event) => state.setQuery(event.target.value)}
          placeholder={t("attachments.search")}
        />
      </div>
      {state.blocked.length > 0 && (
        <details className={styles.securityNotice}>
          <summary>
            {t("attachments.securityHidden").replace(
              "{count}",
              String(state.blocked.length),
            )}
          </summary>
          <div className={styles.blockedList}>
            <h3>{t("attachments.securityTitle")}</h3>
            <p>{t("attachments.securitySubtitle")}</p>
            {state.blocked.map((item) => (
              <div className={styles.blockedRow} key={item.id}>
                <span>
                  <strong>{item.source_filename}</strong>
                  <small>
                    {item.from_email} · {item.subject}
                  </small>
                </span>
                <span>
                  <small>{t("attachments.blockedReason")}</small>
                  {item.safety_reason ?? "—"}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
      {state.error && (
        <div className={styles.error}>
          {t("attachments.error")}: {state.error}
        </div>
      )}
      <div className={styles.workspace}>
        <FolderTree
          folders={state.folders}
          selected={state.folderId}
          onSelect={state.setFolderId}
          onCreate={state.createFolder}
          onRename={state.renameFolder}
          onDelete={state.deleteFolder}
        />
        <section className={styles.library}>
          {state.loading ? (
            <div className={styles.empty}>{t("attachments.loading")}</div>
          ) : state.documents.length === 0 ? (
            <div className={styles.empty}>{t("attachments.empty")}</div>
          ) : (
            <div className={styles.grid}>
              {state.documents.map((document) => (
                <button
                  key={document.id}
                  className={styles.card}
                  onClick={() => void state.openDocument(document.id)}
                >
                  <div className={styles.fileIcon}>
                    {document.mime_type === "application/pdf"
                      ? "PDF"
                      : document.mime_type.startsWith("image/")
                        ? "IMG"
                        : "DOC"}
                  </div>
                  <div className={styles.cardBody}>
                    <strong>{document.canonical_filename}</strong>
                    <span>{document.document_type ?? document.mime_type}</span>
                    <span>
                      {document.category ?? t("attachments.noFolder")}
                    </span>
                    <small>
                      {formatBytes(document.size_bytes)} ·{" "}
                      {t("attachments.foundIn").replace(
                        "{count}",
                        String(document.source_count),
                      )}
                    </small>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
        {state.selected && (
          <DetailPanel
            detail={state.selected}
            folders={state.folders}
            onClose={() => state.setSelected(null)}
            onMove={(folderId, remember) =>
              state.moveDocument(state.selected!.id, folderId, remember)
            }
          />
        )}
      </div>
    </main>
  );
}
