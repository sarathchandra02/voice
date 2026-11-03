import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus, ScanLine } from "lucide-react";
import type { ReaderDocument } from "../documents/base";
import { resolvePage } from "../documents/model";

export default function Reader({
  doc,
  page,
  navigate,
  onRendered,
}: {
  doc: ReaderDocument;
  page: number;
  navigate: (page: number) => void;
  onRendered: (page: number | null) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1.1);
  const minScale = doc.kind === "pdf" ? 0.5 : 0.1;
  useEffect(() => {
    if (doc.kind === "pdf") return;
    let cancelled = false;
    void doc
      .size(1)
      .then((size) => {
        if (!cancelled && !doc.disposed)
          setScale(
            Math.min(
              1.1,
              Math.max(
                0.1,
                ((scroller.current?.clientWidth || 650) - 56) / size.width,
              ),
            ),
          );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [doc]);
  const [entry, setEntry] = useState(String(page));
  const [mode, setMode] = useState<"pdf" | "book">("pdf");
  const [error, setError] = useState("");
  const [rendering, setRendering] = useState(true);
  const [text, setText] = useState("");
  const [label, setLabel] = useState(doc.labels[page - 1]);
  useEffect(() => {
    setEntry(mode === "pdf" ? String(page) : doc.labels[page - 1]);
    setLabel(doc.labels[page - 1]);
  }, [page, mode, doc]);
  useEffect(() => {
    const abort = new AbortController();
    const canvas = document.createElement("canvas");
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", `${doc.unit} ${page}`);
    setRendering(true);
    setError("");
    setText("");
    onRendered(null);
    host.current?.replaceChildren();
    if (scroller.current) scroller.current.scrollTop = 0;
    doc
      .render(page, canvas, scale, abort.signal)
      .then(() => {
        if (abort.signal.aborted) return;
        host.current?.replaceChildren(canvas);
        setRendering(false);
        onRendered(page);
      })
      .catch((error) => {
        if (!abort.signal.aborted) {
          setError(error.message || "This page could not be rendered.");
          setRendering(false);
        }
      });
    doc
      .text(page, abort.signal)
      .then((result) => {
        if (!abort.signal.aborted)
          setText(
            result.text +
              (result.clipped
                ? "\n[Text clipped at the extraction limit.]"
                : ""),
          );
      })
      .catch(() => {});
    return () => {
      abort.abort();
      canvas.width = 0;
      canvas.height = 0;
    };
  }, [doc, page, scale, onRendered]);
  function go(event: React.FormEvent) {
    event.preventDefault();
    try {
      const target = resolvePage(entry, mode, doc.labels, doc.unit);
      setError("");
      navigate(target);
    } catch (error) {
      setError((error as Error).message);
    }
  }
  return (
    <section className="reader" aria-label="Document reader">
      <div className="reader-toolbar">
        <div className="page-controls">
          <button
            className="icon-button"
            aria-label="Previous page"
            disabled={page === 1}
            onClick={() => navigate(page - 1)}
          >
            <ChevronLeft size={17} />
          </button>
          <form onSubmit={go} className="page-form">
            <select
              aria-label="Page numbering"
              value={mode}
              onChange={(e) => setMode(e.target.value as "pdf" | "book")}
            >
              <option value="pdf">
                {doc.kind === "docx" ? "Page" : doc.unit}
              </option>
              {doc.kind === "pdf" && <option value="book">Book label</option>}
            </select>
            <input
              aria-label="Page number"
              value={entry}
              onChange={(e) => setEntry(e.target.value)}
              maxLength={40}
            />
            <span className="page-total">/ {doc.pageCount}</span>
            <button className="text-button" type="submit">
              Go
            </button>
          </form>
          <button
            className="icon-button"
            aria-label="Next page"
            disabled={page === doc.pageCount}
            onClick={() => navigate(page + 1)}
          >
            <ChevronRight size={17} />
          </button>
        </div>
        <div className="zoom-controls">
          <button
            className="icon-button"
            aria-label="Zoom out"
            disabled={scale <= minScale}
            onClick={() => setScale(Math.max(minScale, scale - 0.2))}
          >
            <Minus size={16} />
          </button>
          <span>{Math.round(scale * 100)}%</span>
          <button
            className="icon-button"
            aria-label="Zoom in"
            disabled={scale >= 2.5}
            onClick={() => setScale(Math.min(2.5, scale + 0.2))}
          >
            <Plus size={16} />
          </button>
          <button
            className="icon-button"
            aria-label="Fit width"
            onClick={() => {
              const abort = new AbortController();
              doc
                .size(page)
                .then((p) => {
                  if (!doc.disposed && !abort.signal.aborted)
                    setScale(
                      Math.min(
                        2.5,
                        Math.max(
                          minScale,
                          ((scroller.current?.clientWidth || 650) - 56) /
                            p.width,
                        ),
                      ),
                    );
                })
                .catch(() => {
                  if (!doc.disposed)
                    setError("Could not fit this page. Try opening it again.");
                });
            }}
          >
            <ScanLine size={16} />
          </button>
        </div>
      </div>
      <div className="page-caption" data-testid="reader-position">
        {doc.labels[page - 1] ? `Book ${doc.labels[page - 1]} · ` : ""}
        {doc.unit} {page} of {doc.pageCount}
        <span>
          {rendering
            ? "Rendering…"
            : error
              ? "Check page request"
              : "Local document"}
        </span>
      </div>
      {doc.previewNote && (
        <p className="document-format-note" data-testid="format-note">
          {doc.previewNote}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="page-scroller" ref={scroller} data-testid="page-scroller">
        <div className="canvas-host" ref={host} />
        {rendering && <div className="render-placeholder">Opening page…</div>}
      </div>
      <div className="reader-bottom">
        <details>
          <summary>Selectable page text</summary>
          <p className="small muted">
            Extracted text fallback. Reading order may differ from the page
            layout.
          </p>
          <pre className="extracted-text">
            {text ||
              "No readable text on this page. Use its image for visual inspection."}
          </pre>
        </details>
        {doc.kind === "pdf" && (
          <details>
            <summary>Page numbering</summary>
            <p className="small muted">
              {doc.hasBookLabels
                ? "Book labels come from the PDF or your local corrections."
                : "This PDF has no book labels. Physical PDF numbers are shown. You can label individual pages locally."}
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                try {
                  doc.setLabel(page, label);
                  setEntry(mode === "book" ? label : String(page));
                  setError("");
                } catch (error) {
                  setError((error as Error).message);
                }
              }}
            >
              <label>
                Book label for PDF page {page}
                <input
                  aria-label="Correct book label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  maxLength={40}
                />
              </label>
              <button type="submit">Save label</button>
            </form>
          </details>
        )}
      </div>
    </section>
  );
}
