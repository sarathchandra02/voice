import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  Search,
  Image,
  ChevronRight,
} from "lucide-react";
import type { PdfDocument } from "../documents/pdf";
import type { ActivityDraft } from "./Companion";
import BookIndex from "./BookIndex";
import { resolvePage, type Coverage, type Source } from "../documents/model";

function Evidence({
  source,
  doc,
  navigate,
}: {
  source: Source;
  doc: PdfDocument;
  navigate: (page: number) => void;
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!source.image) return;
    const url = URL.createObjectURL(source.image);
    setUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [source]);
  return (
    <article className="evidence" data-testid="evidence">
      <div className="source-label">
        <span>
          {source.kind === "image" ? (
            <Image size={14} />
          ) : (
            <BookOpen size={14} />
          )}
          {source.label ? `Book ${source.label} · ` : ""}PDF {source.page}
        </span>
        <button
          title="Open this source in your reader"
          aria-label={`Open PDF page ${source.page} in reader`}
          className="icon-button"
          onClick={() => {
            if (source.documentId === doc.id && doc.sources.has(source.id))
              navigate(source.page);
          }}
        >
          <ArrowUpRight size={16} />
        </button>
      </div>
      {url && (
        <img src={url} alt={`Locally rendered PDF page ${source.page}`} />
      )}
      <p className="evidence-text">
        {source.text ||
          (source.kind === "text"
            ? "No readable text. Inspect this page as an image."
            : "Actual page image, prepared locally. No AI has inspected it.")}
      </p>
      {source.clipped && (
        <p className="small muted">Excerpt clipped. Open the page for more.</p>
      )}
    </article>
  );
}

export default function Research({
  doc,
  navigate,
  onActivity,
}: {
  doc: PdfDocument;
  navigate: (page: number) => void;
  onActivity: (event: ActivityDraft) => void;
}) {
  const [coverage, setCoverage] = useState<Coverage>({ ...doc.coverage });
  const [query, setQuery] = useState("");
  const [entry, setEntry] = useState("1");
  const [mode, setMode] = useState<"pdf" | "book">("pdf");
  const [sources, setSources] = useState<Source[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [cursor, setCursor] = useState<number | null>(null);
  const task = useRef<AbortController | null>(null);
  useEffect(
    () =>
      doc.subscribe(() => {
        setCoverage({ ...doc.coverage });
        setSources((items) =>
          items.filter((source) => doc.sources.has(source.id)),
        );
      }),
    [doc],
  );
  useEffect(() => () => task.current?.abort(), []);
  async function run(
    title: string,
    action: (signal: AbortSignal) => Promise<Source[]>,
  ) {
    task.current?.abort();
    const abort = new AbortController();
    task.current = abort;
    setBusy(true);
    onActivity({
      kind: "request",
      title,
      detail: "Manual lookup · local only",
    });
    setMessage("");
    setSources([]);
    try {
      const result = await action(abort.signal);
      if (!abort.signal.aborted) {
        setSources(result);
        onActivity({
          kind: "lookup",
          title: result.length ? "Sources retrieved" : "No text matches found",
          detail: result.length
            ? "Retrieved locally. Your reading position stayed in place. Nothing was sent to AI."
            : "The search covered indexed text only. Scans or unfinished indexing can leave gaps.",
          sources: result,
        });
        if (!result.length)
          setMessage(
            "No matches in the indexed text. Scans, incomplete indexing, or different wording can leave gaps.",
          );
      }
    } catch (error) {
      if (!abort.signal.aborted) {
        setMessage((error as Error).message);
        onActivity({
          kind: "error",
          title: "Lookup could not finish",
          detail: (error as Error).message,
        });
      }
    } finally {
      if (!abort.signal.aborted) setBusy(false);
    }
  }
  function inspect(kind: "text" | "image", forcedPage?: number) {
    void run(
      `${kind === "image" ? "View image" : "Read text"} · ${forcedPage !== undefined || mode === "pdf" ? "PDF page" : "book label"} ${forcedPage ?? entry}`,
      async (signal) => {
        const page = forcedPage ?? resolvePage(entry, mode, doc.labels);
        const source =
          kind === "image"
            ? await doc.image(page, signal)
            : await doc.read(page, signal);
        signal.throwIfAborted();
        setCursor(page);
        return [source];
      },
    );
  }
  const complete = coverage.processed === coverage.total;
  const gaps =
    coverage.unreadable + coverage.failed + coverage.clipped > 0 ||
    coverage.limited;
  return (
    <div className="research-body">
      <BookIndex
        doc={doc}
        coverage={coverage}
        inspect={(page) => inspect("text", page)}
      />
      <div className="section-heading">
        <h3>Explore the book</h3>
        <span>Independent of your view</span>
      </div>
      <form
        className="search-box"
        onSubmit={(e) => {
          e.preventDefault();
          setCursor(null);
          void run(`Search book: “${query.trim()}”`, async (signal) => {
            const pages = doc.index.search(query);
            const result = [];
            for (const page of pages) result.push(await doc.read(page, signal));
            return result;
          });
        }}
      >
        <Search size={17} />
        <input
          aria-label="Search the whole book"
          placeholder="Search the whole book…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          maxLength={200}
        />
        <button type="submit" disabled={!query.trim()} aria-label="Search book">
          <ChevronRight size={18} />
        </button>
      </form>
      <div className="index-status">
        <span>
          {complete
            ? gaps
              ? "All pages checked; search has gaps"
              : "All pages indexed"
            : `${coverage.paused ? "Paused" : "Indexing"} · ${coverage.processed}/${coverage.total} pages`}
        </span>
        {!complete && (
          <button
            className="text-button"
            onClick={() =>
              coverage.paused ? void doc.startIndex() : doc.pauseIndex()
            }
          >
            {coverage.paused ? "Resume" : "Pause"}
          </button>
        )}
      </div>
      <progress
        aria-label="Indexing progress"
        value={coverage.processed}
        max={coverage.total}
      />
      {(gaps || !complete) && (
        <p className="small muted">
          {coverage.unreadable} without text · {coverage.failed} failed ·{" "}
          {coverage.clipped} clipped
          {coverage.limited ? " · index capacity reached" : ""}. Direct page
          access remains available.
        </p>
      )}
      <details className="chapters">
        <summary>
          Chapters & bookmarks <span>{doc.chapters.length}</span>
        </summary>
        {doc.chapters.length ? (
          doc.chapters.map((chapter, i) => (
            <button
              key={i}
              className="chapter"
              onClick={() => {
                setMode("pdf");
                setEntry(String(chapter.page));
                inspect("text", chapter.page);
              }}
            >
              <BookOpen size={14} />
              <span>{chapter.title}</span>
              <small>{chapter.page}</small>
            </button>
          ))
        ) : (
          <p className="small muted">
            No PDF outline was found. Search the book or inspect pages directly.
            Automatic chapter and figure discovery is planned.
          </p>
        )}
      </details>
      <section className="inspect-box">
        <h3>Inspect another page</h3>
        <p className="small muted">
          Read or view a source without moving your reader.
        </p>
        <div className="inspect-entry">
          <select
            aria-label="Research page numbering"
            value={mode}
            onChange={(e) => setMode(e.target.value as "pdf" | "book")}
          >
            <option value="pdf">PDF page</option>
            <option value="book">Book label</option>
          </select>
          <input
            aria-label="Research page number"
            value={entry}
            onChange={(e) => setEntry(e.target.value)}
            maxLength={40}
          />
        </div>
        <div className="button-row">
          <button onClick={() => inspect("text")}>
            <BookOpen size={15} />
            Read text
          </button>
          <button onClick={() => inspect("image")}>
            <Image size={15} />
            View image
          </button>
        </div>
        {cursor !== null && cursor < doc.pdf.numPages && (
          <button
            className="text-button next-research"
            onClick={() => {
              setMode("pdf");
              setEntry(String(cursor + 1));
              inspect("text", cursor + 1);
            }}
          >
            Inspect next page <ChevronRight size={14} />
          </button>
        )}
      </section>
      {busy && (
        <p role="status" className="small">
          Retrieving locally…{" "}
          <button
            className="text-button"
            onClick={() => {
              task.current?.abort();
              setBusy(false);
              setMessage("Retrieval canceled.");
              onActivity({
                kind: "error",
                title: "Lookup canceled",
                detail: "No new source was added.",
              });
            }}
          >
            Cancel
          </button>
        </p>
      )}
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      <div className="evidence-list">
        {sources.map((source) => (
          <Evidence
            key={source.id}
            source={source}
            doc={doc}
            navigate={navigate}
          />
        ))}
      </div>
    </div>
  );
}
