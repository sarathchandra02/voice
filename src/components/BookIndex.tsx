import { useMemo, useState } from "react";
import { BookOpen, ChevronLeft, ChevronRight } from "lucide-react";
import type { ReaderDocument } from "../documents/base";
import type { Coverage } from "../documents/model";

function Pager({
  offset,
  total,
  change,
}: {
  offset: number;
  total: number;
  change: (value: number) => void;
}) {
  return (
    <div className="index-pager">
      <button
        className="icon-button"
        aria-label="Previous index entries"
        disabled={offset === 0}
        onClick={() => change(Math.max(0, offset - 20))}
      >
        <ChevronLeft size={15} />
      </button>
      <span>
        {total
          ? `${offset + 1}–${Math.min(offset + 20, total)} of ${total}`
          : "No entries"}
      </span>
      <button
        className="icon-button"
        aria-label="Next index entries"
        disabled={offset + 20 >= total}
        onClick={() => change(offset + 20)}
      >
        <ChevronRight size={15} />
      </button>
    </div>
  );
}

export default function BookIndex({
  doc,
  coverage,
  inspect,
}: {
  doc: ReaderDocument;
  coverage: Coverage;
  inspect: (page: number) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="book-index"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>
        <BookOpen size={15} />
        About this book <span>Chapters, pages & terms</span>
      </summary>
      {open && (
        <IndexContents doc={doc} coverage={coverage} inspect={inspect} />
      )}
    </details>
  );
}

function IndexContents({
  doc,
  coverage,
  inspect,
}: {
  doc: ReaderDocument;
  coverage: Coverage;
  inspect: (page: number) => void;
}) {
  const [section, setSection] = useState<"chapters" | "pages" | "terms">(
    "chapters",
  );
  const [filter, setFilter] = useState("");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState("");
  const [pageOffset, setPageOffset] = useState(0);
  // Refresh the vocabulary in batches, or immediately when indexing pauses/ends.
  const revision =
    coverage.paused || coverage.processed === coverage.total
      ? coverage.processed
      : Math.floor(coverage.processed / 25) * 25;
  const terms = useMemo(
    () => doc.index.listTerms(filter, offset),
    [doc, filter, offset, revision],
  );
  const matches = selected
    ? doc.index.termPages(selected, pageOffset)
    : { total: 0, pages: [] };
  const pageMap = doc.labels
    .map((label, i) => ({ label, page: i + 1 }))
    .filter(
      (item) =>
        !filter.trim() ||
        String(item.page) === filter.trim() ||
        item.label.toLowerCase().includes(filter.trim().toLowerCase()),
    );
  const complete = coverage.processed === coverage.total;
  const gaps =
    coverage.unreadable > 0 ||
    coverage.failed > 0 ||
    coverage.clipped > 0 ||
    coverage.limited;
  function switchSection(next: typeof section) {
    setSection(next);
    setFilter("");
    setOffset(0);
    setSelected("");
    setPageOffset(0);
  }
  function pageLink(page: number) {
    return (
      <button
        key={page}
        className="index-page-link"
        aria-label={`Inspect indexed ${doc.unit} ${page}`}
        onClick={() => inspect(page)}
      >
        <span>
          {doc.shortUnit} {page}
        </span>
        <small>
          {doc.labels[page - 1]
            ? `Book ${doc.labels[page - 1]}`
            : doc.kind === "pdf"
              ? "Book label unknown"
              : doc.kind === "docx"
                ? "Generated reading page"
                : "Slide position"}
        </small>
        <ChevronRight size={13} />
      </button>
    );
  }
  return (
    <div className="book-index-body">
      <p className="book-index-name">{doc.name}</p>
      <p className="small muted">
        {doc.pageCount.toLocaleString("en-US")} {doc.unit.toLowerCase()}s ·{" "}
        {doc.chapters.length}{" "}
        {doc.kind === "pdf" ? "PDF bookmarks" : "outline entries"}
      </p>
      <div
        className="index-sections"
        role="group"
        aria-label="Book index section"
      >
        {(["chapters", "pages", "terms"] as const).map((name) => (
          <button
            key={name}
            aria-pressed={section === name}
            onClick={() => switchSection(name)}
          >
            {name === "terms"
              ? "Topics & terms"
              : name === "pages"
                ? "Page map"
                : "Chapters"}
          </button>
        ))}
      </div>
      <p className="index-coverage" role="status">
        {coverage.processed}/{coverage.total} pages checked ·{" "}
        {complete
          ? gaps
            ? "Text index has gaps"
            : "Text traversal complete"
          : coverage.paused
            ? "Indexing paused"
            : "Indexing in progress"}
      </p>
      {section === "chapters" && (
        <div>
          <p className="small muted">
            {doc.kind === "pdf"
              ? "From the PDF’s outline. This may be incomplete; chapters are not inferred from the text yet."
              : "From slide titles or Word headings. Source locations refer to this preview."}
          </p>
          {doc.chapters.length ? (
            doc.chapters.map((chapter, i) => (
              <button
                key={i}
                className="index-chapter"
                onClick={() => inspect(chapter.page)}
              >
                <span>{chapter.title}</span>
                <small>
                  {doc.shortUnit} {chapter.page}
                  {doc.labels[chapter.page - 1]
                    ? ` · Book ${doc.labels[chapter.page - 1]}`
                    : ""}
                </small>
              </button>
            ))
          ) : (
            <p className="notice">
              No chapter outline is embedded. Use the page map or term index.
            </p>
          )}
        </div>
      )}
      {section === "pages" && (
        <div>
          <label className="index-filter">
            Find a page or book label
            <input
              aria-label="Filter page map"
              value={filter}
              maxLength={40}
              onChange={(e) => {
                setFilter(e.target.value);
                setOffset(0);
              }}
            />
          </label>
          <p className="small muted">
            {doc.kind === "pdf"
              ? "Book labels come from PDF metadata or your corrections. Repeated labels keep their separate physical pages."
              : doc.previewNote}
          </p>
          <div className="index-page-list">
            {pageMap
              .slice(offset, offset + 20)
              .map((item) => pageLink(item.page))}
          </div>
          <Pager offset={offset} total={pageMap.length} change={setOffset} />
        </div>
      )}
      {section === "terms" && (
        <div>
          <p className="small muted">
            A keyword-based index of extracted words, not an AI concept map. It
            does not infer meanings, synonyms, or diagrams. Scans and incomplete
            extraction can leave gaps.
          </p>
          <label className="index-filter">
            Find an indexed term
            <input
              aria-label="Filter indexed terms"
              value={filter}
              maxLength={100}
              onChange={(e) => {
                setFilter(e.target.value);
                setOffset(0);
                setSelected("");
                setPageOffset(0);
              }}
            />
          </label>
          {selected ? (
            <div>
              <button
                className="text-button"
                onClick={() => {
                  setSelected("");
                  setPageOffset(0);
                }}
              >
                <ChevronLeft size={13} />
                Back to terms
              </button>
              <h4 className="selected-term">
                {selected}
                <small>{matches.total} pages</small>
              </h4>
              <div className="index-page-list">
                {matches.pages.map(pageLink)}
              </div>
              <Pager
                offset={pageOffset}
                total={matches.total}
                change={setPageOffset}
              />
            </div>
          ) : (
            <div className="term-list">
              {terms.entries.map((item) => (
                <button
                  key={item.term}
                  onClick={() => {
                    setSelected(item.term);
                    setPageOffset(0);
                  }}
                >
                  <span>{item.term}</span>
                  <small>
                    {item.count} {item.count === 1 ? "page" : "pages"}
                  </small>
                  <ChevronRight size={12} />
                </button>
              ))}
              <Pager offset={offset} total={terms.total} change={setOffset} />
              {!terms.total && (
                <p className="small muted">
                  No matching extracted terms yet. This does not establish that
                  the concept is absent from the book.
                </p>
              )}
            </div>
          )}
        </div>
      )}
      <p className="small muted">
        Selecting a source inspects it below. Your reader stays in place.
      </p>
    </div>
  );
}
