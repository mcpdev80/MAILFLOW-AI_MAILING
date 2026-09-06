"use client";

import {
  type AttachmentDetail,
  type AttachmentDocument,
  type AttachmentFolder,
  attachmentDownloadUrl,
  sourceMailUrl,
} from "@/lib/attachments-api";
import { useI18n } from "@/lib/i18n";
import Link from "next/link";
import { useMemo, useState } from "react";
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
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const roots = folders.filter((folder) => folder.parent_id == null);

  const startRename = (folder: AttachmentFolder) => {
    setRenamingId(folder.id);
    setRenameValue(folder.name);
  };

  const renderFolder = (
    folder: AttachmentFolder,
    depth = 0,
  ): React.ReactNode => (
    <div key={folder.id} className={styles.folderEntry}>
      {renamingId === folder.id ? (
        <form
          className={styles.inlineRename}
          style={{ marginLeft: depth * 16 }}
          onSubmit={(event) => {
            event.preventDefault();
            if (!renameValue.trim()) return;
            void onRename(folder.id, renameValue.trim()).then(() => {
              setRenamingId(null);
              setRenameValue("");
            });
          }}
        >
          <input
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            aria-label={t("attachments.rename")}
          />
          <button type="submit">{t("attachments.save")}</button>
          <button type="button" onClick={() => setRenamingId(null)}>
            {t("attachments.cancel")}
          </button>
        </form>
      ) : (
        <div className={styles.folderLine}>
          <button
            type="button"
            className={`${styles.folderRow} ${selected === folder.id ? styles.folderActive : ""}`}
            style={{ paddingLeft: 10 + depth * 16 }}
            onClick={() => onSelect(folder.id)}
          >
            <span aria-hidden="true">▸</span>
            <span className={styles.folderName}>{folder.name}</span>
            <small>
              {folder.managed_by === "ai" ? t("attachments.aiBadge") : ""}
            </small>
          </button>
          {folder.managed_by !== "ai" && (
            <details className={styles.folderMenu}>
              <summary aria-label={t("attachments.folderActions")}>•••</summary>
              <div className={styles.contextMenu}>
                <button type="button" onClick={() => startRename(folder)}>
                  {t("attachments.rename")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(folder.id);
                    setCreating(true);
                  }}
                >
                  {t("attachments.createSubfolder")}
                </button>
                <button
                  type="button"
                  className={styles.destructive}
                  onClick={() => void onDelete(folder.id)}
                >
                  {t("attachments.delete")}
                </button>
              </div>
            </details>
          )}
        </div>
      )}
      {folders
        .filter((child) => child.parent_id === folder.id)
        .map((child) => renderFolder(child, depth + 1))}
    </div>
  );

  return (
    <aside className={styles.folderPanel}>
      <div className={styles.panelTitle}>{t("attachments.folders")}</div>
      <button
        type="button"
        className={`${styles.folderRow} ${selected == null ? styles.folderActive : ""}`}
        onClick={() => onSelect(null)}
      >
        {t("attachments.allDocuments")}
      </button>
      <div className={styles.folderList}>
        {roots.map((folder) => renderFolder(folder))}
      </div>
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
            placeholder={t("attachments.newFolder")}
            aria-label={t("attachments.newFolder")}
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
          type="button"
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
    <section
      className={styles.detailPanel}
      aria-label={t("attachments.details")}
    >
      <div className={styles.detailHeader}>
        <div>
          <h2>{detail.canonical_filename}</h2>
          <p>
            {formatBytes(detail.size_bytes)} · {detail.mime_type}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("attachments.cancel")}
        >
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
      {detail.tags.length > 0 && (
        <div className={styles.tags}>
          {detail.tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
      )}
      <div className={styles.moveBox}>
        <label htmlFor="attachment-folder-picker">
          {t("attachments.organizeIn")}
        </label>
        <select
          id="attachment-folder-picker"
          value={moveTo}
          onChange={(event) => setMoveTo(event.target.value)}
        >
          <option value="">{t("attachments.noFolder")}</option>
          {folders.map((folder) => (
            <option value={folder.id} key={folder.id}>
              {folder.managed_by === "ai" ? "AI · " : ""}
              {folder.name}
            </option>
          ))}
        </select>
        <label>
          <input
            type="checkbox"
            checked={remember}
            disabled={!moveTo}
            onChange={(event) => setRemember(event.target.checked)}
          />{" "}
          {t("attachments.remember")}
        </label>
        <button
          type="button"
          className="btn"
          onClick={() =>
            void onMove(moveTo || null, Boolean(moveTo) && remember)
          }
        >
          {t("attachments.move")}
        </button>
      </div>
      <div className={styles.sources}>
        <h3>{t("attachments.sources")}</h3>
        {detail.sources.map((source) => (
          <Link
            href={sourceMailUrl(source)}
            key={source.id}
            className={styles.sourceRow}
          >
            <span>
              <strong>{source.from_email}</strong>
              <small>{source.subject}</small>
              <small>{source.source_filename}</small>
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

function DocumentCard({
  document,
  onOpen,
}: {
  document: AttachmentDocument;
  onOpen: () => void;
}) {
  const { t } = useI18n();
  return (
    <button type="button" className={styles.card} onClick={onOpen}>
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
        <span>{document.category ?? t("attachments.noFolder")}</span>
        <small>
          {formatBytes(document.size_bytes)} ·{" "}
          {t("attachments.foundIn").replace(
            "{count}",
            String(document.source_count),
          )}
        </small>
      </div>
    </button>
  );
}

export function AttachmentsUI() {
  const { t } = useI18n();
  const state = useAttachmentsPage();
  const selected = state.selected;
  const categoryOptions = useMemo(
    () =>
      [
        ...new Set(
          state.documents.map((item) => item.category).filter(Boolean),
        ),
      ].sort((left, right) =>
        String(left).localeCompare(String(right)),
      ) as string[],
    [state.documents],
  );
  const typeOptions = useMemo(
    () =>
      [
        ...new Set(
          state.documents.map((item) => item.document_type).filter(Boolean),
        ),
      ].sort((left, right) =>
        String(left).localeCompare(String(right)),
      ) as string[],
    [state.documents],
  );

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
          aria-label={t("attachments.search")}
        />
      </div>

      <div className={styles.toolbar}>
        <div className={styles.filters}>
          <select
            value={state.category ?? ""}
            onChange={(event) => state.setCategory(event.target.value || null)}
            aria-label={t("attachments.category")}
          >
            <option value="">{t("attachments.allCategories")}</option>
            {categoryOptions.map((value) => (
              <option value={value} key={value}>
                {value}
              </option>
            ))}
          </select>
          <select
            value={state.documentType ?? ""}
            onChange={(event) =>
              state.setDocumentType(event.target.value || null)
            }
            aria-label={t("attachments.type")}
          >
            <option value="">{t("attachments.allTypes")}</option>
            {typeOptions.map((value) => (
              <option value={value} key={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.viewToggle} aria-label={t("attachments.view")}>
          <button
            type="button"
            className={state.view === "grid" ? styles.viewActive : ""}
            onClick={() => state.setView("grid")}
            aria-pressed={state.view === "grid"}
          >
            {t("attachments.grid")}
          </button>
          <button
            type="button"
            className={state.view === "list" ? styles.viewActive : ""}
            onClick={() => state.setView("list")}
            aria-pressed={state.view === "list"}
          >
            {t("attachments.list")}
          </button>
        </div>
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
                  <small>
                    {item.received_at
                      ? new Date(item.received_at).toLocaleString()
                      : ""}
                  </small>
                </span>
                <span>
                  <small>{t("attachments.blockedReason")}</small>
                  {item.safety_reason ?? "—"}
                  <Link href={sourceMailUrl(item)}>
                    {t("attachments.openSource")}
                  </Link>
                </span>
              </div>
            ))}
          </div>
        </details>
      )}

      {state.savedDecision && (
        <div className={styles.toast} role="status">
          {t("attachments.decisionSaved")}
        </div>
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
            <div className={styles.empty}>
              <strong>{t("attachments.empty")}</strong>
              <span>{t("attachments.emptyHint")}</span>
            </div>
          ) : state.view === "grid" ? (
            <div className={styles.grid}>
              {state.documents.map((document) => (
                <DocumentCard
                  key={document.id}
                  document={document}
                  onOpen={() => void state.openDocument(document.id)}
                />
              ))}
            </div>
          ) : (
            <div className={styles.documentList}>
              {state.documents.map((document) => (
                <button
                  type="button"
                  className={styles.listRow}
                  key={document.id}
                  onClick={() => void state.openDocument(document.id)}
                >
                  <strong>{document.canonical_filename}</strong>
                  <span>{document.document_type ?? document.mime_type}</span>
                  <span>{document.category ?? t("attachments.noFolder")}</span>
                  <span>{formatBytes(document.size_bytes)}</span>
                  <span>
                    {t("attachments.foundIn").replace(
                      "{count}",
                      String(document.source_count),
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
        {selected && (
          <DetailPanel
            detail={selected}
            folders={state.folders}
            onClose={() => state.setSelected(null)}
            onMove={(folderId, remember) =>
              state.moveDocument(selected.id, folderId, remember)
            }
          />
        )}
      </div>
    </main>
  );
}
